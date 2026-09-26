import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Text splitting + scroll reveals.
 * - Headings: char-split once at init (tiny DOM cost), played once per
 *   section via ScrollTrigger with `once: true` so nothing lingers.
 * - Blocks: opacity + translateY only (composite-thread friendly).
 */
export function splitChars(el) {
  if (el.dataset.splitDone) return [...el.querySelectorAll('.char')];
  const text = el.textContent;
  el.textContent = '';
  el.setAttribute('aria-label', text.trim());
  const frag = document.createDocumentFragment();
  for (const ch of text) {
    if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch;
    span.setAttribute('aria-hidden', 'true');
    frag.appendChild(span);
  }
  el.appendChild(frag);
  el.dataset.splitDone = '1';
  return [...el.querySelectorAll('.char')];
}

export function initReveals(perf) {
  const reduced = perf.reducedMotion;

  // Section headings: slide chars up on first scroll into view.
  document.querySelectorAll('[data-split]').forEach((el) => {
    const chars = splitChars(el);
    if (reduced) return;
    const isHeroTitle = !!el.closest('.hero');
    if (isHeroTitle) return; // handled by the intro timeline
    gsap.from(chars, {
      yPercent: 112,
      duration: 0.7,
      ease: 'power3.out',
      stagger: 0.022,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // Generic block reveals — played exactly once each.
  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    if (reduced) return;
    gsap.fromTo(el,
      { y: 36, autoAlpha: 0 },
      {
        y: 0, autoAlpha: 1,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete() { gsap.set(el, { clearProps: 'will-change' }); },
      });
  });

  // Pause the marquee's CSS animation while it's off-screen.
  const track = document.getElementById('marquee-track');
  if (track) {
    const marquee = track.parentElement;
    const dup = track.querySelector('span');
    if (dup && !reduced) track.appendChild(dup.cloneNode(true)); // seamless loop needs 2x
    track.style.animation = 'none';
    let offset = 0, last = performance.now(), running = true;
    const width = () => (dup ? dup.getBoundingClientRect().width : 0);
    const step = (now) => {
      requestAnimationFrame(step);
      if (!running) { last = now; return; }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      offset -= dt * 62; // px per second — time based, refresh-rate agnostic
      const w = width();
      if (w > 0 && -offset >= w) offset += w;
      track.style.transform = `translate3d(${offset}px,0,0)`;
    };
    new IntersectionObserver(([e]) => { running = e.isIntersecting; }, { rootMargin: '10%' })
      .observe(marquee);
    requestAnimationFrame(step);
  }
}

/** Intro: runs once after the preloader lifts. */
export function playIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  const heroChars = [];
  document.querySelectorAll('.hero__title [data-split]').forEach((el) => {
    heroChars.push(...splitChars(el));
  });
  gsap.set('[data-intro]', { autoAlpha: 0, y: 24 });
  gsap.set(heroChars, { yPercent: 112 });

  tl.to(heroChars, { yPercent: 0, duration: 0.9, stagger: 0.028 }, 0.05)
    .to('[data-intro]', { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.09 }, 0.35)
    .add(() => gsap.set('[data-intro], .hero__title .char', { clearProps: 'will-change' }));
  return tl;
}
