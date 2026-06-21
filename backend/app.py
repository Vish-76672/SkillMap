from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

from database import init_db, create_session, touch_session, session_exists
from routes.github import github_bp
from routes.resume import resume_bp
from routes.analyze import analyze_bp
from routes.roles import roles_bp
from routes.history import history_bp

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Init DB on startup
with app.app_context():
    init_db()

# Register blueprints
app.register_blueprint(github_bp,  url_prefix="/api")
app.register_blueprint(resume_bp,  url_prefix="/api")
app.register_blueprint(analyze_bp, url_prefix="/api")
app.register_blueprint(roles_bp,   url_prefix="/api")
app.register_blueprint(history_bp, url_prefix="/api")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "message": "SkillMap API is running"}), 200


@app.route("/api/session", methods=["POST"])
def new_session():
    """Create a new session. Called once when user lands on the site."""
    session_id = create_session()
    return jsonify({"session_id": session_id}), 201


@app.route("/api/session/<session_id>/ping", methods=["POST"])
def ping_session(session_id):
    """Keep session alive. Called on page load if session exists."""
    exists = touch_session(session_id)
    if not exists:
        # Session expired or invalid — create a new one
        new_id = create_session()
        return jsonify({"session_id": new_id, "renewed": True}), 200
    return jsonify({"session_id": session_id, "renewed": False}), 200


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)