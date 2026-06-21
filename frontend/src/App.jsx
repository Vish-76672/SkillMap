import { useState, useEffect, useRef, useCallback } from "react";
import {
  getOrCreateSession, fetchGithub, parseResume,
  runAnalysis, getHistory, getAnalysis,
} from "./api";

// ── TOKENS ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#F2F0FA", white: "#FFFFFF", ink: "#1E1B2E", inkLight: "#6B6880",
  violet: "#6C63FF", violetLight: "#EAE8FF", violetMid: "#B8B4F8",
  mint: "#B5EAD7", mintLight: "#E8FAF4", blush: "#FFD6E8", blushLight: "#FFF0F6",
  border: "#E8E5F5", error: "#FF4D6D", errorLight: "#FFF0F3",
};
const F = { display: "'Clash Display','DM Sans',sans-serif", body: "'Inter',sans-serif" };

// ── HOOKS ─────────────────────────────────────────────────────────────────────
function useBreakpoint() {
  const [bp, setBp] = useState("desktop");
  useEffect(() => {
    const check = () => setBp(window.innerWidth < 600 ? "mobile" : window.innerWidth < 900 ? "tablet" : "desktop");
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return bp;
}

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html{scroll-behavior:smooth}
      body{background:${C.bg};font-family:${F.body};color:${C.ink};-webkit-font-smoothing:antialiased}
      button{cursor:pointer;border:none;outline:none;background:none}
      input,select,textarea{outline:none;font-family:${F.body}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes slideIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:translateX(0)}}
      @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
      ::-webkit-scrollbar{width:5px}
      ::-webkit-scrollbar-thumb{background:${C.violetMid};border-radius:99px}
      input::placeholder,textarea::placeholder{color:#C4C0D8}
      select{appearance:none}
    `}</style>
  );
}

// ── SHARED UI ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", size = "md", style: s = {}, disabled, fullWidth }) {
  const sizes = { sm: { padding: "8px 18px", fontSize: 13 }, md: { padding: "12px 26px", fontSize: 14 }, lg: { padding: "14px 32px", fontSize: 15 } };
  const variants = {
    primary: { background: C.violet, color: "#fff", boxShadow: "0 4px 16px rgba(108,99,255,0.28)" },
    ghost:   { background: "transparent", color: C.violet, border: `1.5px solid ${C.border}` },
    soft:    { background: C.violetLight, color: C.violet },
    white:   { background: "#fff", color: C.ink, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
    danger:  { background: C.errorLight, color: C.error, border: `1.5px solid ${C.error}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      fontFamily: F.body, fontWeight: 600, borderRadius: 12, transition: "all 0.18s ease",
      letterSpacing: "0.01em", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1, width: fullWidth ? "100%" : "auto",
      ...sizes[size], ...variants[variant], ...s,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >{children}</button>
  );
}

function Tag({ children, color = "violet" }) {
  const map = { violet: { bg: C.violetLight, color: C.violet }, mint: { bg: C.mintLight, color: "#3A9B7A" }, blush: { bg: C.blushLight, color: "#C4567C" }, ink: { bg: "#EEEDF5", color: C.inkLight } };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", background: map[color].bg, color: map[color].color }}>{children}</span>;
}

function Card({ children, style: s = {}, hover = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => hover && setHov(true)} onMouseLeave={() => hover && setHov(false)}
      style={{ background: C.white, borderRadius: 20, border: `1.5px solid ${C.border}`, boxShadow: hov ? "0 12px 40px rgba(108,99,255,0.12)" : "0 2px 16px rgba(108,99,255,0.06)", transition: "all 0.22s ease", transform: hov ? "translateY(-3px)" : "none", ...s }}>
      {children}
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div style={{ background: C.errorLight, border: `1.5px solid ${C.error}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <span style={{ fontSize: 13, color: C.error }}>⚠ {message}</span>
      {onRetry && <Btn size="sm" variant="danger" onClick={onRetry}>Retry</Btn>}
    </div>
  );
}

function Spinner({ size = 20, color = C.violet }) {
  return <span style={{ width: size, height: size, border: `2px solid ${color}22`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block", flexShrink: 0 }} />;
}

function Input({ label, placeholder, value, onChange, type = "text", disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>}
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${focused ? C.violet : C.border}`, background: disabled ? "#F5F5F5" : C.bg, fontSize: 13, color: C.ink, transition: "border-color 0.15s", boxShadow: focused ? `0 0 0 3px rgba(108,99,255,0.10)` : "none" }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.inkLight, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "10px 36px 10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 13, color: C.ink, cursor: "pointer" }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.inkLight, pointerEvents: "none" }}>▾</span>
      </div>
    </div>
  );
}

