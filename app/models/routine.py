from . import Base
from typing import List
from typing import Optional
from sqlalchemy import String
from sqlalchemy import Float
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
from datetime import date
from datetime import time
from dataclasses import dataclass

class Routine(Base):
    __tablename__ = "cab_routine"
    # trip_date: Mapped[date] = mapped_column(primary_key=True)
    # origin_zone: Mapped[int] = mapped_column(primary_key=True)
    # dest_zone: Mapped[int]= mapped_column(primary_key=True)
    # num_trips: Mapped[int]
    # start_time = Mapped[time]
    # end_time = Mapped[time]
    # payment_amount = Mapped[float]
    pass
    
    
    