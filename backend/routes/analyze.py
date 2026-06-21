from flask import Blueprint, request, jsonify
from scoring import readiness_score, compute_role_fits, generate_insights
from database import save_analysis, touch_session, session_exists, create_session

analyze_bp = Blueprint("analyze", __name__)


@analyze_bp.route("/analyze", methods=["POST"])
def analyze():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body is required"}), 400

    session_id = body.get("session_id", "")

    # Validate / create session
    if not session_id or not session_exists(session_id):
        session_id = create_session()

    touch_session(session_id)

    profile          = body.get("profile", {})
    selected_skills  = body.get("skills", [])
    github_data      = body.get("github", {})
    resume_data      = body.get("resume", {})
    coding_platforms = body.get("coding_platforms", {})

    # Merge skills from all sources
    resume_skills = resume_data.get("skills", [])
    github_langs  = github_data.get("top_languages", [])
    all_skills    = list(set(selected_skills + resume_skills))

    # Parse profile safely
    try:
        cgpa = float(profile.get("cgpa", 0))
    except (TypeError, ValueError):
        cgpa = 0.0

    try:
        backlogs = int(str(profile.get("backlogs", 0)).replace("+", ""))
    except (TypeError, ValueError):
        backlogs = 0

    certs_raw = profile.get("certs", "")
    if isinstance(certs_raw, str):
        certs = [c.strip() for c in certs_raw.split(",") if c.strip()]
    elif isinstance(certs_raw, list):
        certs = certs_raw
    else:
        certs = []

    github_score = github_data.get("github_score", 0)
    resume_score = resume_data.get("resume_quality_score", 50)

    # Run scoring
    readiness = readiness_score(
        skills=all_skills, github_score=github_score, cgpa=cgpa,
        backlogs=backlogs, certs=certs, resume_score=resume_score,
        coding_platforms=coding_platforms,
    )

    role_fits = compute_role_fits(
        skills=all_skills, cgpa=cgpa, github_languages=github_langs,
    )

    insights = generate_insights(
        skills=all_skills, github_score=github_score, resume_score=resume_score,
        cgpa=cgpa, backlogs=backlogs, github_data=github_data,
    )

    total = readiness["total"]
    if total >= 85:
        standing, desc = "Excellent", "You're highly placement-ready. Target top-tier companies."
    elif total >= 70:
        standing, desc = "Good Standing", "Ready for mid-tier companies. A few improvements unlock top-tier."
    elif total >= 55:
        standing, desc = "Developing", "On the right track. Focus on the priority improvements below."
    else:
        standing, desc = "Needs Work", "Focus on building projects and skills before placement season."

    result = {
        "readiness": {**readiness, "standing": standing, "standing_desc": desc},
        "role_fits": role_fits,
        "insights":  insights,
        "meta": {
            "skills_analyzed":  len(all_skills),
            "github_connected": bool(github_data.get("username")),
            "resume_parsed":    bool(resume_data.get("resume_quality_score")),
        },
    }

    # Save to DB
    analysis_id = save_analysis(
        session_id=session_id,
        profile=profile,
        skills=selected_skills,
        github_data=github_data,
        resume_data=resume_data,
        result=result,
    )

    return jsonify({
        **result,
        "analysis_id": analysis_id,
        "session_id":  session_id,
    }), 200