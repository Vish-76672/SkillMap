"""
SkillMap Database Layer
-----------------------
SQLite with 3 tables:
  sessions      - UUID-based user sessions
  analyses      - saved analysis results
  github_cache  - cached GitHub data (1 hour TTL)
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime, timedelta

DB_PATH = os.getenv("DB_PATH", "skillmap.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                created_at  TEXT NOT NULL,
                last_seen   TEXT NOT NULL,
                meta        TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id              TEXT PRIMARY KEY,
                session_id      TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                profile         TEXT NOT NULL,
                skills          TEXT NOT NULL,
                github_data     TEXT NOT NULL,
                resume_data     TEXT NOT NULL,
                result          TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS github_cache (
                username    TEXT PRIMARY KEY,
                data        TEXT NOT NULL,
                cached_at   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_analyses_session
                ON analyses(session_id);

            CREATE INDEX IF NOT EXISTS idx_analyses_created
                ON analyses(created_at);
        """)
    print(f"[DB] Initialized at {DB_PATH}")


# ── Sessions ──────────────────────────────────────────────────────────────────

def create_session() -> str:
    """Create a new session and return its UUID."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, created_at, last_seen) VALUES (?, ?, ?)",
            (session_id, now, now),
        )
    return session_id


def touch_session(session_id: str) -> bool:
    """Update last_seen timestamp. Returns False if session doesn't exist."""
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE sessions SET last_seen = ? WHERE id = ?",
            (now, session_id),
        )
        return cur.rowcount > 0


def session_exists(session_id: str) -> bool:
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return row is not None


# ── Analyses ──────────────────────────────────────────────────────────────────

def save_analysis(
    session_id: str,
    profile: dict,
    skills: list,
    github_data: dict,
    resume_data: dict,
    result: dict,
) -> str:
    """Save a full analysis result. Returns the analysis ID."""
    analysis_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO analyses
               (id, session_id, created_at, profile, skills, github_data, resume_data, result)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id,
                session_id,
                now,
                json.dumps(profile),
                json.dumps(skills),
                json.dumps(github_data),
                json.dumps(resume_data),
                json.dumps(result),
            ),
        )
    return analysis_id


def get_analysis(analysis_id: str) -> dict | None:
    """Fetch a single analysis by ID."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
    if not row:
        return None
    return _deserialize_analysis(row)


def get_session_analyses(session_id: str) -> list:
    """Fetch all analyses for a session, newest first."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, created_at, profile, result
               FROM analyses
               WHERE session_id = ?
               ORDER BY created_at DESC""",
            (session_id,),
        ).fetchall()

    results = []
    for row in rows:
        profile = json.loads(row["profile"])
        result  = json.loads(row["result"])
        results.append({
            "id":         row["id"],
            "created_at": row["created_at"],
            "name":       profile.get("name", ""),
            "score":      result.get("readiness", {}).get("total", 0),
            "standing":   result.get("readiness", {}).get("standing", ""),
        })
    return results


def get_latest_analysis(session_id: str) -> dict | None:
    """Get the most recent analysis for a session."""
    with get_db() as conn:
        row = conn.execute(
            """SELECT * FROM analyses
               WHERE session_id = ?
               ORDER BY created_at DESC LIMIT 1""",
            (session_id,),
        ).fetchone()
    if not row:
        return None
    return _deserialize_analysis(row)


def _deserialize_analysis(row) -> dict:
    return {
        "id":          row["id"],
        "session_id":  row["session_id"],
        "created_at":  row["created_at"],
        "profile":     json.loads(row["profile"]),
        "skills":      json.loads(row["skills"]),
        "github_data": json.loads(row["github_data"]),
        "resume_data": json.loads(row["resume_data"]),
        "result":      json.loads(row["result"]),
    }


# ── GitHub Cache ──────────────────────────────────────────────────────────────

CACHE_TTL_HOURS = 1


def get_github_cache(username: str) -> dict | None:
    """Return cached GitHub data if it's less than 1 hour old."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT data, cached_at FROM github_cache WHERE username = ?",
            (username.lower(),),
        ).fetchone()

    if not row:
        return None

    cached_at = datetime.fromisoformat(row["cached_at"])
    if datetime.utcnow() - cached_at > timedelta(hours=CACHE_TTL_HOURS):
        return None  # expired

    return json.loads(row["data"])


def set_github_cache(username: str, data: dict):
    """Cache GitHub data for a username."""
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO github_cache (username, data, cached_at)
               VALUES (?, ?, ?)
               ON CONFLICT(username) DO UPDATE SET
                   data = excluded.data,
                   cached_at = excluded.cached_at""",
            (username.lower(), json.dumps(data), now),
        )


def clear_expired_cache():
    """Delete cache entries older than TTL. Call this periodically."""
    cutoff = (datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)).isoformat()
    with get_db() as conn:
        conn.execute(
            "DELETE FROM github_cache WHERE cached_at < ?", (cutoff,)
        )