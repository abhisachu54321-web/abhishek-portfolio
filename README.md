# Abhishek S — Portfolio

A performance-first, single-canvas Three.js portfolio. Built with vanilla JS + Vite,
GSAP/ScrollTrigger, and Lenis smooth scrolling. No frameworks, no images, no post-processing
— every pixel is either a shader or a GPU transform.

Real-person portfolio for Abhishek S — Computer Science Engineering student
(B.Tech CSE, UKF College of Engineering and Technology). Projects: Aura AI,
Timetable Generator, Smart Door, Temperature Alert System.
GitHub: https://github.com/abhisachu54321-web ·
LinkedIn: https://www.linkedin.com/in/abhishek-s-a4511a340

## Stack

| Layer    | Choice                                   | Why |
|----------|------------------------------------------|-----|
| 3D       | Three.js, one `WebGLRenderer`, one scene | single context, 3 draw calls total |
| Motion   | GSAP + ScrollTrigger + Lenis             | one ticker drives both → physics never desync |
| Styles   | Hand-written CSS, custom properties      | ~5 KB gzip, zero runtime cost |
| Fonts    | Self-hosted Space Grotesk (variable)     | no CDN round trips |
| Build    | Vite 7, manual chunks (three / motion)   | ~187 KB total JS gzip, parallel-loaded |

## Performance architecture (mapped to the brief)

### Adaptive quality — decides once, adjusts forever
`src/core/perf.js` detects a tier (`high / medium / low`) from `deviceMemory`,
`hardwareConcurrency`, UA and the GL renderer string (software rasterizers are caught
explicitly), then:

- **Geometry density** — icosahedron subdivisions 4 / 3 / 2 (~21k → 1.5k tris)
- **Particles** — 1600 / 900 / 420 points, switched via `setDrawRange` on a
  pre-allocated buffer (zero re-allocation, zero GPU re-uploads at runtime)
- **Antialias** — enabled only on the high tier
- **Adaptive DPR** — a rolling FPS monitor nudges internal resolution up/down in
  0.25 steps between 0.7 and the tier cap, with cooldown + hysteresis so it
  never oscillates. Frame-time-based → behaves identically on 60–240 Hz panels.

### High refresh rate first
- Every moving thing is **delta-time driven** (seconds, not frames): rotation
  speeds, damping (`1 - e^(-λdt)` exponential decay), the marquee (px/second),
  camera parallax, scroll smoothing.
- Nothing is hard-coded to 30/60 FPS — motion speed is identical at 90, 120,
  144, 165, 240 Hz; higher Hz just means more frames of the same motion.
- Single clamped `THREE.Clock` delta (spikes from tab-switches are discarded).

### GPU discipline
- Blob morph is fully **vertex-shader driven** (simplex displacement + re-derived
  normals): zero per-frame CPU allocation.
- Particle sprites computed from `gl_PointCoord` — **no textures at all**, plus a
  hard point-size clamp + distance fade.
- Shader material with two wrap-light dot products instead of a light rig;
  `ColorManagement` disabled so the palette renders as authored.
- **3 draw calls, ~0.2–21k tris** depending on tier. No bloom, no composer passes.
- Full disposal path (`pagehide`): geometries, materials, renderer, context.

### Power & paint hygiene
- rAF loop **hard-stops** (0% GPU/CPU) when: hero scrolled out of view
  (IntersectionObserver with lookahead margin), tab hidden, or window blurred.
  The canvas cross-fades out so no stale frame lingers behind content.
- All scroll handlers passive; one Lenis scroll callback fans out to
  ScrollTrigger + header state + hero progress.
- Animations touch only `transform` / `opacity`; `will-change` is cleared after
  reveals (`clearProps`).
- Marquee pauses off-screen; cursor disabled on touch; reduced-motion users get
  native scrolling, near-static shaders, and instant reveals.

### Debug HUD
Add `?debug` to the URL or press **Shift+P**: FPS, frame ms, tier, DPR,
draw calls, tris. Persists via localStorage.

## Audit results (headless Chromium, *software rasterizer*)

- Console errors: **0** · page errors: **0**
- FPS: **51–59 avg under SwiftShader** (real GPUs will sit at display refresh cap)
- JS heap: **flat 10.0 MB** after aggressive scroll cycling (no leaks)
- Total payload: **~187 KB gzip JS + ~46 KB fonts** — procedural everything

## Commands

```bash
npm run dev      # dev server with HMR
npm run build    # production build → dist/
npm run preview  # serve the production build (port 4173)
```

## Project layout

```
src/
  main.js              boot, preloader, wiring
  core/perf.js         tier detection, FPS monitor, adaptive DPR
  core/scroll.js       Lenis ⇄ ScrollTrigger sync
  core/cursor.js       GPU-only custom cursor
  core/nav.js          anchors, active-section, mobile menu
  three/stage.js       renderer, loop, pause logic, camera
  three/heroObject.js  simplex-displaced icosahedron + wire shell
  three/particles.js   draw-range particle field
  three/debugHud.js    Shift+P HUD
  ui/reveals.js        char splits, scroll reveals, marquee
  ui/workPreview.js    cursor-following project preview
```