// ── NAVBAR ────────────────────────────────────────────────────────────────────
function Navbar({ page, setPage }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const links = ["Home", "How It Works", "Analyzer", "History", "About"];
  const navTo = l => { setPage(l); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <>
      <nav style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 200, width: `calc(100% - ${isMobile ? 24 : 48}px)`, maxWidth: 940, background: scrolled || menuOpen ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: `1.5px solid ${C.border}`, borderRadius: 16, padding: isMobile ? "10px 16px" : "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: scrolled ? "0 4px 24px rgba(108,99,255,0.10)" : "none", transition: "all 0.3s ease" }}>
        <button onClick={() => navTo("Home")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>S</span>
          </div>
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 17, color: C.ink }}>SkillMap</span>
        </button>

        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {links.map(l => (
              <button key={l} onClick={() => navTo(l)} style={{ padding: "7px 13px", borderRadius: 10, fontSize: 13, fontWeight: 500, color: page === l ? C.violet : C.inkLight, background: page === l ? C.violetLight : "transparent", transition: "all 0.15s", fontFamily: F.body }}>{l}</button>
            ))}
          </div>
        )}

        {isMobile
          ? <button onClick={() => setMenuOpen(o => !o)} style={{ fontSize: 20, color: C.ink }}>{menuOpen ? "✕" : "☰"}</button>
          : <Btn size="sm" onClick={() => navTo("Analyzer")}>Get Started →</Btn>
        }
      </nav>

      {isMobile && menuOpen && (
        <div style={{ position: "fixed", top: 72, left: 12, right: 12, zIndex: 199, background: "#fff", borderRadius: 16, border: `1.5px solid ${C.border}`, boxShadow: "0 8px 32px rgba(108,99,255,0.14)", overflow: "hidden", animation: "fadeUp 0.2s ease" }}>
          {links.map(l => (
            <button key={l} onClick={() => navTo(l)} style={{ display: "block", width: "100%", padding: "15px 20px", textAlign: "left", fontSize: 15, fontWeight: page === l ? 600 : 400, color: page === l ? C.violet : C.ink, background: page === l ? C.violetLight : "transparent", borderBottom: `1px solid ${C.border}`, fontFamily: F.body }}>{l}</button>
          ))}
          <div style={{ padding: 14 }}><Btn fullWidth onClick={() => navTo("Analyzer")}>Get Started →</Btn></div>
        </div>
      )}
    </>
  );
}

// ── CONSTELLATION ─────────────────────────────────────────────────────────────
function Constellation() {
  const canvasRef = useRef();
  const animRef = useRef();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const skills = ["React","Node.js","Python","Java","DSA","AWS","Docker","System Design","SQL","ML","TypeScript","Redis","GraphQL","Git","CI/CD"];
    const nodes = skills.map(s => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, label: s, r: Math.random() * 2.5 + 2.5, highlight: skills.indexOf(s) < 5 }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach(n => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > canvas.width) n.vx *= -1; if (n.y < 0 || n.y > canvas.height) n.vy *= -1; });
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 130) { ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.strokeStyle = `rgba(108,99,255,${0.13*(1-dist/130)})`; ctx.lineWidth = 1; ctx.stroke(); }
      }
      nodes.forEach(n => { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fillStyle = n.highlight ? "rgba(108,99,255,0.65)" : "rgba(181,234,215,0.75)"; ctx.fill(); ctx.font = "500 11px Inter,sans-serif"; ctx.fillStyle = n.highlight ? "rgba(108,99,255,0.75)" : "rgba(107,104,128,0.55)"; ctx.fillText(n.label, n.x+n.r+5, n.y+4); });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.85 }} />;
}

// ── SCORE RING ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 140 }) {
  const [val, setVal] = useState(0);
  const r = (size - 16) / 2, circ = 2 * Math.PI * r;
  useEffect(() => {
    let start = null;
    const anim = ts => { if (!start) start = ts; const p = Math.min((ts-start)/1200,1); setVal(Math.round((1-Math.pow(1-p,3))*score)); if (p<1) requestAnimationFrame(anim); };
    const t = setTimeout(() => requestAnimationFrame(anim), 350);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id="rg3"><stop offset="0%" stopColor={C.violet}/><stop offset="100%" stopColor="#B5EAD7"/></linearGradient></defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.violetLight} strokeWidth="8"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#rg3)" strokeWidth="8" strokeDasharray={circ} strokeDashoffset={circ-(val/100)*circ} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.05s"}}/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: F.display, fontSize: size*0.25, fontWeight: 700, color: C.ink, lineHeight: 1 }}>{val}</span>
        <span style={{ fontSize: 9, fontWeight: 600, color: C.inkLight, letterSpacing: "0.08em", marginTop: 3 }}>READINESS</span>
      </div>
    </div>
  );
}

