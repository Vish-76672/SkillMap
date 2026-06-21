import os
import json
import fitz
from flask import Blueprint, request, jsonify

resume_bp = Blueprint("resume", __name__)
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

MOCK_RESUME = {
    "name": "", "email": "", "phone": "",
    "skills": ["JavaScript", "React", "Node.js", "Python", "Git"],
    "languages": ["JavaScript", "Python"],
    "frameworks": ["React", "Node.js", "Express"],
    "databases": ["MongoDB", "PostgreSQL"],
    "tools": ["Git", "Docker"],
    "education": [{"degree": "B.Tech Computer Science", "institution": "Demo University", "year": "2026", "cgpa": "8.0"}],
    "experience": [{"company": "Demo Corp", "role": "Software Intern", "duration": "Jun 2024 – Aug 2024", "description": "Built REST APIs and frontend components"}],
    "projects": [
        {"name": "Portfolio Website", "tech_stack": ["React", "Node.js"], "description": "Personal portfolio"},
        {"name": "Chat App", "tech_stack": ["Socket.io", "Express", "MongoDB"], "description": "Real-time chat"},
    ],
    "certifications": ["AWS Cloud Practitioner"],
    "resume_quality_score": 62,
    "resume_feedback": [
        "Add quantified achievements",
        "Include links to GitHub projects",
        "Add a professional summary",
        "Use action verbs to start each bullet",
    ],
    "_mock": True,
}

PROMPT = """You are a resume parser. Extract structured information from the resume below.

Return ONLY valid JSON with exactly these keys — no markdown, no explanation, no extra text:
{
  "name": "",
  "email": "",
  "phone": "",
  "skills": [],
  "languages": [],
  "frameworks": [],
  "databases": [],
  "tools": [],
  "education": [{"degree":"","institution":"","year":"","cgpa":""}],
  "experience": [{"company":"","role":"","duration":"","description":""}],
  "projects": [{"name":"","tech_stack":[],"description":""}],
  "certifications": [],
  "resume_quality_score": 0,
  "resume_feedback": []
}

resume_quality_score: integer 0-100 based on completeness, clarity, ATS-friendliness.
resume_feedback: up to 4 short, specific improvement suggestions.

RESUME:
"""


def extract_text(file_bytes: bytes) -> str:
    text_parts = []
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for page in doc:
            text_parts.append(page.get_text())
    return "\n".join(text_parts).strip()


def parse_with_gemini(resume_text: str) -> dict:
    import google.generativeai as genai
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content(PROMPT + resume_text[:6000])
    raw = response.text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def parse_with_openai(resume_text: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": PROMPT + resume_text[:6000]}],
        temperature=0,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def parse_with_anthropic(resume_text: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        messages=[{"role": "user", "content": PROMPT + resume_text[:6000]}],
    )
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


@resume_bp.route("/resume", methods=["POST"])
def parse_resume():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Use key 'file'."}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are accepted"}), 400

    file_bytes = file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({"error": "File too large. Max 5 MB."}), 413

    try:
        resume_text = extract_text(file_bytes)
    except Exception as e:
        return jsonify({"error": f"Could not read PDF: {str(e)}"}), 422

    if len(resume_text.strip()) < 100:
        return jsonify({"error": "PDF appears image-based or empty."}), 422

    # Try Gemini first (free), then OpenAI, then Anthropic, then mock
    if os.getenv("GEMINI_API_KEY"):
        try:
            parsed = parse_with_gemini(resume_text)
            return jsonify(parsed), 200
        except Exception as e:
            print(f"[Gemini] Error: {e}")

    if os.getenv("OPENAI_API_KEY"):
        try:
            parsed = parse_with_openai(resume_text)
            return jsonify(parsed), 200
        except Exception as e:
            print(f"[OpenAI] Error: {e}")

    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            parsed = parse_with_anthropic(resume_text)
            return jsonify(parsed), 200
        except Exception as e:
            print(f"[Anthropic] Error: {e}")

    # All failed or no keys — return mock
    return jsonify(MOCK_RESUME), 200