from sqlalchemy import create_engine
db_username = "admin"
db_password = "!DIVAdiva1234567899"
db_host = "10.128.0.90"
db_port = "3306"
db_database = "diva"
engine = create_engine(f'mysql+pymysql://{db_username}:{db_password}@{db_host}:{db_port}/{db_database}')
