"""
SkillMap Scoring Engine
-----------------------
Readiness Score (0–100) is a weighted composite of 5 signals:

  Technical Skills  25%
  GitHub Activity   25%
  Academic Profile  20%
  Resume Quality    20%
  Coding Profiles   10%

Role Fit Score (0–100 per role) is based on:
  - Skills overlap with required + bonus skills
  - Language match
  - CGPA threshold
"""

from roles_config import ROLES


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize(value, min_val, max_val) -> float:
    """Map value into [0, 1] range."""
    if max_val == min_val:
        return 0.0
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def skills_overlap_score(user_skills: list, required: list, bonus: list) -> float:
    """
    Score how well user skills match a role.
    Required skills count double the weight of bonus skills.
    Returns 0–100.
    """
    user_lower = {s.lower() for s in user_skills}
    req_lower  = {s.lower() for s in required}
    bon_lower  = {s.lower() for s in bonus}

    req_match  = len(user_lower & req_lower)
    bon_match  = len(user_lower & bon_lower)

    req_total  = len(req_lower) or 1
    bon_total  = len(bon_lower) or 1

    req_score  = (req_match / req_total) * 70   # required = 70% of fit
    bon_score  = (bon_match / bon_total) * 30   # bonus    = 30% of fit

    return round(req_score + bon_score, 1)


# ── Academic Score (0–100) ────────────────────────────────────────────────────

def academic_score(cgpa: float, backlogs: int, certs: list) -> float:
    cgpa = max(0.0, min(10.0, cgpa))

    # CGPA: 60 pts
    cgpa_pts = normalize(cgpa, 5.0, 10.0) * 60

    # Backlogs: 30 pts (penalty)
    if backlogs == 0:
        backlog_pts = 30
    elif backlogs == 1:
        backlog_pts = 20
    elif backlogs == 2:
        backlog_pts = 10
    else:
        backlog_pts = 0

    # Certifications: 10 pts (capped at 3)
    cert_pts = min(len(certs), 3) * (10 / 3)

    return round(cgpa_pts + backlog_pts + cert_pts, 1)


# ── Technical Skills Score (0–100) ───────────────────────────────────────────

def technical_skills_score(skills: list) -> float:
    """
    Score based on diversity and depth of skills.
    Covers: languages, frameworks, databases, cloud, devops, ML.
    """
    CATEGORIES = {
        "languages":  ["Python", "Java", "JavaScript", "TypeScript", "C++", "Go", "Rust"],
        "frameworks": ["React", "Next.js", "Vue", "Angular", "Node.js", "Express", "Flask", "FastAPI", "Django", "Spring Boot"],
        "databases":  ["PostgreSQL", "MongoDB", "Redis", "MySQL", "SQLite", "Firebase"],
        "cloud":      ["AWS", "GCP", "Azure"],
        "devops":     ["Docker", "Kubernetes", "CI/CD", "Linux", "Git"],
        "ml":         ["Machine Learning", "Deep Learning", "Data Analysis"],
        "cs_core":    ["DSA", "System Design", "GraphQL", "REST APIs"],
    }

    skill_set = {s.lower() for s in skills}
    total_pts = 0.0

    weights = {
        "languages": 20, "frameworks": 20, "databases": 15,
        "cloud": 10, "devops": 15, "ml": 10, "cs_core": 10,
    }

    for cat, cat_skills in CATEGORIES.items():
        cat_lower = {s.lower() for s in cat_skills}
        matched   = len(skill_set & cat_lower)
        coverage  = matched / len(cat_lower)
        total_pts += coverage * weights[cat]

    return round(min(total_pts, 100), 1)


# ── GitHub Score (0–100) ─────────────────────────────────────────────────────
# GitHub scoring is handled in routes/github.py and passed in directly.
# This just validates and caps it.

def validate_github_score(raw_score) -> float:
    try:
        return round(max(0.0, min(100.0, float(raw_score))), 1)
    except (TypeError, ValueError):
        return 0.0


# ── Resume Score (0–100) ─────────────────────────────────────────────────────
# Comes directly from Claude's parse. Validate and cap.

def validate_resume_score(raw_score) -> float:
    try:
        return round(max(0.0, min(100.0, float(raw_score))), 1)
    except (TypeError, ValueError):
        return 50.0  # neutral default


# ── Coding Profiles Score (0–100) ────────────────────────────────────────────
# Simple: 25 pts per platform provided (max 4 platforms = 100)

def coding_profiles_score(platforms: dict) -> float:
    known = ["leetcode", "codechef", "hackerrank", "geeksforgeeks", "codeforces"]
    provided = sum(1 for p in known if platforms.get(p, "").strip())
    return round(min(provided * 25, 100), 1)


# ── Composite Readiness Score ─────────────────────────────────────────────────

