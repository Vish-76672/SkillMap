from flask import Blueprint, jsonify
from database import get_session_analyses, get_analysis

history_bp = Blueprint("history", __name__)


@history_bp.route("/history/<session_id>", methods=["GET"])
def get_history(session_id):
    """Get all past analyses for a session."""
    analyses = get_session_analyses(session_id)
    return jsonify({"analyses": analyses}), 200


@history_bp.route("/analysis/<analysis_id>", methods=["GET"])
def get_single(analysis_id):
    """Get full details of a specific analysis."""
    analysis = get_analysis(analysis_id)
    if not analysis:
        return jsonify({"error": "Analysis not found"}), 404
    return jsonify(analysis), 200