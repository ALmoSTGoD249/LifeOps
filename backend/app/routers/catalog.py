import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.models_catalog import CatalogCategory, CatalogFormField, CatalogItem, CatalogTaskTemplate
from app.models_requests import RequestedItem
from app.routers.incidents import _user
from app.schemas_catalog import CategoryIn, ItemIn
from app.services.audit import log_activity
from app.services.requests import ASSIGNEE_MODES, FIELD_TYPES  # noqa: F401

router = APIRouter(prefix="/catalog", tags=["catalog"])


def item_out(i: CatalogItem, full: bool = True) -> dict:
    d = {"id": i.id, "category": {"id": i.category.id, "name": i.category.name}, "name": i.name, "description": i.description, "icon": i.icon,
         "estimated_hours": i.estimated_hours, "is_active": i.is_active, "approval_required": i.approval_required, "sequential": i.sequential,
         "approver_id": i.approver_id, "default_assignee_id": i.default_assignee_id, "field_count": len(i.fields), "task_count": len(i.templates)}
    if full:
        d["fields"] = [{"key": f.key, "label": f.label, "field_type": f.field_type, "required": f.required, "options": f.options or [], "help_text": f.help_text} for f in i.fields]
        d["tasks"] = [{"title": t.title, "description": t.description, "assignee_mode": t.assignee_mode, "assignee_id": t.assignee_id, "due_offset_days": t.due_offset_days} for t in i.templates]
    return d


@router.get("/categories")
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    counts = dict(db.execute(select(CatalogItem.category_id, func.count()).where(CatalogItem.is_active).group_by(CatalogItem.category_id)).all())
    total = dict(db.execute(select(CatalogItem.category_id, func.count()).group_by(CatalogItem.category_id)).all())
    return [{"id": c.id, "name": c.name, "description": c.description, "icon": c.icon, "sort_order": c.sort_order, "item_count": counts.get(c.id, 0), "total_items": total.get(c.id, 0)}
            for c in db.scalars(select(CatalogCategory).order_by(CatalogCategory.sort_order, CatalogCategory.name))]


@router.post("/categories", status_code=201)
def create_category(body: CategoryIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.scalar(select(CatalogCategory).where(func.lower(CatalogCategory.name) == body.name.lower())):
        raise HTTPException(409, "A category with this name already exists")
    c = CatalogCategory(**body.model_dump())
    db.add(c)
    db.flush()
    log_activity(db, admin, "created", "catalog_category", c.id, {"name": c.name})
    db.commit()
    return {"id": c.id, "name": c.name}


@router.patch("/categories/{cid}")
def update_category(cid: uuid.UUID, body: CategoryIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = db.get(CatalogCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    clash = db.scalar(select(CatalogCategory).where(func.lower(CatalogCategory.name) == body.name.lower(), CatalogCategory.id != cid))
    if clash:
        raise HTTPException(409, "A category with this name already exists")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    log_activity(db, admin, "updated", "catalog_category", c.id, {"name": c.name})
    db.commit()
    return {"id": c.id, "name": c.name}


@router.delete("/categories/{cid}", status_code=204)
def delete_category(cid: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = db.get(CatalogCategory, cid)
    if not c:
        raise HTTPException(404, "Category not found")
    if db.scalar(select(func.count()).select_from(CatalogItem).where(CatalogItem.category_id == cid)):
        raise HTTPException(409, "Move or delete the items in this category first")
    log_activity(db, admin, "deleted", "catalog_category", c.id, {"name": c.name})
    db.delete(c)
    db.commit()


@router.get("/items")
def list_items(category_id: uuid.UUID | None = None, q: str | None = None, include_inactive: bool = False,
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    if include_inactive and user.role.name != "admin":
        raise HTTPException(403, "Administrator access required")
    stmt = select(CatalogItem).order_by(CatalogItem.name)
    if not include_inactive:
        stmt = stmt.where(CatalogItem.is_active)
    if category_id:
        stmt = stmt.where(CatalogItem.category_id == category_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(CatalogItem.name.ilike(like), CatalogItem.description.ilike(like)))
    return [item_out(i, full=False) for i in db.scalars(stmt).unique()]


@router.get("/items/{iid}")
def get_item(iid: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = db.get(CatalogItem, iid)
    if not i or (not i.is_active and user.role.name != "admin"):
        raise HTTPException(404, "Catalog item not found")
    return item_out(i)


def _apply(db: Session, i: CatalogItem, b: ItemIn) -> None:
    if not db.get(CatalogCategory, b.category_id):
        raise HTTPException(422, "Category does not exist")
    for uid in (b.approver_id, b.default_assignee_id, *[t.assignee_id for t in b.tasks]):
        _user(db, uid)
    for k in ("category_id", "name", "description", "icon", "estimated_hours", "is_active", "approval_required", "approver_id", "default_assignee_id", "sequential"):
        setattr(i, k, getattr(b, k))
    i.name = i.name.strip()
    # fields: update by key so existing definitions keep their identity, then add/remove
    existing = {f.key: f for f in i.fields}
    wanted = {f.key for f in b.fields}
    for key, f in list(existing.items()):
        if key not in wanted:
            i.fields.remove(f)
    db.flush()
    for n, fi in enumerate(b.fields):
        row = existing.get(fi.key) if fi.key in wanted else None
        if row is None or row not in i.fields:
            row = CatalogFormField(key=fi.key)
            i.fields.append(row)
        row.label, row.field_type, row.required, row.options, row.help_text, row.sort_order = fi.label.strip(), fi.field_type, fi.required, fi.options, fi.help_text, n
    i.templates.clear()
    db.flush()
    for n, t in enumerate(b.tasks):
        i.templates.append(CatalogTaskTemplate(title=t.title.strip(), description=t.description, sort_order=n, assignee_mode=t.assignee_mode,
                                               assignee_id=t.assignee_id if t.assignee_mode == "user" else None, due_offset_days=t.due_offset_days))
    db.flush()


@router.post("/items", status_code=201)
def create_item(body: ItemIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    i = CatalogItem(category_id=body.category_id, name=body.name)
    db.add(i)
    db.flush()
    _apply(db, i, body)
    log_activity(db, admin, "created", "catalog_item", i.id, {"name": i.name})
    db.commit()
    db.refresh(i)
    return item_out(i)


@router.put("/items/{iid}")
def update_item(iid: uuid.UUID, body: ItemIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    i = db.get(CatalogItem, iid)
    if not i:
        raise HTTPException(404, "Catalog item not found")
    was_active = i.is_active
    _apply(db, i, body)
    log_activity(db, admin, "updated", "catalog_item", i.id, {"name": i.name, **({"is_active": {"from": was_active, "to": i.is_active}} if was_active != i.is_active else {})})
    db.commit()
    db.refresh(i)
    return item_out(i)


@router.delete("/items/{iid}", status_code=204)
def delete_item(iid: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    i = db.get(CatalogItem, iid)
    if not i:
        raise HTTPException(404, "Catalog item not found")
    if db.scalar(select(func.count()).select_from(RequestedItem).where(RequestedItem.item_id == iid)):
        raise HTTPException(409, "This service has been requested before, so it cannot be deleted. Deactivate it instead.")
    log_activity(db, admin, "deleted", "catalog_item", i.id, {"name": i.name})
    db.delete(i)
    db.commit()
