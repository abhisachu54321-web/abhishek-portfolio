import '@fontsource-variable/space-grotesk';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { PerformanceManager } from './core/perf.js';
import { Stage } from './three/stage.js';
import { initScroll } from './core/scroll.js';
import { initCursor } from './core/cursor.js';
import { initNav } from './core/nav.js';
import { initReveals, playIntro } from './ui/reveals.js';
import { initWorkPreview } from './ui/workPreview.js';
import { initDebugHud } from './three/debugHud.js';

gsap.registerPlugin(ScrollTrigger);

const boot = () => {
  const perf = new PerformanceManager();
  document.documentElement.dataset.tier = perf.tier;

  // --- WebGL stage ---------------------------------------------------------
  // Guarded: on GPU-blocklisted browsers context creation can throw, and
  // that must never take the rest of the site down with it.
  const canvas = document.getElementById('gl');
  let stage = null;
  try {
    stage = new Stage(canvas, perf);
  } catch (err) {
    console.warn('[portfolio] WebGL unavailable — using CSS hero fallback.', err);
    document.documentElement.classList.add('no-webgl');
    if (canvas) canvas.style.display = 'none';
  }

  // Progress-agnostic handles so downstream systems never touch null.
  const progressTarget = {
    setScrollProgress: (p) => stage?.setScrollProgress(p),
  };

  if (stage) initDebugHud(perf, stage.renderer);

  const scroll = initScroll(perf, progressTarget);
  initNav({ ...scroll, perf });
  initCursor(perf);
  initReveals(perf);
  initWorkPreview(perf);

  // Diagnostics for support/verification (read-only).
  window.__BOOTED__ = true;
  window.__APP__ = {
    perf,
    stage,
    get info() {
      if (!stage) return { webgl: false };
      const r = stage.renderer.info.render;
      return { webgl: true, calls: r.calls, triangles: r.triangles, tier: perf.tier, dpr: perf.dpr, fps: perf.fps };
    },
  };
  console.info(`[portfolio] boot ok — tier=${perf.tier}, dpr=${perf.dpr}, webgl=${!!stage}`);
  setTimeout(() => console.info('[portfolio] render state →', window.__APP__.info), 1600);

  /* -------------------------- preloader -------------------------- */
  const preloader = document.getElementById('preloader');
  const count = document.getElementById('preloader-count');
  const bar = document.getElementById('preloader-bar');

  const state = { value: 0 };        // 0 → 1
  const renderProgress = () => {
    const pct = Math.round(state.value * 100);
    if (count) count.textContent = String(pct).padStart(3, '0');
    if (bar) bar.style.transform = `scaleX(${state.value})`;
  };

  // Assets that matter: webfonts + the first painted WebGL frame.
  let fontsReady = false;
  let firstFrame = !stage; // no WebGL → fonts are the only gate
  document.fonts.ready.then(() => { fontsReady = true; });
  if (stage) stage.onFirstFrame = () => { firstFrame = true; };

  // Drive the counter with rAF (not timers) toward the true readiness.
  const MIN_TIME = perf.reducedMotion ? 0.05 : 0.7;
  const start = performance.now();

  const step = (now) => {
    const elapsed = (now - start) / 1000;
    const ready = (fontsReady ? 0.5 : 0) + (firstFrame ? 0.5 : 0);
    const timeFloor = Math.min(1, elapsed / MIN_TIME) * 0.85;
    const target = Math.max(ready, timeFloor);
    // ease toward target so the counter always feels smooth
    state.value += (target - state.value) * 0.14;
    renderProgress();

    const settled = Math.abs(1 - state.value) < 0.01;
    const timedOut = elapsed > 2.6; // never trap the user on a slow machine
    if ((ready >= 1 && settled) || timedOut) {
      state.value = 1;
      renderProgress();
      finish();
      return;
    }
    requestAnimationFrame(step);
  };

  const finish = () => {
    if (!preloader) { playIntro(); return; }
    preloader.classList.add('is-done');
    preloader.addEventListener('transitionend', () => preloader.remove(), { once: true });
    setTimeout(() => preloader.parentNode && preloader.remove(), 900); // safety
    if (perf.reducedMotion) gsap.set('[data-intro]', { clearProps: 'all' });
    else playIntro();
    // ScrollTrigger measurements are only valid once visible.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  requestAnimationFrame(step);

  /* ----------------------- housekeeping -------------------------- */
  // Fonts arriving can change line breaks → remeasure triggers.
  document.fonts.ready.then(() => ScrollTrigger.refresh());

  // Free the GPU context if the page is being discarded.
  window.addEventListener('pagehide', () => stage?.dispose(), { once: true });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
