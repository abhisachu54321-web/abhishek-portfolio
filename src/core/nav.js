import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Navigation: anchor smooth-scroll, active-section highlighting via
 * ScrollTrigger (observer-based, zero per-frame cost), and the mobile
 * overlay menu with a short transform-only open animation.
 */
export function initNav({ lenis, scrollTo, perf }) {
  // --- Anchor links -------------------------------------------------------
  document.querySelectorAll('[data-scroll-to]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id?.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(id);
      closeMenu();
      if (id === '#top') { lenis ? lenis.scrollTo(0) : window.scrollTo(0, 0); return; }
      scrollTo(target);
    });
  });

  document.getElementById('to-top')?.addEventListener('click', () => {
    lenis ? lenis.scrollTo(0) : window.scrollTo(0, 0);
  });

  // --- Active section highlight ------------------------------------------
  const links = [...document.querySelectorAll('.nav__list a')];
  const byId = new Map(
    links.filter((a) => a.hash).map((a) => [a.hash.slice(1), a]),
  );
  byId.forEach((link, id) => {
    const section = document.getElementById(id);
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 45%',
      end: 'bottom 45%',
      onToggle: (self) => link.classList.toggle('is-active', self.isActive),
    });
  });

  // --- Mobile menu --------------------------------------------------------
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobile-menu');
  const items = menu ? [...menu.querySelectorAll('a, .mmenu__foot')] : [];
  let open = false;

  function openMenu() {
    open = true;
    burger.classList.add('is-open');
    burger.setAttribute('aria-expanded', 'true');
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    lenis?.stop();
    if (!perf.reducedMotion) {
      gsap.fromTo(items,
        { y: 34, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out', stagger: 0.05, overwrite: true });
    }
    menu.querySelector('a')?.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!open) return;
    open = false;
    burger.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    lenis?.start();
    burger.focus({ preventScroll: true });
  }

  burger?.addEventListener('click', () => (open ? closeMenu() : openMenu()));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
}
