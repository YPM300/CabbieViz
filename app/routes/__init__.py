from flask import Flask
from . import date, home, region, aggregate


import os
def create_app():
    app = Flask(__name__,root_path=os.getcwd(),template_folder=os.getcwd()+"/app/templates",static_folder=os.getcwd()+"/app/static")
    # app.config.from_object('config.Config')

    app.register_blueprint(date.date_bp,url_prefix='/date')
    app.register_blueprint(region.region_bp,url_prefix='/region')
    app.register_blueprint(aggregate.aggregates_bp,url_prefix='/aggregates')
    # app.register_blueprint(routine.routine_bp,url_prefix='/routine')
    app.register_blueprint(home.home_bp,url_prefix='/')
    
    
    
    return app

