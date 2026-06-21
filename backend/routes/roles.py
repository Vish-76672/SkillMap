from flask import Blueprint, jsonify
from roles_config import ROLES

roles_bp = Blueprint("roles", __name__)


@roles_bp.route("/roles", methods=["GET"])
def get_roles():
    """Returns all roles with their skill requirements."""
    return jsonify({"roles": ROLES}), 200