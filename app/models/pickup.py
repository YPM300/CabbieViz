from . import Base
from datetime import date
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from dataclasses import dataclass

class Pickup(Base):
    __tablename__ = "pickup_group"
    pickup_date :Mapped[date]= mapped_column(primary_key=True)
    zone_id :Mapped[int]= mapped_column(primary_key=True)
    num_trips: Mapped[int]
    avg_fare: Mapped[float]
    pass