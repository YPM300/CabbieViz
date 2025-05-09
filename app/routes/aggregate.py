
from functools import lru_cache
from flask import Flask, jsonify, abort, Blueprint, render_template, request
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from app.models.connection import engine
from app.models.dropoff import Dropoff
from app.models.pickup import Pickup
from app.models.flow import Flow
from dateutil import parser
aggregates_bp = Blueprint('aggregate', __name__)

@lru_cache(maxsize=64)
def get_dropoffs(date_str):
    with Session(engine) as session:
        ret = session.execute(
        select(Dropoff.zone_id, Dropoff.num_trips, Dropoff.avg_fare,Dropoff.dropoff_date).where(Dropoff.dropoff_date == parser.parse(date_str).date()).order_by(Dropoff.zone_id)).all()
    result_dicts = [{column: getattr(row, column) for column in ["zone_id","num_trips","avg_fare"]} for row in ret]
    return result_dicts

@lru_cache(maxsize=64)
def get_pickups(date_str):
    with Session(engine) as session:
        ret = session.execute(
        select(Pickup.zone_id, Pickup.num_trips, Pickup.avg_fare).where(Pickup.pickup_date == parser.parse(date_str).date()).order_by(Pickup.zone_id)).all()
    result_dicts = [{column: getattr(row, column) for column in ["zone_id","num_trips","avg_fare"]} for row in ret]
    return result_dicts

@lru_cache(maxsize=256)
def get_od(date_str, origin_zone):
    with Session(engine) as session:
        ret = session.execute(
        select(Flow.dest_zone.label("zone_id"), Flow.num_trips).where(and_(Flow.origin_zone == int(origin_zone) ,Flow.trip_date == parser.parse(date_str).date())).order_by(Flow.dest_zone)).all()
    result_dicts = [{column: getattr(row, column) for column in ["zone_id","num_trips"]} for row in ret]
    return result_dicts


@lru_cache(maxsize=256)
def get_reverse_od(date_str, dest_zone):
    
    with Session(engine) as session:
        ret = session.execute(
        select(Flow.origin_zone.label("zone_id"), Flow.num_trips).where( and_(Flow.dest_zone == int(dest_zone),Flow.trip_date == parser.parse(date_str).date())).order_by(Flow.origin_zone)).all()
    result_dicts = [{column: getattr(row, column) for column in ["zone_id","num_trips"]} for row in ret]
    return result_dicts

@aggregates_bp.route("/pickup/<date_str>")
def pickups_endpoint(date_str):
    rows = get_pickups(date_str)
    if not rows:
        abort(404, f"No pickup data for {date_str}")
    return jsonify(rows)

@aggregates_bp.route("/dropoff/<date_str>")
def dropoffs_endpoint(date_str):
    rows = get_dropoffs(date_str)
    if not rows:
        abort(404, f"No drop-off data for {date_str}")
    return jsonify(rows)

@aggregates_bp.route("/od/<date_str>/<int:origin_zone>")
def od_endpoint(date_str, origin_zone):
    rows = get_od(date_str, origin_zone)
    if not rows:
        abort(404, f"No OD data for {date_str} from zone {origin_zone}")
    return jsonify(rows)


@aggregates_bp.route("/od_reverse/<date_str>/<int:dest_zone>")
def od_reverse_endpoint(date_str, dest_zone):
    rows = get_od(date_str, dest_zone)
    if not rows:
        abort(404, f"No OD data for {date_str} from zone {dest_zone}")
    return jsonify(rows)