// ── ROLE BAR ──────────────────────────────────────────────────────────────────
function RoleBar({ role, index }) {
  const [w, setW] = useState(0);
  const colors = ["#6C63FF","#9B8FF5","#7DD3BE","#F7A8C4","#A8C4F7","#F7C4A8","#B8F5B0","#F5D0A9"];
  const color = colors[index % colors.length];
  useEffect(() => { const t = setTimeout(() => setW(role.fit), 150 + index * 80); return () => clearTimeout(t); }, []);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{role.title}</span>
          <span style={{ fontSize: 11, color: C.inkLight, marginLeft: 8 }}>{role.label}</span>
        </div>
        <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700, color }}>{role.fit}%</span>
      </div>
      <div style={{ height: 7, background: C.bg, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 0.9s cubic-bezier(0.34,1.56,0.64,1)", opacity: 0.85 }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOME PAGE
// ══════════════════════════════════════════════════════════════════════════════
function HomePage({ setPage }) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile", isTablet = bp === "tablet";
  const gridCols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3,1fr)";

  const features = [
    { icon: "◈", title: "GitHub Analysis",   desc: "We read your repos, commits, and contribution patterns — not just a username.", color: C.violetLight },
    { icon: "❋", title: "AI Resume Parser",  desc: "Upload your PDF. Our AI extracts projects, experience, and skills precisely.", color: C.mintLight },
    { icon: "◎", title: "Role Matching",     desc: "Get fit scores for 8+ roles based on your actual skill stack.", color: C.blushLight },
    { icon: "✦", title: "Skill Gap Report",  desc: "See exactly what you're missing for each role, with priority ordering.", color: C.violetLight },
    { icon: "◉", title: "Readiness Score",   desc: "A single 0–100 score weighing academics, coding, projects, and GitHub.", color: C.mintLight },
    { icon: "⬡", title: "Analysis History",  desc: "Every analysis saved. Come back anytime to track your improvement.", color: C.blushLight },
  ];

  const stats = [{ n: "12K+", label: "Students analyzed" }, { n: "94%", label: "Improved score" }, { n: "8+", label: "Roles mapped" }, { n: "6 min", label: "Avg. time" }];

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", paddingTop: 80 }}>
        <div style={{ position: "absolute", inset: 0 }}><Constellation /></div>
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", maxWidth: 720, padding: isMobile ? "0 20px" : "0 32px" }}>
          <Tag color="violet">Free · No signup required</Tag>
          <h1 style={{ fontFamily: F.display, fontSize: isMobile ? 36 : isTablet ? 52 : 68, fontWeight: 700, color: C.ink, lineHeight: 1.08, margin: "18px 0 20px", letterSpacing: "-0.02em" }}>
            Know exactly where<br /><span style={{ color: C.violet }}>you stand</span> for placement
          </h1>
          <p style={{ fontSize: isMobile ? 15 : 17, color: C.inkLight, lineHeight: 1.7, maxWidth: 500, margin: "0 auto 32px" }}>
            SkillMap analyzes your GitHub, resume, and skills to give you a placement readiness score, role matches, and a gap report — in 6 minutes.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn size={isMobile ? "md" : "lg"} onClick={() => setPage("Analyzer")}>Analyze My Profile →</Btn>
            <Btn size={isMobile ? "md" : "lg"} variant="white" onClick={() => setPage("How It Works")}>How it works</Btn>
          </div>
          <p style={{ fontSize: 11, color: C.inkLight, marginTop: 14, opacity: 0.65 }}>No account needed. Results saved automatically.</p>
        </div>
      </section>

      <section style={{ padding: isMobile ? "40px 16px" : "60px 24px", maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 14 }}>
          {stats.map(s => (
            <Card key={s.n} style={{ padding: isMobile ? "20px 14px" : "26px 20px", textAlign: "center" }}>
              <div style={{ fontFamily: F.display, fontSize: isMobile ? 28 : 34, fontWeight: 700, color: C.violet }}>{s.n}</div>
              <div style={{ fontSize: 12, color: C.inkLight, marginTop: 5 }}>{s.label}</div>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ padding: isMobile ? "40px 16px" : "80px 24px", maxWidth: 980, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: isMobile ? 32 : 52 }}>
          <Tag color="ink">What we analyze</Tag>
          <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 28 : 38, fontWeight: 700, color: C.ink, marginTop: 14, letterSpacing: "-0.02em" }}>Everything that matters<br />for placement</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 18 }}>
          {features.map(f => (
            <Card key={f.title} hover style={{ padding: "26px 22px" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontFamily: F.display, fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 7 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.65 }}>{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ padding: isMobile ? "40px 16px" : "80px 24px", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ background: C.violet, borderRadius: 24, padding: isMobile ? "40px 24px" : "56px 48px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 26 : 34, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Ready to see your score?</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", marginBottom: 26 }}>Takes 6 minutes. No account, no payment.</p>
          <Btn variant="white" size="lg" onClick={() => setPage("Analyzer")}>Start My Analysis →</Btn>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "28px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>S</span></div>
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 15, color: C.ink }}>SkillMap</span>
        </div>
        <p style={{ fontSize: 12, color: C.inkLight }}>Built for Indian engineering students.</p>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYZER PAGE — real API calls
// ══════════════════════════════════════════════════════════════════════════════
const SKILLS_LIST = ["JavaScript","TypeScript","Python","Java","C++","Go","React","Next.js","Vue","Node.js","Express","Flask","FastAPI","Django","Spring Boot","PostgreSQL","MongoDB","Redis","MySQL","Docker","Kubernetes","AWS","GCP","Azure","Git","Linux","CI/CD","System Design","DSA","GraphQL","REST APIs","Machine Learning","Deep Learning","Data Analysis"];

