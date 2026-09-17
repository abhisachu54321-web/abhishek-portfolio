/**
 * Zero-overhead-unless-enabled perf HUD.
 * Toggle: `?debug` in the URL or press Shift+P.
 * Refreshes on FPS samples only (~1.7 Hz), never inside the render loop.
 */
export function initDebugHud(perf, renderer) {
  const enabled =
    new URLSearchParams(location.search).has('debug') ||
    (() => { try { return localStorage.getItem('hud') === '1'; } catch { return false; } })();

  let hud = null;
  const mount = () => {
    hud = document.createElement('div');
    hud.className = 'perf-hud';
    document.body.appendChild(hud);
  };
  const unmount = () => { hud?.remove(); hud = null; };

  if (enabled) mount();

  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.code === 'KeyP') {
      hud ? unmount() : mount();
      try { localStorage.setItem('hud', hud ? '1' : '0'); } catch { /* no-op */ }
    }
  });

  perf.onSample((s) => {
    if (!hud) return;
    const info = renderer.info.render;
    hud.textContent =
      `${s.fps.toFixed(0).padStart(3)} fps  ${s.frameMs.toFixed(1)} ms\n` +
      `tier ${s.tier}  dpr ${s.dpr.toFixed(2)}\n` +
      `calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k`;
  });
}
