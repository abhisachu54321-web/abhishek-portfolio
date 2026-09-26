import gsap from 'gsap';

/**
 * Floating project preview: a single element that follows the cursor with
 * damped quickTo motion (transforms only). Its artwork is pure CSS gradients
 * driven by two custom properties — zero image downloads, zero decodes.
 */
export function initWorkPreview(perf) {
  if (perf.isTouch || window.matchMedia('(max-width: 900px)').matches) return;

  const preview = document.getElementById('work-preview');
  const art = preview?.querySelector('span');
  const list = document.querySelector('.work__list');
  if (!preview || !art || !list) return;

  const xTo = gsap.quickTo(preview, 'x', { duration: 0.55, ease: 'power3.out' });
  const yTo = gsap.quickTo(preview, 'y', { duration: 0.55, ease: 'power3.out' });
  const rTo = gsap.quickTo(preview, 'rotation', { duration: 0.6, ease: 'power3.out' });
  gsap.set(preview, { xPercent: -50, yPercent: -118, autoAlpha: 0, scale: 0.92 });

  let lastX = 0;
  list.addEventListener('pointermove', (e) => {
    xTo(e.clientX);
    yTo(e.clientY);
    rTo(gsap.utils.clamp(-9, 9, (e.clientX - lastX) * 0.35));
    lastX = e.clientX;
  }, { passive: true });

  list.querySelectorAll('.project').forEach((row) => {
    row.addEventListener('pointerenter', () => {
      preview.style.setProperty('--pc1', row.dataset.c1);
      preview.style.setProperty('--pc2', row.dataset.c2);
      gsap.to(preview, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'power3.out', overwrite: true });
    });
  });
  list.addEventListener('pointerleave', () => {
    gsap.to(preview, { autoAlpha: 0, scale: 0.92, duration: 0.35, ease: 'power2.inOut', overwrite: true });
  });
}
