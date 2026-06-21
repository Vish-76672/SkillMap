/**
 * SkillMap API Layer
 * All backend communication goes through here.
 * Change BASE_URL once and everything updates.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Generic fetch wrapper ─────────────────────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function createSession() {
  return request("/api/session", { method: "POST" });
}

export async function pingSession(sessionId) {
  return request(`/api/session/${sessionId}/ping`, { method: "POST" });
}

/**
 * Get or create session ID.
 * Persists in localStorage so users keep their history across tabs.
 */
export async function getOrCreateSession() {
  const stored = localStorage.getItem("skillmap_session");
  if (stored) {
    try {
      const res = await pingSession(stored);
      localStorage.setItem("skillmap_session", res.session_id);
      return res.session_id;
    } catch {
      // Session invalid — fall through to create new
    }
  }
  const res = await createSession();
  localStorage.setItem("skillmap_session", res.session_id);
  return res.session_id;
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export async function fetchGithub(username) {
  return request("/api/github", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

// ── Resume ────────────────────────────────────────────────────────────────────

export async function parseResume(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/resume`, {
    method: "POST",
    body: formData,
    // Don't set Content-Type — browser sets it with boundary for FormData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Resume parsing failed");
  return data;
}

// ── Analyze ───────────────────────────────────────────────────────────────────

export async function runAnalysis({ sessionId, profile, skills, github, resume, codingPlatforms }) {
  return request("/api/analyze", {
    method: "POST",
    body: JSON.stringify({
      session_id:       sessionId,
      profile,
      skills,
      github,
      resume,
      coding_platforms: codingPlatforms || {},
    }),
  });
}

// ── History ───────────────────────────────────────────────────────────────────

export async function getHistory(sessionId) {
  return request(`/api/history/${sessionId}`);
}

export async function getAnalysis(analysisId) {
  return request(`/api/analysis/${analysisId}`);
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function getRoles() {
  return request("/api/roles");
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkHealth() {
  return request("/api/health");
}