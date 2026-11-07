from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models_assets import AssetCategory
from app.models_kb import KnowledgeCategory

ASSET_CATEGORIES = ["Computers", "Monitors", "Phones", "Appliances", "Furniture", "Vehicles", "Networking equipment", "Other"]
KB_CATEGORIES = ["Troubleshooting", "Appliances", "Emergency contacts", "Home maintenance", "Procedures", "Credentials"]


def seed_household_reference(db: Session) -> None:
    if not db.scalar(select(AssetCategory)):
        db.add_all(AssetCategory(name=n, sort_order=i) for i, n in enumerate(ASSET_CATEGORIES))
    if not db.scalar(select(KnowledgeCategory)):
        db.add_all(KnowledgeCategory(name=n, sort_order=i) for i, n in enumerate(KB_CATEGORIES))
