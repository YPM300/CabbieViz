from flask import Blueprint, render_template, request, jsonify
from sqlalchemy import create_engine
home_bp = Blueprint('home', __name__)

import os
@home_bp.route('/')
def main_page():
    return render_template('map_zone.html')

@home_bp.route("/line-chart")
def line_chart():
    # assumes you have templates/line_chart.html
    return render_template("line_chart.html")