from . import Base
from typing import List
from typing import Optional
from sqlalchemy import String
from sqlalchemy import Float
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
class Payment():
    __tablename__ = "payment_detail"
    payment_id: Mapped[int] = mapped_column(primary_key=True)
    fare_amount: Mapped[float]
    extra: Mapped[float]
    mta_tax: Mapped[float]
    tip: Mapped[float]
    toll: Mapped[float]
    congestion_surchage: Mapped[float]
    airport_fee: Mapped[float]
    pass