function AnalyzerPage({ setPage, setResult, sessionId }) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({ name: "", college: "", branch: "", year: "", cgpa: "", backlogs: "0", certs: "" });
  const [skills, setSkills] = useState([]);
  const [githubData, setGithubData] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [githubUsername, setGithubUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const animKey = useRef(0);

  const STEPS = ["Profile", "Skills", "GitHub", "Resume"];

  const next = () => { animKey.current++; setStep(s => s + 1); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const back = () => { animKey.current++; setStep(s => s - 1); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const handleFetchGithub = async () => {
    if (!githubUsername.trim()) return;
    setLoading(true); setError("");
    try {
      const data = await fetchGithub(githubUsername.trim());
      setGithubData(data);
    } catch (e) {
      setError(e.message || "Could not fetch GitHub data. Check the username and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async (file) => {
    if (!file || file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setLoading(true); setError("");
    try {
      const data = await parseResume(file);
      setResumeData(data);
    } catch (e) {
      setError(e.message || "Could not parse resume. Try a different PDF.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true); setError("");
    try {
      const result = await runAnalysis({
        sessionId,
        profile,
        skills,
        github: githubData || {},
        resume: resumeData || {},
        codingPlatforms: {},
      });
      setResult(result);
      setPage("Dashboard");
    } catch (e) {
      setError(e.message || "Analysis failed. Please try again.");
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ paddingTop: 90, minHeight: "100vh", animation: "fadeIn 0.4s ease" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>

        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            {STEPS.map((label, i) => {
              const id = i + 1, done = step > id, active = step === id;
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: isMobile ? 4 : 8, flex: 1, justifyContent: "center" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, transition: "all 0.2s", background: done ? C.violet : active ? C.violetLight : C.bg, color: done ? "#fff" : active ? C.violet : C.inkLight, border: active ? `2px solid ${C.violet}` : "none" }}>{done ? "✓" : id}</div>
                  {!isMobile && <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.ink : C.inkLight }}>{label}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ height: 4, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((step-1)/3)*100}%`, background: C.violet, borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>
        </div>

        <Card style={{ padding: isMobile ? "24px 20px" : "40px 44px", animation: "fadeUp 0.3s ease" }} key={animKey.current}>
          {error && <ErrorBox message={error} onRetry={null} />}

          {/* STEP 1 — Profile */}
          {step === 1 && (
            <div>
              <Tag color="violet">Step 1 of 4</Tag>
              <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 24 : 28, fontWeight: 700, color: C.ink, margin: "12px 0 6px" }}>Academic Profile</h2>
              <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 26 }}>Basic information about your academics.</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 22px" }}>
                <Input label="Full Name"            placeholder="Enter your full name"                value={profile.name}    onChange={v => setProfile({...profile, name: v})} />
                <Input label="College / University" placeholder="e.g. Delhi Technological University" value={profile.college} onChange={v => setProfile({...profile, college: v})} />
                <Input label="Branch / Degree"      placeholder="e.g. Computer Science Engineering"  value={profile.branch}  onChange={v => setProfile({...profile, branch: v})} />
                <Input label="Graduation Year"      placeholder="e.g. 2026"                          value={profile.year}    onChange={v => setProfile({...profile, year: v})} type="number" />
                <Input label="Current CGPA"         placeholder="e.g. 8.2 (out of 10)"              value={profile.cgpa}    onChange={v => setProfile({...profile, cgpa: v})} type="number" />
                <Select label="Active Backlogs" value={profile.backlogs} onChange={v => setProfile({...profile, backlogs: v})} options={["0","1","2","3","4+"]} />
              </div>
              <Input label="Certifications (comma separated)" placeholder="e.g. AWS Cloud Practitioner, Google Data Analytics" value={profile.certs} onChange={v => setProfile({...profile, certs: v})} />
              <div style={{ marginTop: 10 }}><Btn onClick={next} fullWidth={isMobile}>Continue →</Btn></div>
            </div>
          )}

          {/* STEP 2 — Skills */}
          {step === 2 && (
            <div>
              <Tag color="mint">Step 2 of 4</Tag>
              <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 24 : 28, fontWeight: 700, color: C.ink, margin: "12px 0 6px" }}>Technical Skills</h2>
              <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 24 }}>Select everything you're genuinely comfortable with.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {SKILLS_LIST.map(s => {
                  const sel = skills.includes(s);
                  return <button key={s} onClick={() => setSkills(sel ? skills.filter(x => x !== s) : [...skills, s])} style={{ padding: "7px 15px", borderRadius: 99, fontSize: 12, fontWeight: 500, background: sel ? C.violetLight : C.bg, color: sel ? C.violet : C.inkLight, border: `1.5px solid ${sel ? C.violet : C.border}`, transition: "all 0.14s", cursor: "pointer" }}>{s}</button>;
                })}
              </div>
              <div style={{ background: C.mintLight, borderRadius: 10, padding: "10px 16px", marginBottom: 24, display: "inline-block" }}>
                <span style={{ fontSize: 12, color: "#3A9B7A", fontWeight: 500 }}>✓ {skills.length} skill{skills.length !== 1 ? "s" : ""} selected</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <Btn variant="ghost" onClick={back} fullWidth={isMobile}>← Back</Btn>
                <Btn onClick={next} fullWidth={isMobile}>Continue →</Btn>
              </div>
            </div>
          )}

          {/* STEP 3 — GitHub */}
          {step === 3 && (
            <div>
              <Tag color="blush">Step 3 of 4</Tag>
              <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 24 : 28, fontWeight: 700, color: C.ink, margin: "12px 0 6px" }}>GitHub Activity</h2>
              <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 24 }}>We pull your public data — repos, commits, languages, stars.</p>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18 }}>
                <div style={{ flex: 1 }}>
                  <Input label="GitHub Username" placeholder="Enter your GitHub username" value={githubUsername} onChange={setGithubUsername} disabled={loading} />
                </div>
                <button onClick={handleFetchGithub} disabled={loading || !githubUsername.trim()} style={{ padding: "10px 20px", borderRadius: 10, background: githubUsername.trim() ? C.violet : C.border, color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 16, opacity: (!githubUsername.trim() || loading) ? 0.5 : 1, cursor: (!githubUsername.trim() || loading) ? "not-allowed" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  {loading ? <Spinner size={16} color="#fff" /> : "Fetch"}
                </button>
              </div>

              {githubData && (
                <div style={{ background: C.bg, borderRadius: 14, padding: isMobile ? 16 : 20, marginBottom: 22, border: `1.5px solid ${C.border}`, animation: "fadeUp 0.3s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {githubData.avatar && <img src={githubData.avatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%" }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{githubData.name}</div>
                      <a href={githubData.profile_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.violet }}>@{githubData.username}</a>
                      {githubData._mock && <span style={{ fontSize: 10, color: C.inkLight, marginLeft: 8 }}>(demo data — add GITHUB_TOKEN for real)</span>}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
                    {[["Repos", githubData.public_repos], ["Stars", githubData.total_stars], ["Recent Commits", githubData.recent_commits]].map(([l, v]) => (
                      <div key={l} style={{ background: C.white, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                        <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: C.violet }}>{v}</div>
                        <div style={{ fontSize: 11, color: C.inkLight, marginTop: 3 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                    {githubData.top_languages?.map(l => <Tag key={l} color="violet">{l}</Tag>)}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkLight }}>GitHub Score: <strong style={{ color: C.violet }}>{githubData.github_score}/100</strong></div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <Btn variant="ghost" onClick={back} fullWidth={isMobile}>← Back</Btn>
                <Btn onClick={next} disabled={!githubData} fullWidth={isMobile}>Continue →</Btn>
              </div>
            </div>
          )}

          {/* STEP 4 — Resume */}
          {step === 4 && (
            <div>
              <Tag color="violet">Step 4 of 4</Tag>
              <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 24 : 28, fontWeight: 700, color: C.ink, margin: "12px 0 6px" }}>Upload Resume</h2>
              <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 24 }}>AI extracts your projects, experience, and skills from your PDF.</p>

              <ResumeDropzone onFile={handleResumeUpload} loading={loading} parsed={resumeData} isMobile={isMobile} />

              {analyzing && (
                <div style={{ marginTop: 20, background: C.violetLight, borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, color: C.violet, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <Spinner size={14} /> Analyzing your complete profile…
                  </div>
                  {["Reading GitHub data", "Parsing resume", "Matching roles", "Calculating readiness score"].map((t, i) => (
                    <div key={t} style={{ fontSize: 12, color: C.inkLight, padding: "3px 0", animation: `fadeIn 0.4s ease ${i*0.55}s both` }}>· {t}</div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                <Btn variant="ghost" onClick={back} fullWidth={isMobile} disabled={analyzing}>← Back</Btn>
                <Btn onClick={handleAnalyze} disabled={!resumeData || analyzing} fullWidth={isMobile}>
                  {analyzing ? "Analyzing…" : "Analyze My Profile →"}
                </Btn>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ResumeDropzone({ onFile, loading, parsed, isMobile }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const ref = useRef();
  const handle = f => { if (!f) return; setFileName(f.name); onFile(f); };
  return (
    <div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => !loading && ref.current.click()}
        style={{ border: `2px dashed ${dragging ? C.violet : C.border}`, borderRadius: 16, padding: isMobile ? "36px 16px" : "52px 24px", textAlign: "center", background: dragging ? C.violetLight : C.bg, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
        <input ref={ref} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => handle(e.target.files[0])} />
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Spinner size={28} />
            <div style={{ fontSize: 14, color: C.violet, fontWeight: 500 }}>Parsing with AI…</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 10 }}>❋</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{fileName || "Drop your resume here"}</div>
            <div style={{ fontSize: 12, color: C.inkLight, marginTop: 4 }}>{!fileName && "PDF only · Click or drag to upload"}</div>
          </>
        )}
      </div>
      {parsed && !loading && (
        <div style={{ marginTop: 12, padding: "14px 18px", background: C.mintLight, borderRadius: 10, border: `1px solid ${C.mint}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#3A9B7A", marginBottom: 8 }}>
            ✓ Resume parsed successfully
          </div>
          {[
            `${parsed.projects?.length || 0} projects extracted`,
            `${parsed.experience?.length || 0} work experiences found`,
            `${parsed.skills?.length || 0} skills detected`,
            `${parsed.certifications?.length || 0} certifications identified`,
          ].map(item => <div key={item} style={{ fontSize: 12, color: "#5A8A74", padding: "2px 0" }}>· {item}</div>)}
          <div style={{ marginTop: 8, fontSize: 12, color: "#3A9B7A", fontWeight: 500 }}>Resume quality score: <strong>{parsed.resume_quality_score}/100</strong></div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE — real data
// ══════════════════════════════════════════════════════════════════════════════
function DashboardPage({ result, setPage }) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const [tab, setTab] = useState("overview");

  if (!result) {
    return (
      <div style={{ paddingTop: 90, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, color: C.inkLight, marginBottom: 20 }}>No analysis found. Run an analysis first.</p>
          <Btn onClick={() => setPage("Analyzer")}>Go to Analyzer →</Btn>
        </div>
      </div>
    );
  }

  const { readiness, role_fits, insights } = result;
  const breakdown = readiness?.breakdown || {};
  const subScores = [
    { label: "Academic",   score: Math.round(breakdown.academic         || 0), color: C.violet },
    { label: "Skills",     score: Math.round(breakdown.technical_skills || 0), color: "#7DD3BE" },
    { label: "GitHub",     score: Math.round(breakdown.github           || 0), color: "#F7A8C4" },
    { label: "Resume",     score: Math.round(breakdown.resume           || 0), color: C.violetMid },
  ];

  return (
    <div style={{ paddingTop: 90, minHeight: "100vh", animation: "fadeIn 0.4s ease" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>

        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 28, flexDirection: isMobile ? "column" : "row", gap: 14 }}>
          <div>
            <Tag color="mint">Analysis complete</Tag>
            <h1 style={{ fontFamily: F.display, fontSize: isMobile ? 24 : 30, fontWeight: 700, color: C.ink, marginTop: 10 }}>Your Placement Report</h1>
            <p style={{ fontSize: 13, color: C.inkLight, marginTop: 4 }}>Based on your profile, GitHub, skills, and resume.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setPage("History")} size="sm">View History</Btn>
            <Btn variant="soft" onClick={() => setPage("Analyzer")} fullWidth={isMobile}>Re-analyze</Btn>
          </div>
        </div>

        {/* Score */}
        <div style={{ display: "flex", gap: 18, marginBottom: 22, flexDirection: isMobile ? "column" : "row", flexWrap: "wrap" }}>
          <Card style={{ padding: isMobile ? "22px 18px" : "30px", display: "flex", alignItems: "center", gap: isMobile ? 18 : 28, flex: "1 1 340px", flexDirection: isMobile ? "column" : "row", textAlign: isMobile ? "center" : "left" }}>
            <ScoreRing score={readiness?.total || 0} size={isMobile ? 120 : 148} />
            <div>
              <div style={{ fontFamily: F.display, fontSize: isMobile ? 18 : 22, fontWeight: 700, color: C.ink }}>{readiness?.standing || "—"}</div>
              <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.7, marginTop: 6, maxWidth: 280 }}>{readiness?.standing_desc}</p>
              {role_fits?.[0] && <div style={{ marginTop: 12 }}><Tag color="mint">Top match: {role_fits[0].title} ({role_fits[0].fit}%)</Tag></div>}
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: isMobile ? "auto" : "0 1 260px" }}>
            {subScores.map(s => (
              <Card key={s.label} style={{ padding: "18px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, color: s.color }}>{s.score}</div>
                <div style={{ fontSize: 11, color: C.inkLight, marginTop: 4 }}>{s.label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: C.white, borderRadius: 12, padding: 4, marginBottom: 22, border: `1px solid ${C.border}`, width: isMobile ? "100%" : "fit-content" }}>
          {[["overview","Overview"],["roles","Role Fit"],["gaps","Skill Gaps"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: isMobile ? 1 : "auto", padding: isMobile ? "8px 4px" : "8px 20px", borderRadius: 10, border: "none", fontSize: isMobile ? 12 : 13, fontWeight: tab===key ? 600 : 400, background: tab===key ? C.violet : "transparent", color: tab===key ? "#fff" : C.inkLight, cursor: "pointer", transition: "all 0.15s", fontFamily: F.body }}>{label}</button>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, animation: "slideIn 0.3s ease" }}>
            <Card style={{ padding: "22px" }}>
              <h3 style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Strengths</h3>
              {(insights?.strengths || []).map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: "#3A9B7A", fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: C.ink }}>{s}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: "22px" }}>
              <h3 style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Priority Improvements</h3>
              {(insights?.improvements || []).map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < (insights.improvements.length - 1) ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.violet, fontSize: 11, fontWeight: 700, minWidth: 18, flexShrink: 0, marginTop: 2 }}>{i+1}</span>
                  <span style={{ fontSize: 13, color: C.ink }}>{s}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === "roles" && (
          <Card style={{ padding: isMobile ? "20px 16px" : "26px", animation: "slideIn 0.3s ease" }}>
            <h3 style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 18 }}>Role Compatibility</h3>
            {(role_fits || []).map((role, i) => <RoleBar key={role.id} role={role} index={i} />)}
            <div style={{ marginTop: 16, padding: "10px 14px", background: C.bg, borderRadius: 8, fontSize: 11, color: C.inkLight }}>
              Scores represent profile compatibility with typical role requirements — not hiring probability.
            </div>
          </Card>
        )}

        {tab === "gaps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "slideIn 0.3s ease" }}>
            {(role_fits || []).filter(r => r.missing?.length > 0).slice(0, 5).map((role, i) => (
              <Card key={role.id} style={{ padding: isMobile ? "18px 16px" : "22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <h3 style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, color: C.ink }}>{role.title}</h3>
                  <span style={{ fontFamily: F.display, fontSize: 13, fontWeight: 700, color: C.violet }}>{role.fit}% match</span>
                  {i === 0 && <Tag color="blush">Highest priority</Tag>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {role.missing.map(skill => (
                    <span key={skill} style={{ padding: "6px 14px", borderRadius: 99, background: C.blushLight, color: "#C4567C", fontSize: 12, fontWeight: 500 }}>+ {skill}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "24px", textAlign: "center", marginTop: 60 }}>
        <p style={{ fontSize: 12, color: C.inkLight }}>SkillMap · Built for Indian engineering students.</p>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ══════════════════════════════════════════════════════════════════════════════
function HistoryPage({ sessionId, setPage, setResult }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    getHistory(sessionId)
      .then(data => setAnalyses(data.analyses || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const loadAnalysis = async (id) => {
    try {
      const data = await getAnalysis(id);
      setResult(data.result);
      setPage("Dashboard");
    } catch (e) {
      setError(e.message);
    }
  };

  const standingColor = (s) => {
    if (s === "Excellent") return "#3A9B7A";
    if (s === "Good Standing") return C.violet;
    if (s === "Developing") return "#E08A00";
    return C.error;
  };

  return (
    <div style={{ paddingTop: 90, minHeight: "100vh", animation: "fadeIn 0.4s ease" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>
        <Tag color="violet">Your session</Tag>
        <h1 style={{ fontFamily: F.display, fontSize: isMobile ? 26 : 32, fontWeight: 700, color: C.ink, margin: "12px 0 6px" }}>Analysis History</h1>
        <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 32 }}>All your past analyses, saved automatically. Click any to reload it.</p>

        {error && <ErrorBox message={error} />}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0", color: C.inkLight }}>
            <Spinner /> Loading your history…
          </div>
        )}

        {!loading && analyses.length === 0 && (
          <Card style={{ padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>◎</div>
            <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 8 }}>No analyses yet</div>
            <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 24 }}>Run your first analysis and it'll appear here automatically.</p>
            <Btn onClick={() => setPage("Analyzer")}>Start My Analysis →</Btn>
          </Card>
        )}

        {!loading && analyses.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {analyses.map((a, i) => (
              <Card key={a.id} hover style={{ padding: "20px 24px", cursor: "pointer" }} onClick={() => loadAnalysis(a.id)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ fontFamily: F.display, fontSize: 16, fontWeight: 600, color: C.ink }}>{a.name || "Unnamed"}</span>
                      {i === 0 && <Tag color="mint">Latest</Tag>}
                    </div>
                    <div style={{ fontSize: 12, color: C.inkLight }}>{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: C.violet }}>{Math.round(a.score)}</div>
                      <div style={{ fontSize: 11, color: standingColor(a.standing), fontWeight: 600 }}>{a.standing}</div>
                    </div>
                    <span style={{ fontSize: 18, color: C.inkLight }}>→</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <Btn variant="ghost" onClick={() => setPage("Analyzer")}>+ New Analysis</Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOW IT WORKS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function HowItWorksPage({ setPage }) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const steps = [
    { n:"01", icon:"✦", title:"Fill your academic profile",    desc:"Name, college, branch, CGPA, backlogs, certifications. Under 2 minutes.", color:C.violetLight, tag:"2 min" },
    { n:"02", icon:"◈", title:"Select your technical skills",  desc:"Pick every language, framework, and tool you're genuinely comfortable with.", color:C.mintLight, tag:"1 min" },
    { n:"03", icon:"◉", title:"Connect your GitHub",           desc:"Enter your username. We auto-pull repos, commits, languages, contributions.", color:C.blushLight, tag:"30 sec" },
    { n:"04", icon:"❋", title:"Upload your resume",            desc:"PDF only. Our AI extracts projects, internships, education, certifications.", color:C.violetLight, tag:"1 min" },
    { n:"05", icon:"◎", title:"Get your full report",          desc:"Readiness score, role fit %, skill gaps, and a prioritized improvement list.", color:C.mintLight, tag:"Instant" },
  ];
  const scoring = [
    { label:"Technical Skills", weight:25, color:C.violet,    desc:"Depth and breadth of your stack" },
    { label:"GitHub Activity",  weight:25, color:"#7DD3BE",   desc:"Repos, commits, project quality" },
    { label:"Academic Profile", weight:20, color:C.blush,     desc:"CGPA, backlogs, certifications" },
    { label:"Resume Quality",   weight:20, color:C.violetMid, desc:"Projects, experience, clarity" },
    { label:"Coding Profiles",  weight:10, color:"#F7C4A8",   desc:"LeetCode, HackerRank, etc." },
  ];
  return (
    <div style={{ paddingTop: 90, animation: "fadeIn 0.4s ease" }}>
      <section style={{ textAlign: "center", padding: isMobile ? "40px 20px 48px" : "60px 24px 80px", maxWidth: 680, margin: "0 auto" }}>
        <Tag color="violet">Transparent process</Tag>
        <h1 style={{ fontFamily: F.display, fontSize: isMobile ? 34 : 48, fontWeight: 700, color: C.ink, marginTop: 16, marginBottom: 16, letterSpacing: "-0.02em" }}>How SkillMap works</h1>
        <p style={{ fontSize: isMobile ? 14 : 16, color: C.inkLight, lineHeight: 1.7 }}>No black box. Here's exactly how we analyze your profile and what goes into your score.</p>
      </section>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: isMobile ? "0 16px 50px" : "0 24px 80px" }}>
        {steps.map((step, i) => (
          <div key={step.n} style={{ display: "flex", gap: isMobile ? 14 : 22 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: step.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, border: `1.5px solid ${C.border}` }}>{step.icon}</div>
              {i < steps.length-1 && <div style={{ width: 1.5, flex: 1, background: C.border, margin: "6px 0", minHeight: 20 }} />}
            </div>
            <Card style={{ flex: 1, padding: isMobile ? "16px 18px" : "20px 24px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <span style={{ fontFamily: F.display, fontSize: 11, fontWeight: 600, color: C.inkLight, letterSpacing: "0.06em" }}>{step.n}</span>
                <Tag color="ink">{step.tag}</Tag>
              </div>
              <h3 style={{ fontFamily: F.display, fontSize: isMobile ? 15 : 17, fontWeight: 600, color: C.ink, marginBottom: 5 }}>{step.title}</h3>
              <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.65 }}>{step.desc}</p>
            </Card>
          </div>
        ))}
      </section>
      <section style={{ background: C.white, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "40px 16px" : "80px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 28 : 44 }}>
            <Tag color="ink">Scoring formula</Tag>
            <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 26 : 34, fontWeight: 700, color: C.ink, marginTop: 14, letterSpacing: "-0.02em" }}>How your score is calculated</h2>
          </div>
          <Card style={{ padding: isMobile ? "20px 18px" : "30px 28px" }}>
            {scoring.map((s, i) => (
              <div key={s.label} style={{ marginBottom: i < scoring.length-1 ? 20 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, flexWrap: "wrap", gap: 4 }}>
                  <div><span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{s.label}</span>{!isMobile && <span style={{ fontSize: 12, color: C.inkLight, marginLeft: 8 }}>{s.desc}</span>}</div>
                  <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 700, color: C.violet }}>{s.weight}%</span>
                </div>
                <div style={{ height: 7, background: C.bg, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${s.weight*4}%`, background: s.color, borderRadius: 99, opacity: 0.8 }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </section>
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <Btn size="lg" onClick={() => setPage("Analyzer")}>Start My Analysis →</Btn>
      </div>
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: C.inkLight }}>SkillMap · Built for Indian engineering students.</p>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABOUT PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AboutPage({ setPage }) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile", isTablet = bp === "tablet";
  const gridCols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3,1fr)";
  return (
    <div style={{ paddingTop: 90, animation: "fadeIn 0.4s ease" }}>
      <section style={{ textAlign: "center", padding: isMobile ? "40px 20px 48px" : "60px 24px 80px", maxWidth: 680, margin: "0 auto" }}>
        <Tag color="violet">Our story</Tag>
        <h1 style={{ fontFamily: F.display, fontSize: isMobile ? 32 : 46, fontWeight: 700, color: C.ink, marginTop: 16, marginBottom: 16, letterSpacing: "-0.02em" }}>Built by students,<br />for students</h1>
        <p style={{ fontSize: isMobile ? 14 : 16, color: C.inkLight, lineHeight: 1.75 }}>SkillMap started as a frustration. We were 3rd-year engineering students who had no idea what companies actually looked for. So we built the tool we wished we had.</p>
      </section>
      <section style={{ background: C.white, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: isMobile ? "40px 16px" : "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: F.display, fontSize: isMobile ? 26 : 34, fontWeight: 700, color: C.ink, textAlign: "center", marginBottom: isMobile ? 28 : 48, letterSpacing: "-0.02em" }}>What we believe</h2>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 20 }}>
            {[
              { icon:"◎", title:"Honesty over hype",  desc:"We don't claim to predict hiring outcomes. We show you where your profile stands.", color:C.violetLight },
              { icon:"✦", title:"Depth over breadth", desc:"We analyze 5 real signals well instead of 20 poorly. Quality beats feature count.", color:C.mintLight },
              { icon:"◈", title:"Students first",      desc:"No upsells, no premium tiers, no data selling. Built for engineering students.", color:C.blushLight },
            ].map(v => (
              <Card key={v.title} style={{ padding: "26px 22px" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: v.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{v.icon}</div>
                <h3 style={{ fontFamily: F.display, fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 7 }}>{v.title}</h3>
                <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.65 }}>{v.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section style={{ padding: isMobile ? "0 16px 56px" : "60px 24px 80px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Card style={{ padding: isMobile ? "30px 20px" : "40px", background: C.violetLight, border: `1.5px solid ${C.violetMid}` }}>
          <h3 style={{ fontFamily: F.display, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: C.ink, marginBottom: 10 }}>Try SkillMap now</h3>
          <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 20 }}>Free. No account. 6 minutes.</p>
          <Btn onClick={() => setPage("Analyzer")} fullWidth={isMobile}>Analyze My Profile →</Btn>
        </Card>
      </section>
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "26px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: C.inkLight }}>SkillMap · Built for Indian engineering students · 2026</p>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("Home");
  const [result, setResult] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Init session on mount
  useEffect(() => {
    getOrCreateSession()
      .then(id => setSessionId(id))
      .catch(() => {}); // silent fail — app works without session
  }, []);

  const navigate = p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <>
      <GlobalStyles />
      <Navbar page={page} setPage={navigate} />
      {page === "Home"         && <HomePage         setPage={navigate} />}
      {page === "How It Works" && <HowItWorksPage   setPage={navigate} />}
      {page === "Analyzer"     && <AnalyzerPage     setPage={navigate} setResult={setResult} sessionId={sessionId} />}
      {page === "Dashboard"    && <DashboardPage    result={result}    setPage={navigate} />}
      {page === "History"      && <HistoryPage      sessionId={sessionId} setPage={navigate} setResult={setResult} />}
      {page === "About"        && <AboutPage        setPage={navigate} />}
    </>
  );
}