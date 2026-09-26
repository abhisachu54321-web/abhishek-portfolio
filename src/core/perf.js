/**
 * PerformanceManager
 * ------------------
 * Central authority for adaptive quality.
 *
 * - Detects a quality tier (high / medium / low) once, up front, from a
 *   combination of UA, deviceMemory, hardwareConcurrency and the GL string.
 * - Picks a devicePixelRatio cap per tier.
 * - Runs a rolling FPS monitor; every 600 ms it can nudge the render
 *   resolution down (if struggling) or back up (if there's headroom),
 *   with cooldown + hysteresis so it never oscillates per-frame.
 * - Everything animation-related elsewhere is delta-time driven, so
 *   motion speed is identical on 60 Hz and 240 Hz displays.
 */

export const TIER = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

const DPR_CAP = { [TIER.HIGH]: 2.0, [TIER.MEDIUM]: 1.5, [TIER.LOW]: 1.0 };
const DPR_FLOOR = 0.7;

export class PerformanceManager {
  constructor() {
    this.isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.tier = this.#detectTier();

    this.dprCap = DPR_CAP[this.tier];
    if (this.reducedMotion) this.dprCap = Math.min(this.dprCap, 1.5);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);

    // Live stats (updated ~1.7x per second)
    this.fps = 60;
    this.frameMs = 16.7;

    // Rolling-window accumulators
    this._acc = 0;
    this._frames = 0;
    this._window = 0;
    this._cooldown = 0;

    this._dprListeners = new Set();
    this._sampleListeners = new Set();
  }

  /** Subscribe to DPR changes: fn(dpr) */
  onDprChange(fn) { this._dprListeners.add(fn); return () => this._dprListeners.delete(fn); }
  /** Subscribe to every FPS sample: fn({fps, frameMs, tier, dpr}) */
  onSample(fn) { this._sampleListeners.add(fn); return () => this._sampleListeners.delete(fn); }

  /** Call once per frame with clamped delta seconds. */
  update(dt) {
    // Ignore tab-switch spikes so they don't poison the average.
    if (dt > 0.25) return;

    this._acc += dt;
    this._frames += 1;
    this._window += dt;

    if (this._window >= 0.6) {
      this.frameMs = (this._acc / this._frames) * 1000;
      this.fps = 1000 / this.frameMs;
      this._acc = 0;
      this._frames = 0;
      this._window = 0;
      this.#autoTune();
      const snap = this.snapshot();
      this._sampleListeners.forEach((fn) => fn(snap));
    }
  }

  snapshot() {
    return { fps: this.fps, frameMs: this.frameMs, tier: this.tier, dpr: this.dpr };
  }

  /* ------------------------------------------------------------ */

  #autoTune() {
    if (this._cooldown > 0) { this._cooldown -= 0.6; return; }
    const deviceDpr = window.devicePixelRatio || 1;
    const ceiling = Math.min(deviceDpr, this.dprCap);

    if (this.fps < 48 && this.dpr > DPR_FLOOR + 0.01) {
      // Struggling → drop internal resolution a step.
      this.dpr = Math.max(DPR_FLOOR, +(this.dpr - 0.25).toFixed(2));
      this._cooldown = 1.8;
      this._dprListeners.forEach((fn) => fn(this.dpr));
    } else if (this.fps > 57.5 && this.dpr < ceiling) {
      // Note: at 90/120/144 Hz this is comfortably exceeded, so capable
      // machines walk back up to full sharpness quickly.
      this.dpr = Math.min(ceiling, +(this.dpr + 0.25).toFixed(2));
      this._cooldown = 3.0;
      this._dprListeners.forEach((fn) => fn(this.dpr));
    }
  }

  #detectTier() {
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const gpu = this.#gpuRenderer();

    // Software rasterizer (headless CI, very old machines) → lowest cost.
    if (/swiftshader|llvmpipe|softpipe|software/i.test(gpu)) return TIER.LOW;
    if (mobile || mem <= 3 || cores <= 4) return TIER.LOW;
    if (mem <= 4 || cores <= 6 || /intel.*(hd|uhd) graphics [4-6]\d\d/i.test(gpu)) return TIER.MEDIUM;
    return TIER.HIGH;
  }

  #gpuRenderer() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return '';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return String(renderer || '');
    } catch {
      return '';
    }
  }
}
