from app.models.pickup import Pickup
from app.models.dropoff import Dropoff
from app.models.flow import Flow
# from app.models.routine import Routine
from typing import Dict
from app.models import Base
from sqlalchemy import insert, create_engine, Index
from sqlalchemy.orm import Session
import pandas as pd
import pyarrow.parquet as pq
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from dateutil import parser
from sqlalchemy import text
from tqdm import tqdm



def flow_import(engine):
    Pickup.__table__.drop(engine,checkfirst = True)
    Dropoff.__table__.drop(engine,checkfirst = True)
    Pickup.__table__.create(engine)
    Dropoff.__table__.create(engine)
    
    with Session(engine) as session:
        pick_df = pd.read_csv("./data/pickup.csv")
        drop_df = pd.read_csv("./data/dropoff.csv")
        for index,row in pick_df.iterrows():

            stmt = insert(Pickup).values(pickup_date = row["pickup_date"],zone_id = row["zone_id"],num_trips = row["num_trips"],avg_fare = row["avg_fare"])
            # print(stmt)
            session.execute(stmt)
            
        session.commit()
        for index,row in drop_df.iterrows():
            stmt = insert(Dropoff).values(dropoff_date = row["dropoff_date"],zone_id = row["zone_id"],num_trips = row["num_trips"],avg_fare = row["avg_fare"])
            session.execute(stmt)
        session.commit()
        # session.execute()
    pass

def od_import(engine):
    """
    Load Origin–Destination aggregates into the Flow table.
    Expects a CSV './data/od_aggregates.csv' with columns:
      trip_date, origin_zone, dest_zone, num_trips
    """
    # 1) (Re)create the Flow table
    Flow.__table__.drop(engine, checkfirst=True)
    Flow.__table__.create(engine, checkfirst=True)

    # 2) Read the CSV
    od_df = pd.read_csv(
        "./data/od_aggregates.csv",
        parse_dates=["trip_date"]
    )

    # 3) Bulk‐insert via SQLAlchemy
    chunknum = 50000
    cnt = 0
    with Session(engine) as session:
        for _, row in od_df.iterrows():
            cnt = cnt + 1
            if cnt % chunknum == 0:
                session.commit()
            stmt = insert(Flow).values(
                trip_date   = row["trip_date"].date(),
                origin_zone = int(row["origin_zone"]),
                dest_zone   = int(row["dest_zone"]),
                num_trips   = int(row["num_trips"]),
            )
            session.execute(stmt)
        session.commit()  


db_username = "admin"
db_password = "!DIVAdiva1234567899"
db_host = "10.128.0.90"
db_port = "3306"
db_database = "diva"
engine = create_engine(f'mysql+pymysql://{db_username}:{db_password}@{db_host}:{db_port}/{db_database}')

flow_import(engine)
od_import(engine)

