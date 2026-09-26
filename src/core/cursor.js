import gsap from 'gsap';

/**
 * Custom cursor: a dot that tracks 1:1 and a ring that eases after it,
 * both moved exclusively with GPU transforms via gsap.quickTo.
 * Delegated hover detection — one pointerover/out pair for the whole app.
 * Completely skipped on touch devices.
 */
export function initCursor(perf) {
  if (perf.isTouch) return;

  const root = document.querySelector('.cursor');
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!root || !dot || !ring) return;

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power2.out' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power2.out' });
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.38, ease: 'power3.out' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.38, ease: 'power3.out' });

  let seen = false;
  window.addEventListener('pointermove', (e) => {
    if (!seen) { gsap.set([dot, ring], { x: e.clientX, y: e.clientY }); seen = true; }
    dotX(e.clientX); dotY(e.clientY);
    ringX(e.clientX); ringY(e.clientY);
  }, { passive: true });

  const HOVERABLE = 'a, button, [data-hover], .skills__group';
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest?.(HOVERABLE)) root.classList.add('is-hover');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.(HOVERABLE)) root.classList.remove('is-hover');
  }, { passive: true });
}
