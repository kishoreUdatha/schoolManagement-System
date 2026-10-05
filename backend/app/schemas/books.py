from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

Kind = Literal["asset", "liability", "equity", "income", "expense"]


class AccountIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.\-]+$")
    name: str = Field(..., min_length=2, max_length=120)
    kind: Kind
    description: Optional[str] = Field(None, max_length=300)


class AccountUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=20, pattern=r"^[A-Za-z0-9.\-]+$")
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    kind: Optional[Kind] = None
    description: Optional[str] = Field(None, max_length=300)
    is_active: Optional[bool] = None


class JournalLineIn(BaseModel):
    account_id: int
    debit: Decimal = Field(Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    credit: Decimal = Field(Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    note: Optional[str] = Field(None, max_length=200)


class JournalIn(BaseModel):
    entry_date: date
    narration: str = Field(..., min_length=3, max_length=300)
    reference: Optional[str] = Field(None, max_length=120)
    lines: list[JournalLineIn] = Field(..., min_length=2, max_length=50)


class VoidIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=300)
