"""companies.metier : plusieurs métiers (CSV)

Revision ID: d4a6c8e0f1b3
Revises: c3f5a7b9d2e4
Create Date: 2026-11-27 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a6c8e0f1b3'
down_revision: Union[str, None] = 'c3f5a7b9d2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'companies', 'metier', existing_type=sa.String(length=30), type_=sa.String(length=120)
    )


def downgrade() -> None:
    op.execute("UPDATE companies SET metier = SUBSTRING_INDEX(metier, ',', 1)")
    op.alter_column(
        'companies', 'metier', existing_type=sa.String(length=120), type_=sa.String(length=30)
    )
