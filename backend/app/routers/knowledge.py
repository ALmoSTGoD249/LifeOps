import re
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import current_user, require_admin
from app.models import User
from app.models_incidents import Attachment
from app.models_kb import ArticleSecret, ArticleTag, KnowledgeArticle, KnowledgeCategory
from app.routers.incidents import _brief
from app.schemas_household import ArticleIn, ArticlePatch, SecretIn, SecretPatch
from app.services.attachments import save_upload
from app.services.audit import activity_for, log_activity, next_number
from app.services.crypto import decrypt, encrypt

router = APIRouter(prefix="/kb", tags=["knowledge"])
SORTS = {"updated_at": KnowledgeArticle.updated_at, "title": KnowledgeArticle.title, "number": KnowledgeArticle.number, "created_at": KnowledgeArticle.created_at}


def _admin(u: User) -> bool:
    return u.role.name == "admin"


def visible_sql(u: User):
    """Unauthorized users must not even learn that an article exists."""
    if _admin(u):
        return True
    return and_(KnowledgeArticle.admins_only.is_(False), or_(KnowledgeArticle.status == "published", KnowledgeArticle.created_by_id == u.id))


def can_see(a: KnowledgeArticle, u: User) -> bool:
    return _admin(u) or (not a.admins_only and (a.status == "published" or a.created_by_id == u.id))


def get_article(db: Session, number: str, u: User) -> KnowledgeArticle:
    a = db.scalar(select(KnowledgeArticle).where(KnowledgeArticle.number == number.upper()))
    if not a or not can_see(a, u):
        raise HTTPException(404, "Article not found")
    return a


def _tags(raw: list[str]) -> list[str]:
    out = []
    for t in raw:
        t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40]
        if t and t not in out:
            out.append(t)
    return out


def card(a: KnowledgeArticle) -> dict:
    plain = re.sub(r"[#*_`>\[\]()!-]+", " ", a.body or "")
    return {"id": a.id, "number": a.number, "title": a.title, "category": {"id": a.category.id, "name": a.category.name} if a.category else None, "status": a.status,
            "admins_only": a.admins_only, "tags": sorted(t.tag for t in a.tags), "updated_at": a.updated_at, "created_at": a.created_at, "updated_by": _brief(a.updated_by),
            "created_by": _brief(a.created_by), "secret_count": len(a.secrets), "excerpt": " ".join(plain.split())[:160]}


def full(a: KnowledgeArticle) -> dict:
    return {**card(a), "body": a.body, "secrets": [{"id": s.id, "label": s.label} for s in a.secrets]}   # values are never included


@router.get("/categories")
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": c.id, "name": c.name} for c in db.scalars(select(KnowledgeCategory).order_by(KnowledgeCategory.sort_order, KnowledgeCategory.name))]


