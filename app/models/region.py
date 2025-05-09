from . import Base
from datetime import date
from sqlalchemy import String
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
class Region():
    region_id :Mapped[int]= mapped_column(primary_key=True)
    borough_id :Mapped[int]
    total_payment: Mapped[float]
    name: Mapped[str]= mapped_column(String(20))
    date :Mapped[date]
    enter_num = Mapped[int]
    exit_num = Mapped[int]
    pass