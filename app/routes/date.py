from flask import Blueprint, render_template, request, jsonify
from sqlalchemy import create_engine
date_bp = Blueprint('date', __name__)


#  function sendData() {
#             var xhr = new XMLHttpRequest();
#             xhr.open("POST", "/submit", true);
#             xhr.setRequestHeader("Content-Type", "application/json");
#             xhr.onreadystatechange = function() {
#                 if (xhr.readyState === 4 && xhr.status === 200) {
#                     alert(xhr.responseText);
#                 }
#             };
#             var data = JSON.stringify({
#                 "name": document.getElementById("name").value,
#                 "email": document.getElementById("email").value
#             });
#             xhr.send(data);
#         }


@date_bp.route('/range', methods=['POST'])
def time_range():
    data = request.get_json()
    start_time = data['start_time']
    end_time = data['end_time']
    engine = create_engine()

    # return jsonify({"message": f"Name: {name}, Email: {email}"})

@date_bp.route('/')
def home():
    return render_template('home.html')