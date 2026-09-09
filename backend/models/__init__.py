"""
Importing every model here ensures they all register on Base.metadata
before Alembic's autogenerate (or Base.metadata.create_all) runs.
Without this, tables would silently be missing from migrations.
"""

from models.ai_recommendation import AIRecommendation
from models.category import Category
from models.inventory import Inventory
from models.product import Product
from models.purchase import Purchase
from models.purchase_item import PurchaseItem
from models.role import Role
from models.sale import Sale
from models.sale_item import SaleItem
from models.stock_movement import StockMovement
from models.supplier import Supplier
from models.unit import Unit
from models.user import User

__all__ = [
    "Role",
    "User",
    "Category",
    "Supplier",
    "Unit",
    "Product",
    "Inventory",
    "Purchase",
    "PurchaseItem",
    "Sale",
    "SaleItem",
    "StockMovement",
    "AIRecommendation",
]
