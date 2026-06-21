import os
import requests
from flask import Blueprint, request, jsonify
from database import get_github_cache, set_github_cache

github_bp = Blueprint("github", __name__)
GITHUB_API = "https://api.github.com"

MOCK_GITHUB = {
    "username": "demo_user",
    "name": "Demo User",
    "avatar": None,
    "bio": None,
    "public_repos": 18,
    "followers": 12,
    "following": 8,
    "total_stars": 34,
    "total_forks": 7,
    "recent_commits": 9,
    "top_languages": ["JavaScript", "Python", "Java"],
    "github_score": 58.0,
    "profile_url": "https://github.com/demo_user",
    "_mock": True,
}


def get_headers():
    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def compute_github_score(repo_count, total_stars, recent_commits, followers):
    return round(min(100,
        min(repo_count, 30)      * 1.5 +
        min(total_stars, 50)     * 0.5 +
        min(recent_commits, 20)  * 1.0 +
        min(followers, 10)       * 1.0
    ), 1)


@github_bp.route("/github", methods=["POST"])
def fetch_github():
    data = request.get_json()
    username = (data or {}).get("username", "").strip()

    if not username:
        return jsonify({"error": "Username is required"}), 400

    # ── Check cache first ─────────────────────────────────────────────────────
    cached = get_github_cache(username)
    if cached:
        cached["_cached"] = True
        return jsonify(cached), 200

    # ── No API token → return mock ────────────────────────────────────────────
    if not os.getenv("GITHUB_TOKEN"):
        mock = {**MOCK_GITHUB, "username": username}
        return jsonify(mock), 200

    headers = get_headers()

    # User profile
    user_resp = requests.get(f"{GITHUB_API}/users/{username}", headers=headers)
    if user_resp.status_code == 404:
        return jsonify({"error": "GitHub user not found"}), 404
    if user_resp.status_code != 200:
        return jsonify({"error": "GitHub API error. Try again later."}), 502

    user = user_resp.json()

    # Repos
    repos_resp = requests.get(
        f"{GITHUB_API}/users/{username}/repos",
        headers=headers,
        params={"per_page": 100, "sort": "updated", "type": "owner"},
    )
    repos = repos_resp.json() if repos_resp.status_code == 200 else []

    # Languages
    lang_counts = {}
    for repo in repos:
        lang = repo.get("language")
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
    top_languages = sorted(lang_counts, key=lang_counts.get, reverse=True)[:5]

    total_stars   = sum(r.get("stargazers_count", 0) for r in repos)
    total_forks   = sum(r.get("forks_count", 0) for r in repos)

    # Recent commit activity via events
    events_resp = requests.get(
        f"{GITHUB_API}/users/{username}/events/public",
        headers=headers, params={"per_page": 100},
    )
    events = events_resp.json() if events_resp.status_code == 200 else []
    push_events    = [e for e in events if e.get("type") == "PushEvent"]
    recent_commits = sum(e.get("payload", {}).get("size", 0) for e in push_events)

    result = {
        "username":       username,
        "name":           user.get("name") or username,
        "avatar":         user.get("avatar_url"),
        "bio":            user.get("bio"),
        "public_repos":   user.get("public_repos", 0),
        "followers":      user.get("followers", 0),
        "following":      user.get("following", 0),
        "total_stars":    total_stars,
        "total_forks":    total_forks,
        "recent_commits": recent_commits,
        "top_languages":  top_languages,
        "github_score":   compute_github_score(
            len(repos), total_stars, recent_commits, user.get("followers", 0)
        ),
        "profile_url": f"https://github.com/{username}",
    }

    set_github_cache(username, result)
    return jsonify(result), 200