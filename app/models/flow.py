from . import Base
from datetime import date
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

class Flow(Base):
    __tablename__ = "routine_flow"
    trip_date :Mapped[date]= mapped_column(primary_key=True)
    origin_zone :Mapped[int]= mapped_column(primary_key=True)
    dest_zone :Mapped[int]= mapped_column(primary_key=True)
    num_trips: Mapped[int]
    # avg_payment: Mapped[float]
    pass