WEIGHTS = {
    "technical": 0.25,
    "github":    0.25,
    "academic":  0.20,
    "resume":    0.20,
    "coding":    0.10,
}

def readiness_score(
    skills: list,
    github_score: float,
    cgpa: float,
    backlogs: int,
    certs: list,
    resume_score: float,
    coding_platforms: dict,
) -> dict:
    tech  = technical_skills_score(skills)
    acad  = academic_score(cgpa, backlogs, certs)
    gh    = validate_github_score(github_score)
    res   = validate_resume_score(resume_score)
    code  = coding_profiles_score(coding_platforms)

    composite = (
        tech  * WEIGHTS["technical"] +
        gh    * WEIGHTS["github"]    +
        acad  * WEIGHTS["academic"]  +
        res   * WEIGHTS["resume"]    +
        code  * WEIGHTS["coding"]
    )

    return {
        "total":     round(composite, 1),
        "breakdown": {
            "technical_skills": tech,
            "github":           gh,
            "academic":         acad,
            "resume":           res,
            "coding_profiles":  code,
        },
    }


# ── Role Fit + Gap Analysis ───────────────────────────────────────────────────

def compute_role_fits(skills: list, cgpa: float, github_languages: list) -> list:
    """
    Returns list of roles sorted by fit score descending,
    each with fit %, missing skills, and match label.
    """
    all_skills = skills + github_languages  # merge both sources
    results = []

    for role in ROLES:
        # CGPA gate: if below minimum, cap fit at 40
        cgpa_ok   = cgpa >= role["cgpa_min"]
        fit_score = skills_overlap_score(all_skills, role["required_skills"], role["bonus_skills"])

        if not cgpa_ok:
            fit_score = min(fit_score, 40.0)

        # Language bonus: +5 if user knows a preferred language
        lang_lower = {l.lower() for l in all_skills}
        if any(l.lower() in lang_lower for l in role["languages"]):
            fit_score = min(fit_score + 5, 100)

        # Gap analysis
        user_lower    = {s.lower() for s in all_skills}
        req_missing   = [s for s in role["required_skills"] if s.lower() not in user_lower]
        bonus_missing = [s for s in role["bonus_skills"]    if s.lower() not in user_lower]
        missing       = req_missing + bonus_missing[:3]  # max 3 bonus gaps shown

        # Match label
        if fit_score >= 80:
            label = "Strong match"
        elif fit_score >= 60:
            label = "Good match"
        elif fit_score >= 40:
            label = "Partial match"
        else:
            label = "Needs work"

        results.append({
            "id":          role["id"],
            "title":       role["title"],
            "description": role["description"],
            "fit":         round(fit_score, 1),
            "label":       label,
            "missing":     missing,
            "cgpa_ok":     cgpa_ok,
        })

    return sorted(results, key=lambda r: r["fit"], reverse=True)


# ── Strengths + Improvement Suggestions ──────────────────────────────────────

def generate_insights(
    skills: list,
    github_score: float,
    resume_score: float,
    cgpa: float,
    backlogs: int,
    github_data: dict,
) -> dict:
    strengths = []
    improvements = []

    # GitHub insights
    if github_score >= 70:
        strengths.append("Strong GitHub activity and project portfolio")
    elif github_score >= 40:
        improvements.append("Add more commits and improve README quality on GitHub repos")
    else:
        improvements.append("Build at least 3 well-documented projects on GitHub")

    # Skills insights
    if len(skills) >= 10:
        strengths.append(f"Broad technical skill set ({len(skills)} skills)")
    elif len(skills) >= 5:
        strengths.append(f"Solid foundation with {len(skills)} skills")
    else:
        improvements.append("Expand your technical skill set — aim for at least 8–10 skills")

    # DSA
    dsa_skills = {"dsa", "data structures", "algorithms", "leetcode"}
    if any(s.lower() in dsa_skills for s in skills):
        strengths.append("DSA / algorithms skills present")
    else:
        improvements.append("Start practicing DSA on LeetCode — aim for 50+ problems")

    # Resume
    if resume_score >= 70:
        strengths.append("Well-structured resume with good ATS score")
    elif resume_score >= 50:
        improvements.append("Improve resume: add quantified achievements and project links")
    else:
        improvements.append("Rebuild resume with clear sections: Skills, Projects, Experience, Education")

    # CGPA
    if cgpa >= 8.0:
        strengths.append(f"Strong academic record (CGPA {cgpa})")
    elif cgpa < 6.5:
        improvements.append("Some companies have CGPA cutoffs — focus on strong projects to compensate")

    # Backlogs
    if backlogs > 0:
        improvements.append(f"Clear your {backlogs} active backlog(s) before placement season")

    # System design
    if "system design" not in {s.lower() for s in skills}:
        improvements.append("Start learning System Design basics — essential for SDE roles")

    return {
        "strengths":    strengths[:4],
        "improvements": improvements[:5],
    }