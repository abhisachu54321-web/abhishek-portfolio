import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis-powered smooth scrolling, driven by GSAP's ticker so scroll physics,
 * ScrollTrigger, and the WebGL loop can never fall out of sync.
 * Native scrolling is kept for touch input and reduced-motion users.
 */
export function initScroll(perf, stage) {
  gsap.ticker.lagSmoothing(0); // never let GSAP "catch up" after a spike

  if (perf.reducedMotion) {
    // Respect the OS setting: no virtual scroll, instant anchor jumps.
    const hero = document.querySelector('.hero');
    window.addEventListener('scroll', () => {
      const max = Math.max(1, (hero?.offsetHeight ?? window.innerHeight) * 0.9);
      stage.setScrollProgress(Math.min(1, window.scrollY / max));
    }, { passive: true });
    return { lenis: null, scrollTo: (el) => el?.scrollIntoView() };
  }

  const lenis = new Lenis({
    lerp: 0.105,              // ~95ms settle time — smooth but decisive
    smoothWheel: true,
    syncTouch: false,         // native elastic feel on touchscreens
    overscroll: false,
    wheelMultiplier: 1,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));

  // Feed hero-leaving progress to the stage (sole scroll listener doing work).
  const hero = document.querySelector('.hero');
  lenis.on('scroll', ({ scroll }) => {
    const max = Math.max(1, (hero?.offsetHeight ?? window.innerHeight) * 0.9);
    stage.setScrollProgress(Math.min(1, scroll / max));
    document.getElementById('header')?.classList.toggle('is-scrolled', scroll > 40);
  });

  const scrollTo = (el) => {
    if (el) lenis.scrollTo(el, { offset: -20, duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
  };

  return { lenis, scrollTo };
}
