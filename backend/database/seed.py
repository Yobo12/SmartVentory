"""
Seed script for initial reference data.

Run this once after applying migrations, to populate lookup tables that
the rest of the app depends on (e.g. you need at least one Role before
you can create a User).

Usage:
    python -m database.seed
"""

from auth.security import hash_password
from database.session import SessionLocal
from models import Category, Role, Unit, User


DEFAULT_ADMIN_EMAIL = "admin@smartventory.com"
DEFAULT_ADMIN_PASSWORD = "Admin@12345"  # CHANGE THIS after first login


def seed_roles(db) -> None:
    existing = {r.role_name for r in db.query(Role).all()}
    defaults = [
        ("Admin", "Full system access, including user management."),
        ("Staff", "Day-to-day operations: sales, purchases, inventory."),
    ]
    for name, description in defaults:
        if name not in existing:
            db.add(Role(role_name=name, description=description))
    db.commit()


def seed_units(db) -> None:
    existing = {u.unit_name for u in db.query(Unit).all()}
    defaults = [
        ("Piece", "pcs"),
        ("Kilogram", "kg"),
        ("Litre", "L"),
        ("Box", "box"),
        ("Pack", "pack"),
    ]
    for name, symbol in defaults:
        if name not in existing:
            db.add(Unit(unit_name=name, symbol=symbol))
    db.commit()


def seed_categories(db) -> None:
    existing = {c.category_name for c in db.query(Category).all()}
    defaults = [
        ("General", "Uncategorized products."),
        ("Beverages", "Drinks, juices, water, soft drinks."),
        ("Groceries", "Food staples and packaged goods."),
        ("Electronics", "Electronic devices and accessories."),
        ("Household", "Cleaning and home essentials."),
    ]
    for name, description in defaults:
        if name not in existing:
            db.add(Category(category_name=name, description=description))
    db.commit()


def seed_admin_user(db) -> None:
    """
    Creates the one and only way to get into the system initially: a
    default Admin account. There is no public registration (see Phase 3
    decision) — every other user must be created by an Admin via
    POST /api/v1/users.
    """
    existing = db.query(User).filter(User.email == DEFAULT_ADMIN_EMAIL).first()
    if existing is not None:
        return

    admin_role = db.query(Role).filter(Role.role_name == "Admin").first()
    if admin_role is None:
        raise RuntimeError("Admin role must exist before seeding the admin user — run seed_roles first.")

    admin = User(
        role_id=admin_role.role_id,
        first_name="System",
        last_name="Administrator",
        email=DEFAULT_ADMIN_EMAIL,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
        status="active",
    )
    db.add(admin)
    db.commit()
    print(f"Default admin created -> email: {DEFAULT_ADMIN_EMAIL} | password: {DEFAULT_ADMIN_PASSWORD}")
    print("IMPORTANT: change this password after your first login.")


def run_seed() -> None:
    db = SessionLocal()
    try:
        seed_roles(db)
        seed_units(db)
        seed_categories(db)
        seed_admin_user(db)
        print("Seed data inserted successfully (Roles, Units, Categories, Admin user).")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
