from flask import Blueprint, render_template,request,jsonify
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session
from app.models.routine import Routine
from app.models.connection import engine
import os
routine_bp = Blueprint('routine', __name__)



@routine_bp.route('/id', methods=['POST'])
def routine_detail():
    data = request.get_json()
    rid = data['routine_id']
    # engine = create_engine(f'mysql+pymysql://{db_username}:{db_password}@{db_host}:{db_port}/{db_database}')
    with Session(engine) as session:
        pass
        # row = session.execute(
        # select(Routine.origin_id, Routine.destination_id,Routine.payment_id,Routine.payment_amount).where(Routine.payment_amount == rid)).first()
    
    # return jsonify({"message": "origin_id: {}, destination_id: {}, payment_id: {}, payment_amount: {}".format(row[0],row[1],row[2],row[3])})

@routine_bp.route('/')
def home():
    return render_template('map_zone.html')