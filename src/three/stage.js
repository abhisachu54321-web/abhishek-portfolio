import * as THREE from 'three';
import { HeroObject } from './heroObject.js';
import { Particles } from './particles.js';

// Hand-tuned shader palette — disable color management so the hex values we
// picked land on screen exactly as written (no double sRGB transforms).
THREE.ColorManagement.enabled = false;

/**
 * Stage — owns the ONE WebGL context for the whole site.
 *
 * Frame-loop discipline:
 *  - single rAF, delta-time clamped (spikes from tab switches ignored)
 *  - all animation is time/derivative based → identical motion on any Hz
 *  - damped (exponential) mouse parallax + scroll → butter, no springs
 *  - hard sleep when: tab hidden, window blurred, or hero scrolled away
 *  - adaptive DPR driven by PerformanceManager
 */
export class Stage {
  #onResize;
  #onPointerMove;
  #onVisibility;
  #onBlur;
  #onFocus;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/perf.js').PerformanceManager} perf
   */
  constructor(canvas, perf) {
    this.perf = perf;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: perf.tier === 'high',
      alpha: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(perf.dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    this.camera.position.set(0, 0.1, 7.2);

    this.hero = new HeroObject(perf);
    this.dust = new Particles(perf);
    this.scene.add(this.hero, this.dust);

    // Smoothed inputs (targets set by listeners, values damped per-frame)
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.scroll = { p: 0, target: 0 };

    this.clock = new THREE.Clock();
    this.elapsed = 0;          // shader time — advances only while animating
    this._running = false;
    this._visible = true;      // hero region on screen
    this._inFocus = true;      // tab visible & window focused
    this._rafId = 0;
    this._resizeQueued = false;
    this._introBoost = 1;      // extra bloom of scale during the intro reveal

    this.onFirstFrame = null;  // set by main.js — released the preloader

    this.#bindEvents();
    this.#resize();
    this.start();
  }

  /** Called by the scroll system with 0..1 progress of the hero leaving. */
  setScrollProgress(p) { this.scroll.target = p; }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    this._rafId = requestAnimationFrame(this.#tick);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }

  setHeroVisible(visible) {
    this._visible = visible;
    // Fade the (now frozen) canvas out so no stale frame lingers behind
    // content sections; the loop hard-stops immediately → 0% GPU/CPU.
    this.canvas.classList.toggle('is-dimmed', !visible);
    this.#syncPower();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.#onResize);
    window.removeEventListener('pointermove', this.#onPointerMove);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    window.removeEventListener('blur', this.#onBlur);
    window.removeEventListener('focus', this.#onFocus);
    this.hero.dispose();
    this.dust.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }

  /* ------------------------------------------------------------ */

  #bindEvents() {
    this.#onResize = () => {
      if (this._resizeQueued) return;
      this._resizeQueued = true; // coalesce to one resize per frame
      requestAnimationFrame(() => { this.#resize(); this._resizeQueued = false; });
    };
    this.#onPointerMove = (e) => {
      this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    this.#onVisibility = () => {
      this._inFocus = !document.hidden && document.hasFocus();
      this.#syncPower();
    };
    this.#onBlur = () => { this._inFocus = false; this.#syncPower(); };
    this.#onFocus = () => {
      if (document.hidden) return;
      this._inFocus = true;
      this.#syncPower();
    };

    window.addEventListener('resize', this.#onResize, { passive: true });
    window.addEventListener('pointermove', this.#onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', this.#onVisibility);
    window.addEventListener('blur', this.#onBlur);
    window.addEventListener('focus', this.#onFocus);

    // Adaptive DPR: PerformanceManager re-targets, we only apply it.
    this.perf.onDprChange((dpr) => {
      this.renderer.setPixelRatio(dpr);
      this.dust.setPixelRatio(dpr);
      this.#resize();
    });

    // Wake the loop when the hero scrolls back into view.
    this.io = new IntersectionObserver(
      ([entry]) => this.setHeroVisible(entry.isIntersecting),
      { rootMargin: '35% 0px 35% 0px' },
    );
    const heroEl = document.querySelector('.hero');
    if (heroEl) this.io.observe(heroEl);
  }

  #syncPower() {
    const shouldRender = this._visible && this._inFocus;
    if (shouldRender) this.start();
    else this.stop(); // rAF fully cancelled → GPU + CPU idle at ~0
  }

  #resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Nudge the object off-center less aggressively on narrow screens.
    const narrow = w / h < 0.9;
    this.hero.blob.position.x = narrow ? 0 : 1.15;
    this.hero.shell.position.x = this.hero.blob.position.x;
    this.camera.position.z = narrow ? 9.2 : 7.2;
    this.camera.updateProjectionMatrix();
  }

  #tick = () => {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this.#tick);

    const dt = Math.min(this.clock.getDelta(), 0.1); // hard clamp spikes
    this.perf.update(dt);
    this.elapsed += dt;

    // Frame-rate independent exponential damping (≈240 Hz, feels identical):
    const damp = (lambda) => 1 - Math.exp(-lambda * dt);
    const p = this.pointer;
    p.x += (p.tx - p.x) * damp(4.2);
    p.y += (p.ty - p.y) * damp(4.2);
    this.scroll.p += (this.scroll.target - this.scroll.p) * damp(3.4);

    const t = this.elapsed;
    this.hero.update(t, dt);
    this.dust.update(t, dt);

    // Camera drift from pointer (parallax), scroll pushes past the object.
    const sp = this.scroll.p;
    this.camera.position.x = p.x * 0.34;
    this.camera.position.y = 0.1 + p.y * 0.22 - sp * 1.9;
    this.camera.position.z = (window.innerWidth / window.innerHeight < 0.9 ? 9.2 : 7.2) - sp * 1.1;
    this.camera.lookAt(this.hero.blob.position.x * 0.72, -sp * 0.6, 0);

    // Scroll also gently expands the form before we leave it.
    this.hero.blob.rotation.x = sp * 0.65;
    const scale = 1 - sp * 0.18;
    this.hero.blob.scale.setScalar(scale * this._introBoost);
    this.hero.shell.rotation.z = sp * 0.4;

    this.renderer.render(this.scene, this.camera);

    if (this.onFirstFrame) {
      this.onFirstFrame();
      this.onFirstFrame = null;
    }
  };
}
