from flask import Blueprint, render_template, request
region_bp = Blueprint('region', __name__)


@region_bp.route('/borough', methods=['POST'])
def borough():
    data = request.get_json()
    bid = data['borough_id']


    # return jsonify({"message": f"Name: {name}, Email: {email}"})


@region_bp.route('/zone/origin', methods=['POST'])
def zone_origin():
    data = request.get_json()
    zid = data['zone_id']

    # return jsonify({"message": f"Name: {name}, Email: {email}"})


@region_bp.route('/zone/destination', methods=['POST'])
def zone_destination():
    data = request.get_json()
    zid = data['zone_id']
    

@region_bp.route('/zone/route', methods=['POST'])
def zone_route():
    data = request.get_json()
    ozid = data['origin_zone_id']
    dzid = data['destination_zone_id']
    

@region_bp.route('/')
def home():
    return render_template('home.html')