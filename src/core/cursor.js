import gsap from 'gsap';

/**
 * Unified pointer cursor (Pointer Events — one code path for mouse,
 * trackpad, pen, Android and iOS touch, plus hybrid devices).
 *
 * - fine pointers (mouse/trackpad/pen): dot + ring always visible once the
 *   pointer first moves; ring eases behind with quickTo interpolation.
 * - touch: no fake permanent cursor — the indicator appears on contact,
 *   interpolates while the finger moves, and fades out shortly after
 *   the finger lifts. pointer-events: none + passive listeners, so it can
 *   never block scrolling or taps.
 * - All motion is GPU transforms only (gsap.quickTo, no layout work).
 */
export function initCursor(perf) {
  const root = document.querySelector('.cursor');
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!root || !dot || !ring) return;

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power2.out' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power2.out' });
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.38, ease: 'power3.out' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.38, ease: 'power3.out' });

  const show = () => gsap.to(root, { autoAlpha: 1, duration: 0.25, overwrite: true });
  const hide = () => gsap.to(root, { autoAlpha: 0, duration: 0.4, delay: 0.35, overwrite: true });

  let touching = false;
  let fineSeen = false;

  const place = (x, y) => { dotX(x); dotY(y); ringX(x); ringY(y); };

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touching = true;
    root.classList.add('is-touch');
    gsap.set([dot, ring], { x: e.clientX, y: e.clientY }); // no glide-in — instant attach
    show();
  }, { passive: true });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (touching) place(e.clientX, e.clientY);
      return;
    }
    // mouse / pen / trackpad
    if (!fineSeen) {
      gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
      root.classList.remove('is-touch');
      fineSeen = true;
      show();
    } else if (!gsap.isTweening(root) && root.style.visibility === 'hidden') {
      show();
    }
    place(e.clientX, e.clientY);
  }, { passive: true });

  const endTouch = (e) => {
    if (e.pointerType !== 'touch' || !touching) return;
    touching = false;
    root.classList.remove('is-touch');
    hide(); // fade away after interaction ends
  };
  window.addEventListener('pointerup', endTouch, { passive: true });
  window.addEventListener('pointercancel', endTouch, { passive: true });

  // Hover growth (fine pointers only — no hover concept on touch)
  const HOVERABLE = 'a, button, [data-hover], .skills__group';
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest?.(HOVERABLE)) root.classList.add('is-hover');
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest?.(HOVERABLE)) root.classList.remove('is-hover');
  }, { passive: true });
}