@router.post("/categories", status_code=201)
def add_category(body: dict, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    name = str(body.get("name", "")).strip()
    if not 2 <= len(name) <= 60:
        raise HTTPException(422, "Name must be 2 to 60 characters")
    if db.scalar(select(KnowledgeCategory).where(func.lower(KnowledgeCategory.name) == name.lower())):
        raise HTTPException(409, "Category already exists")
    c = KnowledgeCategory(name=name, sort_order=(db.scalar(select(func.max(KnowledgeCategory.sort_order))) or 0) + 1)
    db.add(c)
    db.flush()
    log_activity(db, admin, "created", "kb_category", c.id, {"name": name})
    db.commit()
    return {"id": c.id, "name": c.name}


@router.get("/tags")
def tags(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.execute(select(ArticleTag.tag, func.count()).join(KnowledgeArticle, KnowledgeArticle.id == ArticleTag.article_id).where(visible_sql(user)).group_by(ArticleTag.tag).order_by(ArticleTag.tag)).all()
    return [{"tag": t, "count": c} for t, c in rows]


@router.get("/articles")
def list_articles(q: str | None = Query(None, max_length=100), category_id: uuid.UUID | None = None, tag: str | None = None, status: str | None = None,
                  sort: str = "updated_at", order: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    if sort not in SORTS:
        raise HTTPException(422, f"Unknown sort field. Use one of: {', '.join(SORTS)}")
    conds = [visible_sql(user)]
    if category_id:
        conds.append(KnowledgeArticle.category_id == category_id)
    if status in ("draft", "published"):
        conds.append(KnowledgeArticle.status == status)
    elif status:
        raise HTTPException(422, "Unknown status")
    if tag:
        conds.append(KnowledgeArticle.id.in_(select(ArticleTag.article_id).where(ArticleTag.tag == tag.lower())))
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(KnowledgeArticle.title.ilike(like), KnowledgeArticle.body.ilike(like), KnowledgeArticle.number.ilike(like),
                         KnowledgeArticle.id.in_(select(ArticleTag.article_id).where(ArticleTag.tag.ilike(like)))))
    col = SORTS[sort]
    total = db.scalar(select(func.count()).select_from(KnowledgeArticle).where(*conds)) or 0
    rows = db.scalars(select(KnowledgeArticle).where(*conds).order_by(col.asc() if order == "asc" else col.desc(), KnowledgeArticle.number.desc())
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return {"items": [card(a) for a in rows], "total": total}


def _check_cat(db: Session, cid) -> None:
    if cid and not db.get(KnowledgeCategory, cid):
        raise HTTPException(422, "Category does not exist")


@router.post("/articles", status_code=201)
def create(body: ArticleIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _check_cat(db, body.category_id)
    if body.admins_only and not _admin(user):
        raise HTTPException(403, "Only administrators can restrict an article to administrators")
    labels = [s.label.strip() for s in (body.secrets or [])]
    if len(labels) != len(set(l.lower() for l in labels)):
        raise HTTPException(422, "Secret labels must be unique within an article")
    a = KnowledgeArticle(number=next_number(db, "KB"), title=body.title.strip(), body=body.body, category_id=body.category_id, status=body.status,
                         admins_only=body.admins_only, created_by_id=user.id, updated_by_id=user.id)
    db.add(a)
    db.flush()
    a.tags.extend(ArticleTag(tag=t) for t in _tags(body.tags))
    for n, s in enumerate(body.secrets or []):
        a.secrets.append(ArticleSecret(label=s.label.strip(), value_encrypted=encrypt(s.value), sort_order=n))
    log_activity(db, user, "created", "article", a.id, {"number": a.number, "title": a.title, "status": a.status})
    if a.status == "published":
        log_activity(db, user, "published", "article", a.id, {})
    db.commit()
    db.refresh(a)
    return full(a)


@router.get("/articles/{number}")
def detail(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return full(get_article(db, number, user))


@router.patch("/articles/{number}")
def update(number: str, body: ArticlePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    ch = body.model_dump(exclude_unset=True)
    for k in ("title", "body", "status", "admins_only"):
        if k in ch and ch[k] is None:
            raise HTTPException(422, f"{k} cannot be empty")
    if "admins_only" in ch and ch["admins_only"] != a.admins_only and not _admin(user):
        raise HTTPException(403, "Only administrators can change article restrictions")
    if "category_id" in ch:
        _check_cat(db, ch["category_id"])
    tags = ch.pop("tags", None)
    diff = {}
    for k, v in ch.items():
        cur = getattr(a, k)
        if cur != v:
            diff[k] = {"from": "(edited)", "to": "(edited)"} if k == "body" else {"from": str(cur), "to": str(v)}
            setattr(a, k, v)
    if tags is not None:
        new = _tags(tags)
        if sorted(new) != sorted(t.tag for t in a.tags):
            diff["tags"] = {"from": sorted(t.tag for t in a.tags), "to": sorted(new)}
            a.tags.clear()
            db.flush()
            a.tags.extend(ArticleTag(tag=t) for t in new)
    if diff:
        a.updated_by_id = user.id
        log_activity(db, user, "published" if diff.get("status", {}).get("to") == "published" else "updated", "article", a.id, diff)
    db.commit()
    db.refresh(a)
    return full(a)


@router.delete("/articles/{number}", status_code=204)
def delete(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    if not _admin(user) and a.created_by_id != user.id:
        raise HTTPException(403, "Only the author or an administrator can delete an article")
    log_activity(db, user, "deleted", "article", a.id, {"number": a.number, "title": a.title})
    db.delete(a)
    db.commit()


# ---- secrets ---------------------------------------------------------------
def _secret(db: Session, a: KnowledgeArticle, sid: uuid.UUID) -> ArticleSecret:
    s = db.get(ArticleSecret, sid)
    if not s or s.article_id != a.id:
        raise HTTPException(404, "Secret not found")
    return s


@router.post("/articles/{number}/secrets", status_code=201)
def add_secret(number: str, body: SecretIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    if any(s.label.lower() == body.label.strip().lower() for s in a.secrets):
        raise HTTPException(409, "A secret with this label already exists")
    s = ArticleSecret(article_id=a.id, label=body.label.strip(), value_encrypted=encrypt(body.value), sort_order=len(a.secrets))
    db.add(s)
    db.flush()
    log_activity(db, user, "secret_added", "article", a.id, {"label": s.label})
    db.commit()
    return {"id": s.id, "label": s.label}


@router.patch("/articles/{number}/secrets/{sid}")
def patch_secret(number: str, sid: uuid.UUID, body: SecretPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    s = _secret(db, a, sid)
    if body.label and body.label.strip().lower() != s.label.lower() and any(x.label.lower() == body.label.strip().lower() for x in a.secrets):
        raise HTTPException(409, "A secret with this label already exists")
    if body.label:
        s.label = body.label.strip()
    if body.value:
        s.value_encrypted = encrypt(body.value)
    log_activity(db, user, "secret_updated", "article", a.id, {"label": s.label, "value_changed": bool(body.value)})
    db.commit()
    return {"id": s.id, "label": s.label}


@router.delete("/articles/{number}/secrets/{sid}", status_code=204)
def delete_secret(number: str, sid: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    s = _secret(db, a, sid)
    log_activity(db, user, "secret_removed", "article", a.id, {"label": s.label})
    db.delete(s)
    db.commit()


@router.post("/articles/{number}/secrets/{sid}/reveal")
def reveal(number: str, sid: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """POST (not GET) so it needs the CSRF token and is never prefetched or cached. Every reveal is audited."""
    a = get_article(db, number, user)
    s = _secret(db, a, sid)
    try:
        value = decrypt(s.value_encrypted)
    except ValueError as e:
        raise HTTPException(500, str(e))
    log_activity(db, user, "secret_revealed", "article", a.id, {"label": s.label})
    db.commit()
    return {"label": s.label, "value": value}


@router.get("/articles/{number}/activity")
def timeline(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return activity_for(db, "article", get_article(db, number, user).id)


@router.get("/articles/{number}/attachments")
def attachments(number: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    rows = db.scalars(select(Attachment).where(Attachment.record_type == "article", Attachment.record_id == str(a.id)).order_by(Attachment.created_at)).all()
    return [{"id": r.id, "name": r.original_name, "size": r.size, "mime": r.mime, "created_at": r.created_at} for r in rows]


@router.post("/articles/{number}/attachments", status_code=201)
async def upload(number: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_article(db, number, user)
    att = await save_upload(db, user, "article", a.id, file)
    db.commit()
    return {"id": att.id, "name": att.original_name, "size": att.size, "mime": att.mime, "created_at": att.created_at}
