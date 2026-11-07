"""Initial service catalog. Seeded once on a fresh database; afterwards admins own it through the builder."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models_catalog import CatalogCategory, CatalogFormField, CatalogItem, CatalogTaskTemplate


def F(key, label, typ="text", req=False, options=None, help=""):
    return dict(key=key, label=label, field_type=typ, required=req, options=options or [], help_text=help)


REQ_, OTHER = "requester", "other_member"
# category: (icon, description, [(name, icon, description, est_hours, approval, fields, tasks)])
CATALOG = {
    "Household": ("home", "Repairs, servicing, cleaning and supplies for the home.", [
        ("Request home repairs", "hammer", "Get something fixed around the house.", 72, False,
         [F("what", "What needs repairing?", req=True), F("room", "Where in the home?"), F("severity", "How urgent?", "select", True, ["Low", "Medium", "Urgent"]),
          F("details", "Details", "textarea"), F("preferred_date", "Preferred date", "date")],
         [("Contact a repair provider", REQ_), ("Schedule the visit", REQ_), ("Confirm the repair is complete", REQ_)]),
        ("Request appliance servicing", "wrench", "Book servicing or repair for an appliance.", 72, False,
         [F("appliance", "Appliance", req=True), F("issue", "What is wrong?", "textarea", True), F("preferred_date", "Preferred date", "date")],
         [("Contact service provider", REQ_), ("Schedule appointment", REQ_), ("Confirm repair completed", REQ_)]),
        ("Request cleaning", "sparkles", "Arrange a cleaning.", 48, False,
         [F("cleaning_type", "Type of cleaning", "select", True, ["Regular", "Deep clean", "Move-out"]), F("area", "Area or rooms"), F("preferred_date", "Preferred date", "date")],
         [("Arrange the cleaning", REQ_), ("Confirm the cleaning was done", REQ_)]),
        ("Request furniture purchase", "sofa", "Buy furniture for the home. Needs approval.", 168, True,
         [F("item", "What furniture?", req=True), F("budget", "Budget", "number", True), F("room", "Which room?"), F("link", "Link or reference"), F("notes", "Notes", "textarea")],
         [("Shortlist options", REQ_), ("Place the order", REQ_), ("Arrange delivery", REQ_), ("Confirm delivered and assembled", REQ_)]),
        ("Request household supplies", "shopping-cart", "Ask for groceries or supplies to be picked up.", 24, False,
         [F("items", "What do we need?", "textarea", True), F("urgent", "Needed today", "checkbox")],
         [("Buy the supplies", OTHER)]),
    ]),
    "Personal": ("user", "Personal plans, appointments and support.", [
        ("Plan a personal activity", "compass", "Set up something you want to do.", None, False,
         [F("activity", "Activity", req=True), F("when", "When?", "date"), F("notes", "Notes", "textarea")],
         [("Work out the details", REQ_), ("Book or prepare", REQ_)]),
        ("Request assistance", "hand-helping", "Ask for a hand with something.", 24, False,
         [F("what", "What do you need help with?", "textarea", True), F("by_when", "Needed by", "date")],
         [("Help with the request", OTHER)]),
        ("Schedule an appointment", "calendar", "Book a doctor, service or other appointment.", 48, False,
         [F("with_whom", "With whom?", req=True), F("purpose", "Purpose"), F("preferred_date", "Preferred date", "date", True)],
         [("Book the appointment", REQ_), ("Add it to the calendar and confirm", REQ_)]),
        ("Plan a trip", "plane", "Organize a trip.", 168, False,
         [F("destination", "Destination", req=True), F("start_date", "Start date", "date"), F("end_date", "End date", "date"), F("travellers", "Travellers", "number"), F("budget", "Budget", "number")],
         [("Research options", REQ_), ("Book transport", REQ_), ("Book accommodation", REQ_), ("Prepare an itinerary", REQ_)]),
    ]),
    "Technology": ("monitor", "Devices, software and technical help.", [
        ("Request IT support", "life-buoy", "Get help with a computer, phone or network problem.", 24, False,
         [F("problem", "What is the problem?", "textarea", True), F("device", "Which device?"), F("urgent", "It is blocking me", "checkbox")],
         [("Diagnose the problem", OTHER), ("Fix it and confirm", OTHER)]),
        ("Request a new device", "laptop", "Buy a computer, phone or other device. Needs approval.", 168, True,
         [F("device_type", "Device type", "select", True, ["Laptop", "Phone", "Tablet", "Monitor", "Other"]), F("budget", "Budget", "number"), F("reason", "Why is it needed?", "textarea", True)],
         [("Research models", REQ_), ("Purchase the device", REQ_), ("Set it up", REQ_)]),
        ("Request software installation", "download", "Get software installed.", 24, False,
         [F("software", "Software", req=True), F("device", "Which device?"), F("license", "Licence", "select", False, ["Free", "Already have one", "Needs buying"])],
         [("Install and verify", OTHER)]),
        ("Report a technical issue", "bug", "Report something technical that is not working properly.", 48, False,
         [F("summary", "Summary", req=True), F("details", "Details", "textarea")],
         [("Investigate", OTHER), ("Fix and verify", OTHER)]),
    ]),
    "Shared Life": ("heart", "Things we plan and decide together.", [
        ("Plan a date", "heart", "Plan something nice for the two of us.", None, False,
         [F("when", "When?", "date", True), F("vibe", "Vibe", "select", False, ["Casual", "Romantic", "Adventurous"]), F("budget", "Budget", "number")],
         [("Pick the plan", REQ_), ("Make bookings", REQ_)]),
        ("Organize an event", "party-popper", "Host or organize an event.", 336, False,
         [F("event", "Event", req=True), F("date", "Date", "date"), F("guests", "Guests", "number"), F("budget", "Budget", "number")],
         [("Draft the guest list", REQ_), ("Book the venue and food", REQ_), ("Send invitations", REQ_), ("Final checks", REQ_)]),
        ("Plan a vacation", "plane-takeoff", "Plan a vacation together. Needs approval.", 720, True,
         [F("destination", "Destination", req=True), F("start_date", "Start date", "date", True), F("end_date", "End date", "date", True), F("budget", "Budget", "number", True)],
         [("Agree destination and dates", REQ_), ("Book flights", REQ_), ("Book accommodation", REQ_), ("Plan activities", REQ_), ("Pack and prepare", REQ_)]),
        ("Request a shared purchase", "wallet", "Buy something we will both use. Needs approval.", 72, True,
         [F("item", "What is it?", req=True), F("amount", "Amount", "number", True), F("reason", "Why?", "textarea")],
         [("Make the purchase", REQ_), ("Confirm it has arrived", REQ_)]),
    ]),
}


def seed_catalog(db: Session) -> None:
    if db.scalar(select(CatalogCategory)):
        return
    for n, (cat, (icon, desc, items)) in enumerate(CATALOG.items()):
        c = CatalogCategory(name=cat, description=desc, icon=icon, sort_order=n)
        db.add(c)
        db.flush()
        for name, ic, d, hours, approval, fields, tasks in items:
            i = CatalogItem(category_id=c.id, name=name, description=d, icon=ic, estimated_hours=hours, approval_required=approval)
            db.add(i)
            db.flush()
            i.fields.extend(CatalogFormField(sort_order=k, **f) for k, f in enumerate(fields))
            i.templates.extend(CatalogTaskTemplate(title=t, assignee_mode=m, sort_order=k) for k, (t, m) in enumerate(tasks))
