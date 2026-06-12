/* ============================================================
   EXHIBIT PX-01 — ui.js
   HUD readouts · stage/phase card switching · horizontal
   timeline scrub · counters · mixer instrument · reveals
   ============================================================ */

"use strict";

(function ui() {
  const $ = id => document.getElementById(id);
  const clamp01 = x => Math.max(0, Math.min(1, x));

  /* ---------------- reveals ---------------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  /* ---------------- counters ---------------- */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    const suf = el.dataset.suffix || "";
    const t0 = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - t0) / 1500);
      const v = target * (1 - Math.pow(1 - t, 3));
      el.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf;
      if (t < 1) requestAnimationFrame(tick);
    })(t0);
  }
  const cio = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]").forEach(el => cio.observe(el));

  /* ---------------- RGB mixer instrument ---------------- */
  (function mixer() {
    const sw = $("swatch"), read = $("swatchRead");
    if (!sw) return;
    const r = $("mixR"), g = $("mixG"), b = $("mixB");
    const rv = $("mixRv"), gv = $("mixGv"), bv = $("mixBv");
    if (!read || !r || !g || !b || !rv || !gv || !bv) return;
    function update() {
      const R = +r.value, G = +g.value, B = +b.value;
      sw.style.background = `rgb(${R},${G},${B})`;
      sw.style.boxShadow = `0 0 60px -8px rgba(${R},${G},${B},0.55)`;
      read.textContent = `rgb(${R}, ${G}, ${B})`;
      rv.textContent = R; gv.textContent = G; bv.textContent = B;
    }
    [r, g, b].forEach(s => s.addEventListener("input", update));
    update();
  })();

  /* live progress through a section's pinned scroll range, 0..1 */
  function pinProgress(el) {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    return clamp01(-r.top / Math.max(1, el.offsetHeight - vh));
  }

  /* ---------------- section registry ---------------- */
  const SECTIONS = [
    { id: "hero",      name: "00 — TITLE" },
    { id: "briefing",  name: "01 — BRIEFING" },
    { id: "flight",    name: "02 — 3D VIEW PHASE" },
    { id: "molecules", name: "03 — MOLECULAR EXHIBIT" },
    { id: "timeline",  name: "04 — PIXEL TIMELINE" },
    { id: "data",      name: "05 — DATA SHEET" },
    { id: "end",       name: "06 — REFERENCES" }
  ].map(s => ({ ...s, el: $(s.id) }));

  const hudScroll = $("hudScroll"), hudCam = $("hudCam"), hudSec = $("hudSec");
  const beamFill = $("beamFill");
  const navLinks = [...document.querySelectorAll("#hudNav a")];

  /* ---------------- flight stage cards + rail ---------------- */
  const flightEl = $("flight");
  const stageCards = [...document.querySelectorAll("#stageCards .stage-card")];
  const railItems = [...document.querySelectorAll("#stageRail .sr-item")];
  let lastStage = -1;

  /* ---------------- molecule phase cards ---------------- */
  const molEl = $("molecules");
  const molCards = [...document.querySelectorAll("#molCards .mol-card")];
  const molT = $("molT"), molField = $("molField");
  let lastPhase = -1;

  /* ---------------- timeline scrub ---------------- */
  const tlSection = $("timeline");
  const tlTrack = $("tlTrack");
  const tlRuler = $("tlRuler");
  const tlCursor = $("tlCursor");
  const ghosts = [...document.querySelectorAll(".ghost-year")];
  // ruler ticks — one per card
  if (tlRuler) {
    const n = tlTrack.children.length;
    for (let i = 0; i < n; i++) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = (i / (n - 1)) * 100 + "%";
      tlRuler.appendChild(tick);
    }
  }

  /* ---------------- master per-frame loop ---------------- */
  function loop() {
    requestAnimationFrame(loop);
    const s = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    const pct = max > 0 ? s / max : 0;

    /* HUD */
    if (hudScroll) hudScroll.textContent = String(Math.round(pct * 100)).padStart(3, "0") + "%";
    if (beamFill) beamFill.style.height = (pct * 100).toFixed(2) + "%";
    if (hudCam && window.PX) {
      const c = window.PX.cam;
      const fmt = v => (v >= 0 ? "+" : "") + v.toFixed(1);
      hudCam.textContent = `${fmt(c.x)} / ${fmt(c.y)} / ${fmt(c.z)}`;
    }

    /* active section */
    let active = SECTIONS[0];
    const ref = s + vh * 0.38;
    for (const sec of SECTIONS) if (sec.el && sec.el.offsetTop <= ref) active = sec;
    if (hudSec && hudSec.textContent !== active.name) hudSec.textContent = active.name;
    navLinks.forEach(a => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + active.id);
    });

    /* flight stage cards — computed DIRECTLY from live layout (decoupled from 3D) */
    if (flightEl && stageCards.length) {
      const fp = pinProgress(flightEl);
      const st = Math.min(stageCards.length - 1, Math.floor(fp * stageCards.length));
      if (st !== lastStage) {
        lastStage = st;
        stageCards.forEach((c, i) => c.classList.toggle("on", i === st));
        railItems.forEach((r, i) => r.classList.toggle("on", i <= st));
      }
    }

    /* molecule phase cards + readout — also direct from layout */
    if (molEl && molCards.length) {
      const mp = pinProgress(molEl);
      const ph = mp < 0.34 ? 0 : mp < 0.62 ? 1 : 2;
      if (ph !== lastPhase) {
        lastPhase = ph;
        molCards.forEach((c, i) => c.classList.toggle("on", i === ph));
      }
      // transmission: bright (twisted) → dark (field applied) across phase 2→3
      const m2 = clamp01((mp - 0.5) / 0.32);
      if (molT) molT.textContent = Math.round(Math.pow(Math.cos(m2 * Math.PI / 2), 2) * 100) + "%";
      if (molField) molField.textContent = m2 > 0.2 ? "ON" : "OFF";
    }

    /* timeline horizontal scrub + ghost-year parallax */
    if (tlSection && tlTrack) {
      const top = tlSection.offsetTop, h = tlSection.offsetHeight;
      const p = clamp01((s - top) / (h - vh));
      const travel = Math.max(0, tlTrack.scrollWidth - window.innerWidth * 0.42);
      const x = -p * travel;
      tlTrack.style.transform = `translate3d(${x}px, 0, 0)`;
      // ghost years drift slower than their cards — layered depth
      const lag = -x * 0.16;
      for (const gh of ghosts) gh.style.transform = `translate3d(${lag}px, 0, 0)`;
      if (tlCursor) tlCursor.style.left = (p * 100).toFixed(2) + "%";
    }
  }
  loop();

  /* smooth-scroll for HUD nav (anchor jumps feel mechanical otherwise) */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    });
  });
})();
