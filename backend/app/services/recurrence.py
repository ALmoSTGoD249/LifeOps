"""Shared by recurring tasks now and preventive maintenance in Phase 3."""
import calendar
from datetime import datetime, timedelta

FREQUENCIES = ("daily", "weekly", "monthly", "quarterly", "yearly")


def add_months(dt: datetime, months: int) -> datetime:
    y, m = divmod(dt.month - 1 + months, 12)
    year, month = dt.year + y, m + 1
    return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))


def advance(dt: datetime, frequency: str, interval: int = 1) -> datetime:
    interval = max(1, interval)
    if frequency == "daily":
        return dt + timedelta(days=interval)
    if frequency == "weekly":
        return dt + timedelta(weeks=interval)
    months = {"monthly": 1, "quarterly": 3, "yearly": 12}[frequency] * interval
    return add_months(dt, months)


def next_due_after(base: datetime, now: datetime, frequency: str, interval: int = 1) -> datetime:
    """Next occurrence strictly in the future, so a late completion does not spawn a stale task."""
    nxt = advance(base, frequency, interval)
    while nxt <= now:
        nxt = advance(nxt, frequency, interval)
    return nxt
