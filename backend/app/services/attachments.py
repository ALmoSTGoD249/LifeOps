import hashlib, os, re, uuid
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import User
from app.models_incidents import Attachment
from app.services.audit import log_activity

# extension -> (mime, magic-byte check). Text types must decode as UTF-8.
ALLOWED = {
    ".png": ("image/png", lambda b: b.startswith(b"\x89PNG\r\n\x1a\n")),
    ".jpg": ("image/jpeg", lambda b: b.startswith(b"\xff\xd8\xff")),
    ".jpeg": ("image/jpeg", lambda b: b.startswith(b"\xff\xd8\xff")),
    ".gif": ("image/gif", lambda b: b[:4] == b"GIF8"),
    ".webp": ("image/webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
    ".pdf": ("application/pdf", lambda b: b.startswith(b"%PDF")),
    ".txt": ("text/plain", None),
    ".csv": ("text/plain", None),
}


def _clean_name(name: str) -> str:
    base = os.path.basename((name or "file").replace("\\", "/"))
    return re.sub(r"[^\w.\- ]", "_", base)[:200] or "file"


async def save_upload(db: Session, user: User, record_type: str, record_id, file: UploadFile) -> Attachment:
    s = get_settings()
    name = _clean_name(file.filename or "")
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(415, f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED))}")
    limit = s.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File exceeds {s.max_upload_mb} MB")
    if not data:
        raise HTTPException(422, "File is empty")
    mime, check = ALLOWED[ext]
    if check is not None and not check(data):
        raise HTTPException(415, "File content does not match its extension")
    if check is None:
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(415, "Text files must be UTF-8")
    stored = uuid.uuid4().hex + ext
    os.makedirs(s.upload_dir, exist_ok=True)
    with open(os.path.join(s.upload_dir, stored), "wb") as f:
        f.write(data)
    att = Attachment(record_type=record_type, record_id=str(record_id), original_name=name, stored_name=stored,
                     mime=mime, size=len(data), sha256=hashlib.sha256(data).hexdigest(), uploaded_by_id=user.id)
    db.add(att)
    db.flush()
    log_activity(db, user, "attachment_added", record_type, record_id, {"file": name, "size": len(data)})
    return att
