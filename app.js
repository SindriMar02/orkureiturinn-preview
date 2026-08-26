/* Orkureiturinn — likova.space engine transplant (VIDE INFRA framework behaviour,
   restyled to SAFÍR's brand). scroller (lerp .1 + gravity wells ±30svh + snap) ·
   parallax keyframe engine · terrace-wipe chapter transitions · reveal system ·
   split titles · lazy media · preloader · themed header · menu · stat beats ·
   unit selector (real inventory data) · favourites · callback modal.
   Engine core inherited from the Holt build (03-prototypes/hotel-holt) with its
   bug lore intact: matchMedia breakpoints, device-pixel scroll snap, rect-check
   reveals, armed-then-run transitions. No WebGL in this build. */

const html = document.documentElement;
/* Safari restores the previous scroll position when a visitor returns to the same URL,
   so the page came up mid-hero — "it lands like it's been swiped down". The preloader
   then finishes over an already-scrolled page. Own the entry point: no automatic
   restore, and start at the top unless the URL actually asks for a section. */
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
const wantsAnchor = () => { const h = location.hash.replace('#', ''); return h && h !== 'skip-preloader' && document.getElementById(h); };
if (!wantsAnchor()) window.scrollTo(0, 0);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const isMac = /Mac/.test(navigator.platform);
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Match the CSS breakpoint EXACTLY. `innerWidth >= 768` is not the same test:
   when content overflows horizontally, mobile Chrome shrink-to-fits and reports a
   ballooned innerWidth (measured 1500 on a 375px iPhone), so the JS took the
   desktop path while the CSS took the mobile one — which produced the very
   overflow that caused the zoom-out. matchMedia cannot drift from the stylesheet. */
const mdUp = () => matchMedia('(min-width: 768px)').matches;
/* MEASURED 2026-08-25 with trusted wheel input (_lagtune.mjs): the hijacked scroller
   trails a real trackpad by 57-84px and delivers only 90% of each gesture, at EVERY
   duration from 380ms down to 90ms — it can only correct once per rAF, while native
   scrolling is composited. Native trails 14px and delivers 100%. Frame rate was never
   the problem; position was (60fps the whole time, half a screen behind the finger).
   The likova snap/gravity-well fidelity is not worth that, so the hijack is off. */
const HIJACK_SCROLL = false;
const evalSmooth = () => HIJACK_SCROLL && !matchMedia('(hover: none) and (pointer: coarse)').matches
  && !matchMedia('(prefers-reduced-motion: reduce)').matches && mdUp();
let SMOOTH = evalSmooth();
html.classList.add(SMOOTH ? 'has-scroll-smooth' : 'no-scroll-smooth');
if (isTouch) html.classList.add('no-hover');

/* ---------- viewport ---------- */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100svh;pointer-events:none;visibility:hidden';
document.body.appendChild(probe);
let VH = probe.offsetHeight || innerHeight, VW = document.documentElement.clientWidth || innerWidth;
const measureViewport = () => { VH = probe.offsetHeight || innerHeight; VW = document.documentElement.clientWidth || innerWidth; PXDPR = Math.max(1, Math.min(devicePixelRatio || 1, 3)); };
const spacing = () => parseFloat(getComputedStyle(html).getPropertyValue('--spacing')) || 20;

/* ---------- easings ---------- */
const E = {
  linear: t => t,
  easeInQuad: t => t * t, easeOutQuad: t => t * (2 - t), easeInOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t ** 3, easeOutCubic: t => 1 - (1 - t) ** 3, easeInOutCubic: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  easeOutExpo: t => t === 1 ? 1 : 1 - 2 ** (-10 * t),
  easeSection: t => 2 * t - t * t, easeSectionInverse: t => t * t,
};
const bezier = (x1, y1, x2, y2) => {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1, B = (a1, a2) => 3 * a2 - 6 * a1, C = a1 => 3 * a1;
  const calc = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const s = slope(t, x1, x2); if (!s) break; t -= (calc(t, x1, x2) - x) / s; }
    return calc(t, y1, y2);
  };
};
const easeSnap = bezier(.25, 0, .35, 1);
/* kononenkogroup.com's Lenis curve: duration .947s, easing 1 − 2^(−11.19t).
   Front-loaded — 85.6% of the move is done by t=.25 — so input feels immediate
   while the tail settles for the rest of the second. */
const easeLenis = t => t === 1 ? 1 : 1 - Math.pow(2, -11.19 * t);
let SCROLL_DUR = 380;
const easeHouse = bezier(.7, 0, .3, 1);

/* ---------- doc positions (layout, transform-free) ---------- */
const docTop = el => { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; };
/* Geometry cache for the scroll modules: measured once per layout, read per frame.
   Reading offsetTop inside the rAF loop forces a synchronous layout every time. */
const geo = (() => {
  const reg = [];
  const track = el => { const o = { el, top: 0, h: 0 }; reg.push(o); return o; };
  const measure = () => { for (const o of reg) { o.top = docTop(o.el); o.h = o.el.offsetHeight; } };
  return { track, measure };
})();
const docLeft = el => { let x = 0; while (el) { x += el.offsetLeft; el = el.offsetParent; } return x; };

/* ============================================================
   SCROLLER
   ============================================================ */
const scroller = (() => {
  const s = { y: scrollY, target: scrollY, limit: 0, moving: false, wells: [], snaps: [], listeners: [] };
  const LERP = .12, BAND = () => VH * .25;
  let snapTimer = 0, tween = null, lastWheel = 0, expected = -1;
  const setLimit = () => { s.limit = Math.max(0, document.scrollingElement.scrollHeight - innerHeight); };
  const wellFactor = y => {
    let f = 1;
    for (const w of s.wells) { const d = Math.abs(y - w); if (d < BAND()) f = Math.min(f, clamp((d / BAND() + .35) / 1.35)); }
    return f;
  };
  const inBand = y => s.wells.some(w => Math.abs(y - w) < BAND());
  const onWheel = e => {
    if (!SMOOTH || html.classList.contains('with-modal')) return;
    e.preventDefault();
    let d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? VH : 1);
    if (isMac) d *= .9;
    if (inBand(s.target)) d *= .25;
    s.target = clamp(s.target + d, 0, s.limit);
    tween = { from: s.y, to: s.target, t0: performance.now(), dur: SCROLL_DUR, ease: easeLenis };
    lastWheel = performance.now();
    clearTimeout(snapTimer); snapTimer = setTimeout(trySnap, 250);
  };
  const onKey = e => {
    if (!SMOOTH || html.classList.contains('with-modal')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    let d = 0;
    if (e.key === 'ArrowDown') d = 240; else if (e.key === 'ArrowUp') d = -240;
    else if (e.key === ' ' || e.key === 'PageDown') d = VH * (e.shiftKey ? -1 : 1); else if (e.key === 'PageUp') d = -VH;
    else if (e.key === 'Home') { s.target = 0; } else if (e.key === 'End') { s.target = s.limit; } else return;
    e.preventDefault();
    s.target = clamp(s.target + d, 0, s.limit);
    tween = { from: s.y, to: s.target, t0: performance.now(), dur: SCROLL_DUR, ease: easeLenis };
  };
  const trySnap = () => {
    if (!s.snaps.length) return;
    const y = s.target, pts = s.snaps;
    const first = pts[0].y, last = pts[pts.length - 1].y;
    if (y < first - VH * .18 || y > last + VH * .18) return;
    const lastScrollable = pts[pts.length - 1].scrollable;
    if (lastScrollable && y > pts[pts.length - 2].y + VH * .3) return;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
    const d = Math.abs(best.y - y);
    if (d < 1 || d > VH * .14) return;      // only assist when already close
    tweenTo(best.y, 480, easeSnap);
  };
  const tweenTo = (to, dur, ease = easeHouse) => {
    const from = s.y, t0 = performance.now();
    s.target = to; tween = { from, to, t0, dur, ease };
  };
  const syncExternal = () => {
    const sy = scrollY;
    if (Math.abs(sy - expected) > 1.5 && !tween) { s.y = s.target = sy; }
  };
  /* Snap the scroll position to the device-pixel grid. The browser positions
     `position:sticky` layers on whole device pixels, while our parallax writes
     transforms from the raw fractional lerp value — the mismatch between the two
     is what read as jitter/shimmer on the pinned sections. Snapping ONCE here
     means the sticky layer and every transform derived from `scroller.y` land on
     the same grid. */
  const DPR = () => Math.max(1, Math.min(devicePixelRatio || 1, 3));
  const snap = v => Math.round(v * DPR()) / DPR();
  const write = () => { s.y = snap(s.y); expected = Math.round(s.y); window.scrollTo(0, s.y); };
  const tick = () => {
    if (!SMOOTH) { s.y = s.target = scrollY; return; }
    if (tween) {
      const t = clamp((performance.now() - tween.t0) / tween.dur);
      s.y = lerp(tween.from, tween.to, tween.ease(t));
      if (t >= 1) tween = null;
      write();
      s.moving = true;
    } else {
      const diff = s.target - s.y;
      if (Math.abs(diff) > .5) {
        s.y += diff * LERP * wellFactor(s.y);
        write();
        s.moving = true;
      } else if (s.moving) { s.y = s.target; write(); s.moving = false; }
    }
    html.classList.toggle('has-scroll-scrolling', s.moving);
  };
  const scrollToEl = (el, offset = 0) => {
    const to = clamp(docTop(el) + offset, 0, s.limit);
    if (!SMOOTH) { window.scrollTo({ top: to, behavior: reduced ? 'auto' : 'smooth' }); return; }
    const dist = Math.abs(to - s.y);
    if (dist > VH * 2) {
      const ov = $('#page-overlay'); ov.classList.add('is-on');
      setTimeout(() => { s.y = s.target = to; expected = Math.round(to); window.scrollTo(0, to); tween = null; setTimeout(() => ov.classList.remove('is-on'), 80); }, 420);
    } else tweenTo(to, 1000, easeHouse);
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', syncExternal, { passive: true });
  const resync = () => { tween = null; s.y = s.target = scrollY; expected = Math.round(s.y); s.moving = false; };
  return Object.assign(s, { tick, setLimit, scrollToEl, tweenTo, wellFactor, resync, get isTweening() { return !!tween; } });
})();

/* custom scrollbar */
(() => {
  const bar = $('#scrollbar'), thumb = $('.c-scrollbar__thumb', bar);
  let drag = false, startY = 0, startScroll = 0;
  const update = () => {
    const total = document.scrollingElement.scrollHeight;
    const h = Math.max(40, VH * VH / total);
    const hs = h + 'px'; if (hs !== thumb.__h) { thumb.style.height = hs; thumb.__h = hs; }
    const tr = `translateY(${((scroller.y / (scroller.limit || 1)) * (VH - h)).toFixed(1)}px)` + (bar.matches(':hover') || drag ? ' scaleX(1.45)' : '');
    if (tr !== thumb.__t) { thumb.style.transform = tr; thumb.__t = tr; }
  };
  thumb.addEventListener('pointerdown', e => { drag = true; startY = e.clientY; startScroll = scroller.y; bar.classList.add('is-dragging'); thumb.setPointerCapture(e.pointerId); e.preventDefault(); });
  thumb.addEventListener('pointermove', e => { if (!drag) return; const h = thumb.offsetHeight; const dy = e.clientY - startY; const to = clamp(startScroll + dy / (VH - h) * scroller.limit, 0, scroller.limit); scroller.y = scroller.target = to; window.scrollTo(0, to); });
  thumb.addEventListener('pointerup', () => { drag = false; bar.classList.remove('is-dragging'); });
  scroller.listeners.push(update);
})();

/* ============================================================
   PARALLAX ENGINE — parallax-<V>-<E>
   key scroll = measureTop + measureH*E/100 - VH*V/100 (+ off*VH)
   ============================================================ */
const sp = () => spacing();
/* device-pixel grid, re-read on resize (dragging between monitors changes DPR) */
let PXDPR = Math.max(1, Math.min(devicePixelRatio || 1, 3));
const snapUnit = (v, perUnit) => {
  const px = v * perUnit;
  return (Math.round(px * PXDPR) / PXDPR) / perUnit;
};
const snapPx = s => s
  .replace(/(-?\d*\.\d+)px/g, (m, n) => snapUnit(parseFloat(n), 1) + 'px')
  /* svh movers (the intro text and class box) land off-grid too - 40 of 320
     sampled text elements - so convert through the viewport height, snap, and
     convert back rather than leaving them on fractional pixels. */
  .replace(/(-?\d*\.\d+)svh/g, (m, n) => (VH ? snapUnit(parseFloat(n), VH / 100) : parseFloat(n)) + 'svh');
const PATTERNS = {
  /* generic (inherited) */
  sectionOutTiny: { measure: 'self', keys: el => el.classList.contains('sticky--under-next')
      ? [{ v: 200, e: 100, p: { transform: 'translateY(0svh)' } }, { v: 100, e: 100, p: { transform: 'translateY(-10svh)' } }]
      : [{ v: 100, e: 100, p: { transform: 'translateY(0svh)' } }, { v: 0, e: 100, p: { transform: 'translateY(10svh)' } }], clamp: true },
  imageMove: { measure: 'self', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(-16.667%)' } }, { v: 0, e: 100, p: { transform: 'translateY(0%)' } }], clamp: true, mobile: true },
  backgroundMove: { measure: 'closest:.section', target: 'img', keys: () => [{ v: 100, e: 0, p: { transform: 'scale(1.15) translateY(-6%)' } }, { v: 0, e: 100, p: { transform: 'scale(1.15) translateY(6%)' } }], clamp: true, mobile: true },

  /* likova terrace wipe: the incoming chapter rises under a stepped clip-path whose
     steps land on the grid columns; scrubbed until the chapter top reaches the
     viewport top. Same point count in both keys so mixStr interpolates numerically. */
  /* same keyframes as terraceWipe but WITHOUT mobile:true, so the engine drops it on
     phones — for elements where the clip is decoration, not the element's reason to exist */
  terraceWipeDesktop: { measure: 'self', keys: () => [
      { v: 130, e: 0, p: { 'clip-path': 'polygon(0% 128svh,25% 128svh,25% 107svh,50% 107svh,50% 86svh,75% 86svh,75% 65svh,100% 65svh,100% 100%,0% 100%)' } },
      { v: 0, e: 0, p: { 'clip-path': 'polygon(0% 0svh,25% 0svh,25% 0svh,50% 0svh,50% 0svh,75% 0svh,75% 0svh,100% 0svh,100% 100%,0% 100%)' } }],
    clamp: true },
  terraceWipe: { measure: 'self', keys: () => [
      { v: 130, e: 0, p: { 'clip-path': 'polygon(0% 128svh,25% 128svh,25% 107svh,50% 107svh,50% 86svh,75% 86svh,75% 65svh,100% 65svh,100% 100%,0% 100%)' } },
      { v: 0, e: 0, p: { 'clip-path': 'polygon(0% 0svh,25% 0svh,25% 0svh,50% 0svh,50% 0svh,75% 0svh,75% 0svh,100% 0svh,100% 100%,0% 100%)' } }],
    clamp: true, mobile: true },
  terraceWipeMirror: { measure: 'self', keys: () => [
      { v: 130, e: 0, p: { 'clip-path': 'polygon(0% 65svh,25% 65svh,25% 86svh,50% 86svh,50% 107svh,75% 107svh,75% 128svh,100% 128svh,100% 100%,0% 100%)' } },
      { v: 0, e: 0, p: { 'clip-path': 'polygon(0% 0svh,25% 0svh,25% 0svh,50% 0svh,50% 0svh,75% 0svh,75% 0svh,100% 0svh,100% 100%,0% 100%)' } }],
    clamp: true, mobile: true },

  /* intro — likova keyframes verbatim */
  introHead: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { transform: 'translateY(0%)' } }, { v: -100, e: 0, p: { transform: 'translateY(-101%)' } }], clamp: true, mobile: true },
  introText: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { opacity: '1', transform: 'translateY(0svh)' } }, { v: -50, e: 0, p: { opacity: '0', transform: 'translateY(-5svh)' } }], clamp: true, mobile: true },
  introContent: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { opacity: '0' } }, { v: -100, e: 0, p: { opacity: '1' } }, { v: -200, e: 0, p: { opacity: '0' } }], clamp: true, mobile: true },
  introContentText: { measure: 'closest:.section', keys: () => [{ v: -50, e: 0, p: { transform: 'translateY(5svh)' } }, { v: -100, e: 0, p: { transform: 'translateY(0svh)' } }, { v: -200, e: 0, p: { transform: 'translateY(-10svh)' } }], clamp: true, mobile: true },
  introClass: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { transform: 'translateY(10svh)' } }, { v: -100, e: 0, p: { transform: 'translateY(0svh)' } }, { v: -200, e: 0, p: { transform: 'translateY(-10svh)' } }], clamp: true, mobile: true },
  introBuilding: { measure: 'closest:.section', keys: () => [
      { v: 0, e: 0, p: { transform: 'translateY(66%)' } },
      { v: -100, e: 0, p: { transform: 'translateY(50%)' } },
      { v: -200, e: 0, p: { transform: 'translateY(10%)' } },
      { v: 200, e: 100, p: { transform: 'translateY(0%)' } },
      { v: 100, e: 100, p: { transform: 'translateY(-33%)' } }], clamp: true, mobile: true },
  introLights: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { opacity: '0' } }, { v: -140, e: 0, p: { opacity: '1' } }], clamp: true, mobile: true },
  /* intro (build) */
  heroHead: { measure: 'closest:.section', keys: () => [{ v: -120, e: 0, p: { opacity: '0', transform: 'translateY(4svh)' } }, { v: -180, e: 0, p: { opacity: '1', transform: 'translateY(0svh)' } }], clamp: true },
  ghostBeat: { measure: 'closest:.section', keys: () => [{ v: -70, e: 0, p: { opacity: '0', transform: 'translateY(-44%) translateY(10svh)' } }, { v: -150, e: 0, p: { opacity: '1', transform: 'translateY(-50%) translateY(4svh)' } }, { v: -330, e: 0, p: { opacity: '1', transform: 'translateY(-50%) translateY(-8svh)' } }], clamp: true },
  heroLights: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { opacity: '0' } }, { v: -60, e: 0, p: { opacity: '1' } }], clamp: true, mobile: true },
  heroDrift: { measure: 'closest:.section', target: 'img', keys: () => [{ v: 0, e: 0, p: { transform: 'scale(1.06) translateY(0svh)' } }, { v: -340, e: 0, p: { transform: 'scale(1.13) translateY(-6svh)' } }], clamp: true, mobile: true },
  introSticky: { measure: 'closest:.section', keys: () => [{ v: 200, e: 100, p: { transform: 'translateY(0svh)' } }, { v: 100, e: 100, p: { transform: 'translateY(-25svh)' } }], clamp: true, mobile: true },
  heroCard: { measure: 'closest:.section', keys: () => [{ v: 0, e: 0, p: { transform: 'translateY(0)' } }, { v: -120, e: 0, p: { transform: 'translateY(-24svh)' } }], clamp: true, mobile: true },

  /* generic chapter verbs */
  riseSoft: { measure: 'closest:.section', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(6svh)', opacity: '0' } }, { v: 55, e: 0, p: { transform: 'translateY(0svh)', opacity: '1' } }], clamp: true },
  driftUp: { measure: 'closest:.section', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(0px)' } }, { v: 0, e: 100, p: { transform: `translateY(${-4 * sp()}px)` } }], clamp: true },
  driftUpSlow: { measure: 'closest:.section', keys: () => [{ v: 100, e: 0, p: { transform: 'translateY(0px)' } }, { v: 0, e: 100, p: { transform: `translateY(${-2 * sp()}px)` } }], clamp: true },
  fadeHold: { measure: 'closest:.sticky', keys: () => [{ v: 0, e: 0, p: { opacity: '1' } }, { v: -100, e: 0, p: { opacity: '0' } }], clamp: true },
  stageOut: { measure: 'closest:.section', keys: () => [{ v: 80, e: 80, p: { opacity: '1' } }, { v: 95, e: 95, p: { opacity: '0' } }], clamp: true, mobile: true },
};

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;
const mixStr = (a, b, t) => {
  if (a === b) return a;
  const an = a.match(NUM) || [], bn = b.match(NUM) || [];
  if (an.length !== bn.length) return t < .5 ? a : b;
  let i = 0;
  return b.replace(NUM, () => { const v = lerp(parseFloat(an[i]), parseFloat(bn[i]), t); i++; return (Math.round(v * 10000) / 10000).toString(); });
};

const parallax = (() => {
  const groups = [];
  /* Every element we have ever written an inline style onto. Rebuilding the groups
     (on resize) drops the desktop-only patterns, but the styles they already wrote
     stayed on the element - so crossing the breakpoint left the heritage card with
     translateY(-100svh) and its title at scale(3). Clear before rebuilding. */
  const managed = new Set();
  const resolveMeasure = (el, spec, attr) => {
    if (spec === 'self') return el;
    if (spec && spec.startsWith('closest:')) return el.closest(spec.slice(8)) || el;
    if (attr) return el.closest(attr) || el;
    return el;
  };
  const build = () => {
    managed.forEach(el => { el.style.transform = ''; el.style.opacity = ''; el.style.removeProperty('clip-path'); delete el.dataset.pyOpacity; el.__pxCache = null; });
    managed.clear();
    groups.length = 0;
    const mobile = !mdUp();
    $$('[data-parallax-pattern]').forEach(el => {
      el.dataset.parallaxPattern.split(/\s+/).filter(Boolean).forEach(name => {
        const pat = PATTERNS[name];
        if (!pat || pat.skip) return;
        if (mobile && !pat.mobile) return;
        if (el.closest('.l-none-x') && mobile) return;
        const measure = resolveMeasure(el, pat.measure, el.dataset.parallaxMeasure);
        const target = pat.target ? (el.matches(pat.target) ? el : $(pat.target, el)) : el;
        if (!target) return;
        groups.push({ el, target, measure, pat, name, keys: pat.keys(target, el), clamp: pat.clamp !== false, easing: pat.easing, onUpdate: pat.onUpdate, scroll: [] });
      });
    });
    // inline JSON variant
    $$('[data-parallax-100-0],[data-parallax-0-100]').forEach(el => {
      if (mobile) return;
      const keys = [];
      for (const a of el.attributes) {
        const m = a.name.match(/^data-parallax-(-?\d+)-(-?\d+)$/);
        if (m) keys.push({ v: +m[1], e: +m[2], p: JSON.parse(a.value) });
      }
      if (!keys.length) return;
      const measure = el.closest(el.dataset.parallaxMeasure || '.section') || el;
      groups.push({ el, target: el, measure, keys, clamp: el.dataset.parallaxClamp === 'true', scroll: [] });
    });
    measure();
  };
  const measure = () => {
    for (const g of groups) {
      const top = docTop(g.measure), h = g.measure.offsetHeight;
      if (g.pat && g.pat.keys.length >= 1 && (g.name === 'landingTenetsBackground')) g.keys = g.pat.keys(g.target, g.el);
      g.scroll = g.keys.map(k => top + h * (k.e || 0) / 100 - VH * (k.v || 0) / 100 + (k.off || 0) * VH);
      // sort by scroll
      const order = g.scroll.map((s, i) => i).sort((a, b) => g.scroll[a] - g.scroll[b]);
      g.sorted = order.map(i => ({ s: g.scroll[i], k: g.keys[i] }));
    }
  };
  const apply = (y) => {
    const acc = new Map();
    for (const g of groups) {
      const ks = g.sorted; if (!ks || ks.length < 2) continue;
      const first = ks[0].s, last = ks[ks.length - 1].s;
      let props;
      if (y <= first) { if (!g.clamp && y < first - VH * 3) continue; props = ks[0].k.p; }
      else if (y >= last) { props = ks[ks.length - 1].k.p; }
      else {
        let i = 0; while (i < ks.length - 2 && y > ks[i + 1].s) i++;
        const a = ks[i], b = ks[i + 1];
        let t = (y - a.s) / (b.s - a.s || 1);
        const ez = a.k.easing || g.easing; if (ez && E[ez]) t = E[ez](t);
        props = {};
        for (const p in b.k.p) props[p] = mixStr(a.k.p[p] ?? b.k.p[p], b.k.p[p], t);
      }
      // out-of-range visibility for non-clamped groups: keep extrapolation simple (hold)
      let a = acc.get(g.target); if (!a) { a = { transform: [], opacity: 1, other: {} }; acc.set(g.target, a); }
      for (const p in props) {
        if (p === 'transform') a.transform.push(props[p]);
        else if (p === 'opacity') a.opacity *= parseFloat(props[p]);
        else if (p === 'progress') { a.progress = parseFloat(props[p]); }
        else a.other[p] = props[p];
      }
      if (g.onUpdate) { const prog = clamp((y - first) / (last - first || 1)); g.onUpdate(g.el, prog); }
    }
    acc.forEach((a, el) => {
      managed.add(el);
      const st = el.style;
      /* Every write here is guarded against its previous value. Unguarded, this
         loop re-set the same transform/opacity/dataset on every element on every
         frame — measured 820 redundant attribute writes across a 60-step sweep,
         52% of all DOM mutations on the page. */
      let c = el.__pxCache; if (!c) c = el.__pxCache = {};
      /* Snap px offsets to the DEVICE-PIXEL grid before writing. Interpolating
         between keyframes produces fractional pixel offsets (measured: 132 of 440
         sampled translateY values), and text sitting at a fractional offset is
         re-rasterised with different subpixel antialiasing every frame - that is
         the shimmer/flash while scrolling. The old smooth scroller snapped its own
         scroll position for this reason; native scrolling has no such step, so the
         snap belongs here, where it covers every mover regardless of scroller. */
      if (a.transform.length) { const t = snapPx(a.transform.join(' ')); if (t !== c.t) { st.transform = t; c.t = t; } }
      if (a.opacity !== 1 || c.o !== undefined) { const o = String(a.opacity); if (o !== c.o) { st.opacity = o; c.o = o; } }
      for (const p in a.other) { if (a.other[p] !== c[p]) { st.setProperty(p, a.other[p]); c[p] = a.other[p]; } }
      if (a.progress !== undefined && String(a.progress) !== c.pr) { el.dataset.progress = a.progress; c.pr = String(a.progress); }
    });
  };
  // scroll progress helper for custom modules: progress of measure element between two keys
  const progressOf = (measureEl, v1, e1, v2, e2, y) => {
    const top = docTop(measureEl), h = measureEl.offsetHeight;
    const s1 = top + h * e1 / 100 - VH * v1 / 100, s2 = top + h * e2 / 100 - VH * v2 / 100;
    return clamp((y - s1) / (s2 - s1 || 1));
  };
  return { build, measure, apply, progressOf, groups };
})();

/* ============================================================
   SPLITTING
   ============================================================ */
const splitTitle = (el) => {
  if (el.dataset.split) return;
  el.dataset.split = 'title';
  const centred = el.matches('.text-center') || getComputedStyle(el).textAlign === 'center';
  const tokens = [];
  const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 3) { c.textContent.split(/(\s+)/).forEach(t => { if (/^\s+$/.test(t)) tokens.push({ sp: true }); else if (t) tokens.push({ w: t, lower: /[a-zà-ÿ]/.test(t) && t === t.toLowerCase(), em: !!c.parentElement.closest('em') }); }); } else if (c.tagName === 'BR') tokens.push({ br: true }); else walk(c); }); };
  walk(el);
  el.textContent = '';
  const words = [];
  tokens.forEach(t => {
    if (t.sp) { el.appendChild(document.createTextNode(' ')); return; }
    if (t.br) { const b = document.createElement('br'); b.dataset.forced = '1'; el.appendChild(b); words.push(b); return; }
    const w = document.createElement('span'); w.className = 'word' + (t.lower ? ' is-lower' : '') + (t.em ? ' is-em' : '');
    [...t.w].forEach(ch => { const c = document.createElement('span'); c.className = 'char'; c.textContent = ch; w.appendChild(c); });
    el.appendChild(w); words.push(w);
  });
  // line detection
  const lines = []; let cur = null, lastTop = null;
  words.forEach(w => {
    if (w.tagName === 'BR') { cur = null; lastTop = null; return; }
    const top = w.offsetTop;
    if (!cur || (lastTop !== null && Math.abs(top - lastTop) > 2)) { cur = []; lines.push(cur); }
    cur.push(w); lastTop = top;
  });
  el.textContent = '';
  const maxChars = Math.max(...lines.map(l => l.reduce((n, w) => n + w.children.length, 0) + l.length - 1));
  lines.forEach((l, li) => {
    const wrap = document.createElement('span'); wrap.className = 'line-wrap'; wrap.style.setProperty('--line-index', li);
    const chars = l.reduce((n, w) => n + w.children.length, 0) + l.length - 1;
    wrap.style.setProperty('--line-char-offset', centred ? (maxChars - chars) / 2 : 0);
    const line = document.createElement('span'); line.className = 'line';
    let ci = 0;
    l.forEach((w, wi) => {
      [...w.children].forEach(c => c.style.setProperty('--char-index', ci++));
      line.appendChild(w);
      if (wi < l.length - 1) { const s = document.createElement('span'); s.className = 'whitespace'; line.appendChild(s); ci++; }
    });
    wrap.appendChild(line); el.appendChild(wrap);
  });
  el.dataset.charTotal = maxChars;
};
const splitLines = (el) => {
  if (el.dataset.split) return;
  el.dataset.split = 'lines';
  const tokens = [];
  const walk = n => { n.childNodes.forEach(c => { if (c.nodeType === 3) c.textContent.split(/(\s+)/).forEach(t => { if (/^\s+$/.test(t)) tokens.push({ sp: true }); else if (t) tokens.push({ w: t }); }); else if (c.tagName === 'BR') tokens.push({ br: true }); else if (c.tagName === 'SPAN') tokens.push({ br: true }, { sub: c.cloneNode(true) }); else walk(c); }); };
  walk(el);
  el.textContent = '';
  const words = [];
  tokens.forEach(t => {
    if (t.sp) { el.appendChild(document.createTextNode(' ')); return; }
    if (t.br) { const b = document.createElement('br'); el.appendChild(b); words.push(b); return; }
    if (t.sub) { const w = document.createElement('span'); w.className = 'word'; w.style.display = 'block'; w.appendChild(t.sub); el.appendChild(w); words.push(w); return; }
    const w = document.createElement('span'); w.className = 'word'; w.textContent = t.w; el.appendChild(w); words.push(w);
  });
  const lines = []; let cur = null, lastTop = null;
  words.forEach(w => { if (w.tagName === 'BR') { cur = null; lastTop = null; return; } const top = w.offsetTop; if (!cur || (lastTop !== null && Math.abs(top - lastTop) > 2)) { cur = []; lines.push(cur); } cur.push(w); lastTop = top; });
  el.textContent = '';
  lines.forEach((l, li) => { const line = document.createElement('span'); line.className = 'line'; line.style.setProperty('--line-index', li); l.forEach((w, wi) => { line.appendChild(w); if (wi < l.length - 1) line.appendChild(document.createTextNode(' ')); }); el.appendChild(line); });
  el.dataset.lineTotal = lines.length;
};

/* ============================================================
   TRANSITION ENGINE
   ============================================================ */
const DUR = { rise: 800, title: 1400, subtitle: 1400, text: 1000, 'fade-in': 400, 'fade-out': 400, 'zoom-in': 400, 'slide-in-bottom': 400, 'slide-in-top': 400, 'slide-in': 1000, fast: 200, slow: 1000, block: 1600 };
/* Split into two halves so a reveal can be ARMED (split + inactive state applied)
   while the element is still hidden, and only RUN later. Doing both at once meant
   the finished text was on screen for the whole reveal delay before it animated. */
const prepareTransition = (el, names) => {
  const list = names.split(/\s+/).filter(Boolean);
  if (list.includes('title')) splitTitle(el);
  if (list.includes('text')) splitLines(el);
  const cls = [];
  list.forEach(n => cls.push('animation', `animation--${n}`, `animation--${n}--inactive`));
  el.classList.add(...cls, 'disable-transitions');
  void el.offsetWidth;                       // flush, so the inactive state is what paints
  return { list, cls };
};
const runTransition = (el, prepared, cb) => {
  const { list, cls } = prepared;
  let dur = Math.max(...list.map(n => DUR[n] || 400));
  if (list.includes('block')) dur = 1600; else if (list.includes('slow')) dur = 1000; else if (list.includes('fast')) dur = 200;
  if (list.includes('title')) dur = 1400 + (+el.dataset.charTotal || 0) * 39;
  if (list.includes('text')) dur = 1000 + (+el.dataset.lineTotal || 0) * 40;
  el.classList.remove('disable-transitions');
  requestAnimationFrame(() => {
    list.forEach(n => { el.classList.remove(`animation--${n}--inactive`); el.classList.add(`animation--${n}--active`); });
    setTimeout(() => {
      el.classList.remove(...cls, ...list.map(n => `animation--${n}--active`));
      cb && cb();
    }, dur + 90);
  });
};
const transition = (el, names, cb) => runTransition(el, prepareTransition(el, names), cb);

/* ============================================================
   REVEAL
   ============================================================ */
const reveal = (() => {
  let started = false;
  const done = (el, name) => { el.removeAttribute('data-reveal'); el.setAttribute('data-reveal-old', name); };
  const show = (el, extraDelay = 0) => {
    if (el.hasAttribute('data-reveal-visible')) return;
    const name = el.dataset.reveal;
    const delay = (+el.dataset.revealDelay || 0) + extraDelay;
    const overshoot = el.getBoundingClientRect().bottom < 0;
    if (overshoot || reduced) { el.setAttribute('data-reveal-visible', ''); done(el, name); return; }
    // arm while still hidden, THEN drop the hidden state: the inactive state is
    // what paints, never the finished text
    // touch: one cheap rise instead of splitting every character
    const effective = mdUp() ? name : name.split(/\s+/).map(n => (n === 'title' || n === 'subtitle' || n === 'text') ? 'rise' : n).join(' ');
    const prepared = prepareTransition(el, effective);
    el.setAttribute('data-reveal-visible', '');
    setTimeout(() => runTransition(el, prepared, () => done(el, name)), mdUp() ? delay : Math.min(delay, 260));
  };
  /* Trigger on VISUAL position, not on IntersectionObserver boxes.
     Most titles here live inside pinned/parallaxed layers, and IO reports the
     element's TRANSFORMED box: a line can be sitting in the middle of the screen
     while its IO box is still a viewport away, so the reveal fired long after the
     text was already on screen (that is the "fades in too late" and the blank-then-
     pop glitch). A rect check each frame is accurate under transforms, and 50-odd
     reads at 10Hz is cheap. Reads run before the parallax writes, so no thrash. */
  let pending = [];
  const ENTER = .88;                     // fire once the top edge is inside 88% of the viewport
  const start = () => {
    if (started) return; started = true;
    if (reduced) { $$('[data-reveal]').forEach(el => { el.setAttribute('data-reveal-visible', ''); el.setAttribute('data-reveal-old', el.dataset.reveal); el.removeAttribute('data-reveal'); }); return; }
    pending = $$('[data-reveal]').map(el => {
      const group = el.closest('[data-reveal-group]');
      return { el, group, trigger: group || el, delay: group ? (+group.dataset.revealDelay || 30) : 0 };
    });
    /* Split EVERY reveal target up front. Splitting rewrites the DOM into
       line/word/char spans, which can change an element's measured height by a
       few px — doing that lazily at trigger time made whole sections grow and
       shrink mid-scroll and shifted every chapter below (measured: reiturinn
       2125→2137→2120). Split once, before anything scrolls, then re-measure. */
    if (mdUp()) pending.forEach(p => {
      const n = p.el.dataset.reveal || '';
      if (n.includes('title')) splitTitle(p.el);
      if (n.includes('text')) splitLines(p.el);
    });
    check();
  };
  const check = () => {
    if (!pending.length) return;
    const still = [];
    for (const p of pending) {
      if (p.el.hasAttribute('data-reveal-visible')) continue;
      const r = p.trigger.getBoundingClientRect();
      if (!r.height && !r.width) { still.push(p); continue; }
      if (r.top < VH * ENTER && r.bottom > 0) show(p.el, p.delay);
      else if (r.bottom <= 0) show(p.el, 0);          // scrolled past before it ever fired
      else still.push(p);
    }
    pending = still;
  };
  let lastCheck = 0;
  const tick = now => {
    if (!started || now - lastCheck < 100) return; lastCheck = now;
    check();
  };
  return { start, tick, get pending() { return pending.length > 0; } };
})();

/* ============================================================
   LAZY MEDIA (appear)
   ============================================================ */
const media = (() => {
  const imgs = $$('img[data-img]');
  imgs.forEach(img => {
    const name = img.dataset.img, ws = img.dataset.w.split(/\s+/).map(Number);
    img.dataset.srcset = ws.map(w => `assets/img/${name}@${w}.webp ${w}w`).join(', ');
    img.dataset.src = `assets/img/${name}@${ws[Math.min(1, ws.length - 1)]}.webp`;
    img.loading = 'lazy'; img.decoding = 'async';
    if (!img.sizes) img.sizes = img.closest('.reitur__pair, .ucard, .lines__stagebox, .arch__card figure, .team__card') ? '50vw' : '100vw';
  });
  const load = img => {
    if (img.dataset.loaded) return; img.dataset.loaded = '1';
    /* Our observer IS the lazy mechanism. Native loading="lazy" applies its own
       heuristics on top and will not fetch an image sitting inside a zero-area
       clip-path'd beat, so the src was set but never requested. Hand it back to
       eager the moment we decide to load. */
    img.loading = 'eager';
    img.srcset = img.dataset.srcset; img.src = img.dataset.src;
    const done = () => img.classList.add('is-loaded');
    if (img.decode) img.decode().then(done, done); else img.onload = done;
  };
  /* Inactive .dalur__beat / .arch__slide are clipped to ZERO AREA by clip-path, and an
     element with an empty intersection rect NEVER fires IntersectionObserver — so their
     images only loaded when the beat activated, popping in blank. Observe a stable
     ancestor for those and load every image it holds. */
  const anchorOf = img => img.closest('.dalur__beat, .ib-slide, .arch__slide')
    ? (img.closest('.sticky__layer') || img.closest('.section') || img) : img;
  const pre = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    pre.unobserve(en.target);
    (en.target.matches('img[data-img]') ? [en.target] : $$('img[data-img]', en.target)).forEach(load);
  }), { rootMargin: '1600px 0px' });
  new Set(imgs.map(anchorOf)).forEach(a => pre.observe(a));
  $$('.intro__img, .header__logo-mark, .modal__img').forEach(i => { if (i.complete) i.classList.add('is-loaded'); else i.addEventListener('load', () => i.classList.add('is-loaded')); });
  if ('requestIdleCallback' in window) requestIdleCallback(() => imgs.forEach(i => { if (!i.closest('.l-none-x') || mdUp()) load(i); }), { timeout: 8000 });
  return { load };
})();

/* ============================================================
   PRELOADER
   ============================================================ */
const preloader = (() => {
  const el = $('#preloader'), counter = $('#preloader-counter'), fill = $('#preloader-fill');
  const skip = location.hash === '#skip-preloader';
  const MIN = 1200; const t0 = performance.now();
  let assets = 0, total = 2, shown = 0, done = false;
  const hero = $('.intro__img');
  const bump = () => { assets++; };
  if (!hero) bump(); else if (hero.complete) bump(); else { hero.addEventListener('load', bump); hero.addEventListener('error', bump); }
  document.fonts.ready.then(bump);
  const finish = (cb) => {
    if (done) return; done = true;
    setTimeout(() => {
      /* likova handoff: the stepped preloader block's two pieces fly onto the
         hero's real white step (head band + bookmark) and the curtain fades. */
      const block = $('.preloader__block', el), head = $('.js-intro-head'), bm = $('.js-intro-bookmark'), plogo = $('.preloader__logo', el);
      if (block && head && bm) {
        const b = block.getBoundingClientRect();
        const bandH = parseFloat(getComputedStyle($('.intro__head')).getPropertyValue('--head-h')) || head.firstElementChild ? head.getBoundingClientRect().height : 0;
        const hr = head.getBoundingClientRect(), br = bm.getBoundingClientRect();
        const bandRect = { x: 0, y: 0, w: VW, h: hr.height - br.height };
        const to = (r) => `translate(${(r.x - b.left).toFixed(1)}px,${(r.y - b.top).toFixed(1)}px) scale(${(r.w / b.width).toFixed(4)},${(r.h / b.height).toFixed(4)})`;
        el.style.setProperty('--pb-a-to', to(bandRect));
        el.style.setProperty('--pb-b-to', to({ x: br.left, y: br.top, w: br.width, h: br.height }));
      }
      el.classList.add('is-done');
      setTimeout(() => { el.classList.add('is-removed'); }, 1500);
      cb();
    }, skip ? 0 : 1000);
  };
  const tick = (cb) => {
    const p = Math.min(1, ((performance.now() - t0) / MIN + assets / total) / 2);
    shown = lerp(shown, p, .15);
    if (fill) fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    if (counter) counter.textContent = Math.round(shown * 100);
    if (p >= 1 && shown > .995) finish(cb);
  };
  return { skip, tick, finish, el };
})();

/* ============================================================
   THEMED HEADER + TOP + HIDE
   ============================================================ */
const header = (() => {
  const h = $('#header');
  let collapsed = false;
  const sections = $$('[data-themed]');
  let ranges = [];
  const measure = () => { ranges = sections.map(s => ({ top: docTop(s), bottom: docTop(s) + s.offsetHeight, cls: s.dataset.themed })); };
  let lastCls = '';
  const tick = y => {
    const line = y + 30;
    let cur = ranges[0];
    for (const r of ranges) if (line >= r.top && line < r.bottom) { cur = r; }
    // later sections overlap earlier ones (negative margins): pick the last match
    for (let i = ranges.length - 1; i >= 0; i--) { if (line >= ranges[i].top && line < ranges[i].bottom) { cur = ranges[i]; break; } }
    if (cur && cur.cls !== lastCls) {
      h.classList.remove('ui-dark', 'ui-light', 'ui-gradient', 'ui-intro');
      h.classList.add(...cur.cls.split(/\s+/)); lastCls = cur.cls;
    }
    h.classList.toggle('header--top', y <= 10);
    /* likova stickyHeader, scrollOffset:"screen" — collapse once past one screen */
    const edge = VH - h.offsetHeight;
    if (!collapsed && y > edge) { collapsed = true; h.classList.add('header--collapsed'); }
    else if (collapsed && y < edge - 40) { collapsed = false; h.classList.remove('header--collapsed'); }
  };
  return { measure, tick, el: h };
})();

/* ============================================================
   OVERLAYS — one owner for the scroll lock and the layer
   ============================================================ */
/* The menu and the booking panel are both full-screen and both sat at z-index 9.
   Opening the menu from behind an open booking panel put it underneath, so the
   hamburger looked dead, and closing either one dropped the shared `with-modal`
   flag while the other was still open, which let the page scroll away behind it.
   One registry now: opening an overlay closes any other, and the scroll lock is
   derived from what is actually open rather than toggled by whoever ran last. */
const overlays = (() => {
  const closers = new Map();
  const live = new Set();
  const sync = () => html.classList.toggle('with-modal', live.size > 0);
  return {
    register: (name, closeFn) => closers.set(name, closeFn),
    opened(name) {
      closers.forEach((fn, other) => { if (other !== name && live.has(other)) fn(); });
      live.add(name); sync();
    },
    closed(name) { live.delete(name); sync(); },
    closeAll() { closers.forEach((fn, name) => { if (live.has(name)) fn(); }); },
    has: (name) => live.has(name),
    get any() { return live.size > 0; },
  };
})();

/* ============================================================
   MENU
   ============================================================ */
const menu = (() => {
  const modal = $('#menu'), list = $('.js-menu-list'), scrollerEl = $('.js-menu-scroller'), toggle = $('.js-menu-toggle');
  let open = false, mouseY = .5, ty = 0, cy = 0;
  const show = () => {
    if (open) return;
    overlays.opened('menu');
    open = true; modal.classList.remove('is-hidden'); modal.setAttribute('aria-hidden', 'false'); void modal.offsetWidth;
    modal.classList.add('is-open'); html.classList.add('with-modal-menu'); toggle.setAttribute('aria-expanded', 'true');
    const active = $$('.js-menu-link').find(a => { const id = a.getAttribute('href'); const el = $(id); return el && docTop(el) <= scroller.y + VH * .5 && docTop(el) + el.offsetHeight > scroller.y + VH * .5; });
    $$('.js-menu-link').forEach(a => a.classList.toggle('is-active', a === active));
  };
  const hide = () => {
    if (!open) return;
    open = false; modal.classList.remove('is-open'); modal.classList.add('is-closing'); html.classList.remove('with-modal-menu'); toggle.setAttribute('aria-expanded', 'false');
    overlays.closed('menu');
    setTimeout(() => { modal.classList.remove('is-closing'); modal.classList.add('is-hidden'); modal.setAttribute('aria-hidden', 'true'); }, 420);
  };
  overlays.register('menu', hide);
  /* The burger is the one exit that is always on screen, above every overlay. If
     something else is open it dismisses that first rather than opening the menu
     underneath it. */
  toggle.addEventListener('click', () => {
    if (!open && overlays.any) { overlays.closeAll(); return; }
    open ? hide() : show();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && open) hide(); });
  $$('.js-menu-link').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); const t = $(a.getAttribute('href')); hide(); if (t) setTimeout(() => scroller.scrollToEl(t, t.id === 'tenets' ? -VH * .62 : 0), 200); });
    a.addEventListener('mouseenter', () => list.classList.add('is-hovering'));
    a.addEventListener('mouseleave', () => list.classList.remove('is-hovering'));
  });
  modal.addEventListener('mousemove', e => { mouseY = e.clientY / innerHeight; });
  const tick = () => {
    if (!open || !mdUp()) return;
    const over = list.offsetHeight - scrollerEl.offsetHeight + 120;
    ty = over > 0 ? -over * mouseY : 0;
    cy = lerp(cy, ty, .1);
    list.style.transform = `translateY(${cy.toFixed(2)}px)`;
  };
  return { tick, hide, isOpen: () => open };
})();
/* ============================================================
   HASH LINKS
   ============================================================ */
$$('a[href^="#"]').forEach(a => {
  if (a.classList.contains('js-menu-link')) return;
  a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const t = $(id); if (!t) return;
    /* the wordmark and Map sit in the header, above any open overlay: going
       somewhere on the page has to dismiss what is covering it */
    overlays.closeAll();
    e.preventDefault();
    const off = t.id === 'tenets' ? -VH * .62 : 0;
    scroller.scrollToEl(t, off);
  });
});

/* ============================================================
   WELLS + SNAPS
   ============================================================ */
/* Snap/well keys are FORWARD offsets into the chapter: `viewport:100` means one
   viewport height INTO the pinned stage (likova's own convention). The inherited
   Sobha formula subtracted instead, which put every snap point BEFORE its own
   section — so a wheel input inside a chapter was yanked backwards to a phantom
   point above it. That was the glitchy scroll. */
const measureWellsSnaps = () => {
  const key = (top, h, p) => top + h * (p.element || 0) / 100 + VH * (p.viewport || 0) / 100;
  scroller.wells = [];
  $$('[data-gravity-well]').forEach(el => { const top = docTop(el), h = el.offsetHeight; JSON.parse(el.dataset.gravityWell).forEach(w => scroller.wells.push(key(top, h, w))); });
  scroller.snaps = [];
  $$('[data-snap]').forEach(el => {
    const top = docTop(el), h = el.offsetHeight, limit = top + Math.max(0, h - VH);
    JSON.parse(el.dataset.snap).forEach(p => {
      const y = key(top, h, p);
      if (y >= top - 1 && y <= limit + 1) scroller.snaps.push({ y, scrollable: !!p.scrollable });
    });
  });
  scroller.snaps.sort((a, b) => a.y - b.y);
};

/* ============================================================
   LÍNURNAR — the three interior lines; hover/tap crossfades the stage image
   ============================================================ */
const lines = (() => {
  const root = $('.js-lines'); if (!root) return {};
  const tabs = $$('.js-line-tab', root), stages = $$('.js-line-stage', root);
  const set = i => {
    tabs.forEach((t, k) => t.classList.toggle('is-active', k === i));
    stages.forEach((s, k) => s.classList.toggle('is-active', k === i));
  };
  tabs.forEach((t, i) => {
    t.addEventListener('mouseenter', () => set(i));
    t.addEventListener('focus', () => set(i));
    t.addEventListener('click', () => set(i));
  });
  set(0);
  return {};
})();

/* ============================================================
   FAVOURITES — localStorage id list + header counter (likova contract)
   ============================================================ */
const favourites = (() => {
  const KEY = 'ork-fav';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let ids = read();
  const counters = $$('.js-fav-count');
  const sync = () => {
    counters.forEach(c => { c.textContent = ids.length; c.closest('.js-fav-chip')?.classList.toggle('is-on', ids.length > 0); });
    $$('[data-fav-id]').forEach(b => b.classList.toggle('is-fav', ids.includes(b.dataset.favId)));
  };
  const toggle = id => {
    ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch {}
    sync();
  };
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-fav-id]');
    if (b) { e.preventDefault(); toggle(b.dataset.favId); }
  });
  return { sync, get ids() { return ids; } };
})();

/* ============================================================
   VALMYNDIN — the parametric unit selector over the REAL inventory
   (assets/units.js → window.ORK_UNITS, harvested from orkureiturinn.is).
   Filters: rooms, floor, status; sort: price/size; favourites per row.
   ============================================================ */
const selector = (() => {
  const root = $('.js-selector'); if (!root) return { measure() {} };
  const listEl = $('.js-units', root), countEl = $('.js-units-count', root), emptyEl = $('.js-units-empty', root);
  const units = (window.ORK_UNITS || []).slice();
  const state = { size: [42, 249], floor: [1, 8], status: 'all', sort: 'id', dir: 1 };
  const PAGE = 9; let shown = PAGE;
  const moreBtn = $('.js-more', root);
  const fmtPrice = u => u.price ? (u.price / 1e6).toLocaleString('is-IS', { maximumFractionDigits: 1 }) + ' m.kr.' : 'Verð ekki birt';
  const stText = { laus: 'Laus', seld: 'Seld', fratekin: 'Frátekin' };
  const card = u => {
    const dis = u.status !== 'laus';
    return `<article class="ucard ${dis ? 'ucard--off' : ''}" role="listitem">
      <header class="ucard__head t-num">
        <span><i class="t-label t-smoke">m²</i><b>${(u.size || 0).toLocaleString('is-IS', { maximumFractionDigits: 1 })}</b></span>
        <span><i class="t-label t-smoke">Hæð</i><b>${u.floor}</b></span>
        <span><i class="t-label t-smoke">Herb.</i><b>${u.rooms}</b></span>
        <span><i class="t-label t-smoke">Íbúð</i><b>${u.id}</b></span>
      </header>
      <div class="ucard__plan">${u.plan ? `<img src="${u.plan}" loading="lazy" decoding="async" alt="Grunnmynd íbúðar ${u.id}">` : ''}</div>
      <footer class="ucard__foot">
        <span class="ucard__price t-num">${dis ? stText[u.status] : fmtPrice(u)}${u.line && u.line !== 'VAL:None' ? `<i class="ucard__line">${u.line}</i>` : ''}</span>
        <span class="ucard__side"><span class="ucard__status ucard__status--${u.status}">${stText[u.status] || ''}</span>
        <button class="unit__fav" type="button" data-fav-id="${u.id}" aria-label="Setja ${u.id} í uppáhald"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.9 13a4.6 4.6 0 0 1 0-6.6 4.7 4.7 0 0 1 6.6 0l.5.5.5-.5a4.7 4.7 0 0 1 6.6 0 4.6 4.6 0 0 1 0 6.6Z"/></svg></button></span>
      </footer>
    </article>`;
  };
  const apply = () => {
    let out = units.filter(u =>
      u.size >= state.size[0] && u.size <= state.size[1] &&
      u.floor >= state.floor[0] && u.floor <= state.floor[1] &&
      (state.status === 'all' || u.status === state.status));
    out.sort((x, y) => {
      let d = 0;
      if (state.sort === 'price') d = (x.price || 9e9) - (y.price || 9e9);
      else if (state.sort === 'size') d = (x.size || 0) - (y.size || 0);
      else d = x.id.localeCompare(y.id, 'is');
      return d * state.dir;
    });
    shown = Math.min(shown, Math.max(PAGE, out.length));
    listEl.innerHTML = out.slice(0, shown).map(card).join('');
    countEl.textContent = out.length;
    if (moreBtn) { moreBtn.hidden = out.length <= shown; $('.js-more-n', moreBtn) && ($('.js-more-n', moreBtn).textContent = Math.min(PAGE, out.length - shown)); }
    emptyEl.hidden = out.length > 0;
    favourites.sync();
  };
  // dual-handle ranges
  $$('.js-range', root).forEach(r => {
    const k = r.dataset.k, lo = $('.js-range-min', r), hi = $('.js-range-max', r);
    const oLo = $('.js-range-lo', r), oHi = $('.js-range-hi', r);
    const sync = () => {
      let a2 = +lo.value, b2 = +hi.value;
      if (a2 > b2) [a2, b2] = [b2, a2];
      state[k] = [a2, b2]; oLo.textContent = a2; oHi.textContent = b2; shown = PAGE;
      const min = +lo.min, max = +lo.max;
      r.style.setProperty('--lo', ((a2 - min) / (max - min) * 100) + '%');
      r.style.setProperty('--hi', ((b2 - min) / (max - min) * 100) + '%');
      apply();
    };
    lo.addEventListener('input', sync); hi.addEventListener('input', sync); sync();
  });
  $$('.js-filter', root).forEach(b => b.addEventListener('click', () => {
    state[b.dataset.k] = b.dataset.v; shown = PAGE;
    $$(`.js-filter[data-k="${b.dataset.k}"]`, root).forEach(x => x.classList.toggle('is-active', x === b));
    apply();
  }));
  const sortSel = $('.js-sort-sel', root);
  if (sortSel) sortSel.addEventListener('change', () => { const [k2, d2] = sortSel.value.split('-'); state.sort = k2; state.dir = sortSel.value.endsWith('--1') ? -1 : +d2; shown = PAGE; apply(); });
  $('.js-reset', root)?.addEventListener('click', () => {
    $$('.js-range', root).forEach(r => { const lo = $('.js-range-min', r), hi = $('.js-range-max', r); lo.value = lo.min; hi.value = hi.max; lo.dispatchEvent(new Event('input')); });
    state.status = 'all';
    $$('.js-filter[data-k="status"]', root).forEach(x => x.classList.toggle('is-active', x.dataset.v === 'all'));
    if (sortSel) { sortSel.value = 'id-1'; state.sort = 'id'; state.dir = 1; }
    apply();
  });
  if (moreBtn) moreBtn.addEventListener('click', () => { shown += PAGE; apply(); });
  const resetPage = fn => (...args) => { shown = PAGE; fn(...args); };
  if (units.length) apply(); else root.classList.add('is-dataless');
  return { measure() {} };
})();

/* ============================================================
   CALLBACK MODAL — demo contact form (nothing is sent, and it says so)
   ============================================================ */
const callback = (() => {
  const el = $('#callback'); if (!el) return {};
  const form = $('form', el), doneEl = $('.cb__done', el);
  const open = () => { overlays.opened('callback'); el.classList.remove('is-hidden'); el.setAttribute('aria-hidden', 'false'); void el.offsetWidth; el.classList.add('is-open'); const f = $('input', form); if (f) f.focus({ preventScroll: true }); };
  const close = () => { el.classList.remove('is-open'); el.classList.add('is-closing'); overlays.closed('callback'); setTimeout(() => { el.classList.remove('is-closing'); el.classList.add('is-hidden'); el.setAttribute('aria-hidden', 'true'); }, 420); };
  overlays.register('callback', close);
  $$('.js-callback').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $$('.js-cb-close', el).forEach(b => b.addEventListener('click', close));
  el.addEventListener('click', e => { if (e.target === el) close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('is-open')) close(); });
  form.addEventListener('submit', e => { e.preventDefault(); form.hidden = true; doneEl.hidden = false; });
  return { open, close };
})();


/* ============================================================
   SEQ BEATS v2 — pinned N-beat stages (dalur, arkitektúr):
   scrubbed per-beat progress fills, crossfaded copy swaps, icon slots.
   ============================================================ */
const BEAT_ICONS = {
  laug: '<svg viewBox="0 0 48 48"><path d="M4 30c4 0 4 3 8 3s4-3 8-3 4 3 8 3 4-3 8-3 4 3 8 3M4 38c4 0 4 3 8 3s4-3 8-3 4 3 8 3 4-3 8-3 4 3 8 3"/><circle cx="33" cy="13" r="4"/><path d="M12 24l9-9 8 6"/></svg>',
  tre: '<svg viewBox="0 0 48 48"><path d="M24 42V20"/><path d="M24 20c-8 0-13-5-13-12 8 0 13 5 13 12Zm0 0c8 0 13-5 13-12-8 0-13 5-13 12Z"/><path d="M24 30c-5 0-9-3-9-8 5 0 9 3 9 8Zm0 0c5 0 9-3 9-8-5 0-9 3-9 8Z"/><path d="M14 42h20"/></svg>',
  hjol: '<svg viewBox="0 0 48 48"><circle cx="12" cy="32" r="8"/><circle cx="36" cy="32" r="8"/><path d="M12 32l8-14h10M20 18l10 14M30 12h6l-4 6"/></svg>'
};
const seqBeats = (() => {
  const stages = $$('.js-seq, .js-seq2').map(root => {
    const beats = $$('.js-beat', root);
    const copy = $('.js-beat-copy', root);
    const meta = copy ? JSON.parse(copy.dataset.beats) : null;
    return { root, beats, copy, meta,
      title: $('.js-beat-title', root), text: $('.js-beat-text', root),
      icon: $('.js-beat-icon', root),
      fills: $$('.js-rule-fill', root), idx: $('.js-beat-i', root), last: -1, swapT: 0, G: geo.track(root) };
  });
  const swap = (st, i) => {
    st.root.classList.add('is-swapping');
    clearTimeout(st.swapT);
    st.swapT = setTimeout(() => {
      if (st.meta && st.meta[i]) {
        if (st.title) st.title.textContent = st.meta[i].t;
        if (st.text) st.text.textContent = st.meta[i].c;
        if (st.icon && st.meta[i].icon) st.icon.innerHTML = BEAT_ICONS[st.meta[i].icon] || '';
      }
      if (st.idx) st.idx.textContent = i + 1;
      st.root.classList.remove('is-swapping');
    }, 250);
  };
  const tick = y => {
    for (const st of stages) {
      if (!st.beats.length) continue;
      const { top, h } = st.G;
      if (!h || y < top - VH || y > top + h) continue;
      const p = clamp((y - top) / (h - VH || 1));
      const n = st.beats.length;
      const i = Math.min(n - 1, Math.floor(p * n));
      st.fills.forEach((f, k) => { const v = `scaleX(${clamp(p * n - k).toFixed(3)})`; if (v !== f.__v) { f.style.transform = v; f.__v = v; } });
      if (i === st.last) continue; st.last = i;
      st.beats.forEach((b, k) => b.classList.toggle('is-active', k === i));
      if (st.meta) swap(st, i); else if (st.idx) st.idx.textContent = i + 1;
    }
  };
  // first icon
  stages.forEach(st => { if (st.icon && st.meta && st.meta[0].icon) st.icon.innerHTML = BEAT_ICONS[st.meta[0].icon] || ''; });
  return { tick };
})();

/* MAP chapter — Holt scroll-map: the sheet pans/zooms along each walk while
   its route draws on (dash from measured getTotalLength; pathLength is ignored
   once the stroke is non-scaling). */
const mapStage = (() => {
  const root = $('.js-map'); if (!root) return { tick() {}, measure() {} };
  const box = $('.js-map-box', root), card = $('.js-map-card', root);
  const meta = JSON.parse(card.dataset.beats);
  const num = $('.js-map-num', root), unit = $('.js-map-unit', root), t = $('.js-map-t', root), c2 = $('.js-map-c', root);
  const fills = $$('.js-map-fill', root), idx = $('.js-map-i', root);
  const routes = $$('.js-route', root), pois = $$('.js-poi', root);
  const VIEWS = [{ cx: .7197, cy: .553, z: 1.416 }, { cx: .7769, cy: .6608, z: 2.095 }, { cx: .5249, cy: .6105, z: 1.485 }];
  let lens = [];
  const measure = () => {
    lens = routes.map(r2 => { const L = r2.getTotalLength() || 1; r2.style.strokeDasharray = L; r2.style.strokeDashoffset = L; return L; });
  };
  let last = -1, swapT = 0;
  const G = geo.track(root);
  const view = (i, f) => {
    const a2 = VIEWS[Math.max(0, i)], b2 = VIEWS[Math.min(VIEWS.length - 1, i + 1)];
    const cx = lerp(a2.cx, b2.cx, f), cy = lerp(a2.cy, b2.cy, f), z = lerp(a2.z, b2.z, f);
    /* translate so the target centre sits mid-box, then zoom about it */
    const bt = `translate(-50%,-50%) scale(${z.toFixed(3)}) translate(${((.5 - cx) * 100).toFixed(2)}%,${((.5 - cy) * 100).toFixed(2)}%)`;
    if (bt !== box.__t) { box.style.transform = bt; box.__t = bt; }
  };
  const tick = y => {
    const { top, h } = G;
    if (!h || y < top - VH || y > top + h) return;
    const p = clamp((y - top) / (h - VH || 1));
    const n = meta.length, prog = p * n, i = Math.min(n - 1, Math.floor(prog));
    fills.forEach((f, k) => f.style.transform = `scaleX(${clamp(prog - k).toFixed(4)})`);
    routes.forEach((r2, k) => { const L = lens[k] || 1; const v = (L * (1 - clamp(prog - k))).toFixed(0); if (v !== r2.__d) { r2.style.strokeDashoffset = v; r2.__d = v; } });
    view(i, clamp(prog - i));
    if (i === last) return; last = i;
    routes.forEach((r2, k) => r2.classList.toggle('is-on', k === i));
    pois.forEach((el, k) => el.classList.toggle('is-on', k === i));
    root.classList.add('is-swapping'); clearTimeout(swapT);
    swapT = setTimeout(() => {
      num.textContent = meta[i].n; unit.textContent = meta[i].unit;
      t.textContent = meta[i].t; c2.textContent = meta[i].c;
      if (idx) idx.textContent = i + 1;
      root.classList.remove('is-swapping');
    }, 250);
  };
  return { tick, measure };
})();

/* ARCH stage — facts slider mid-pin, architect card gated to the final 20% */
const archStage = (() => {
  const root = $('#arkitekturinn'); if (!root) return { tick() {} };
  const facts = $('.js-arch-facts', root), card = $('.js-arch-card', root);
  const list = facts ? JSON.parse(facts.dataset.facts) : [];
  const factEl = $('.js-arch-fact', root), iEl = $('.js-arch-i', root);
  let fi = 0, swapT = 0;
  const GA = geo.track(root);
  const slides = $$('.arch__slide', root);
  const show = k => {
    fi = (k + list.length) % list.length;
    if (slides.length) { const si = fi % slides.length; slides.forEach((s, i) => s.classList.toggle('is-active', i === si)); }
    facts.classList.add('is-swapping');
    clearTimeout(swapT);
    swapT = setTimeout(() => { factEl.textContent = list[fi]; if (iEl) iEl.textContent = fi + 1; facts.classList.remove('is-swapping'); }, 220);
  };
  $('.js-arch-prev', root)?.addEventListener('click', () => show(fi - 1));
  $('.js-arch-next', root)?.addEventListener('click', () => show(fi + 1));
  const word = $('.js-arch-word', root), wordText = $('.js-arch-wordtext', root);
  if (word) word.addEventListener('click', () => { const open = word.getAttribute('aria-expanded') === 'true'; word.setAttribute('aria-expanded', String(!open)); wordText.hidden = open; });
  const tick = y => {
    const { top, h } = GA;
    if (!h || y < top - VH || y > top + h) return;
    const p = clamp((y - top) / (h - VH || 1));
    if (facts) facts.classList.toggle('is-on', p > .16 && p < .5);
    if (card) card.classList.toggle('is-in', p >= .55 && p < .85);
  };
  return { tick };
})();

/* parking spot grid: 96 cells, the real 73 lit, deterministic scatter */
(() => {
  const grid = $('.js-spots'); if (!grid) return;
  const N = 96, ON = 73;
  const cells = [];
  for (let i = 0; i < N; i++) cells.push(i);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const on = new Set(cells.slice(0, ON));
  grid.innerHTML = Array.from({ length: N }, (_, i) => `<span class="spot${on.has(i) ? ' spot--on' : ''}"></span>`).join('');
})();


/* íbúðirnar bg slider (arrows + counter, likova offices anatomy) */
(() => {
  const stage = $('.js-ib-stage'); if (!stage) return;
  const slides = $$('.ib-slide', stage); let i = 0;
  const iEl = $('.js-ib-i');
  const set = n => { i = (n + slides.length) % slides.length; slides.forEach((s2, k) => s2.classList.toggle('is-active', k === i)); if (iEl) iEl.textContent = i + 1; };
  $('.js-ib-prev')?.addEventListener('click', () => set(i - 1));
  $('.js-ib-next')?.addEventListener('click', () => set(i + 1));
})();

/* menu veil closes the drawer */
(() => { const v = $('.js-menu-veil'); if (v) v.addEventListener('click', () => menu.hide()); })();


/* ============================================================
   STAT BEATS — reference pacing windows (beat 1 owns half the pin)
   ============================================================ */
const statBeats = (() => {
  const stage = $('.js-stats'); if (!stage) return { tick() {} };
  const items = $$('.js-stat', stage), fills = $$('.js-stat-fill', stage);
  const W = [0, .52, .8, 1];
  let last = -1;
  const countUp = (el) => {
    if (el.dataset.counted) return; el.dataset.counted = '1';
    const num = $('.js-stat-num', el); if (!num) return;
    const to = parseFloat(num.dataset.to) || 0, t0 = performance.now(), dur = 1100;
    let shown = -1;
    const step = () => {
      const t = clamp((performance.now() - t0) / dur), v = Math.round(to * E.easeOutCubic(t));
      if (v !== shown) { num.textContent = v; shown = v; }
      if (t < 1) requestAnimationFrame(step);
    };
    step(); setTimeout(() => { if (shown !== to) num.textContent = to; }, dur + 120);
  };
  const G = geo.track(stage);
  const tick = y => {
    const { top, h } = G;
    if (!h || y < top - VH || y > top + h) return;
    const p = clamp((y - top) / (h - VH || 1));
    let i = 0; for (let k = 0; k < 3; k++) if (p >= W[k]) i = k;
    fills.forEach((f, k) => { const v = `scaleX(${clamp((p - W[k]) / (W[k + 1] - W[k])).toFixed(3)})`; if (v !== f.__v) { f.style.transform = v; f.__v = v; } });
    if (i === last) return; last = i;
    items.forEach((el, k) => el.classList.toggle('is-active', k === i));
    countUp(items[i]);
  };
  return { tick };
})();

/* PARKING — 2-beat pinned stage */
const parkStage = (() => {
  const root = $('.js-parking'); if (!root) return { tick() {} };
  const beats = $$('.js-beat', root), fills = $$('.js-rule-fill', root), idx = $('.js-beat-i', root);
  const META = [
    { e: 'Bílastæðahúsið', n: '73', u: 'Íbúðum fylgir sérbílastæði', t: 'Bílastæðahús á tveimur hæðum neðanjarðar tengist öllum húsunum. Bílskúrar fylgja tíu stærstu íbúðunum og Hopp-deilibílar fá frí stæði.' },
    { e: 'Jarðhæðirnar', n: '4600', u: 'm² í Orkuhúsinu og á jarðhæðum', t: 'Veitingastaðir, kaffihús og nærþjónusta í Orkuhúsinu og á jarðhæðum nýju húsanna: göturnar tilheyra fólki, bíllinn hverfur niður fyrir yfirborðið.' }];
  const eEl = $('.js-beat-eyebrow', root), nEl = $('.js-park-num', root), uEl = $('.js-park-unit', root), tEl = $('.js-park-text', root);
  let last = -1, swapT = 0;
  const GP = geo.track(root);
  const tick = y => {
    const { top, h } = GP;
    if (!h || y < top - VH || y > top + h) return;
    const p = clamp((y - top) / (h - VH || 1));
    const n = beats.length, i = Math.min(n - 1, Math.floor(p * n));
    fills.forEach((f, k) => { const v = `scaleX(${clamp(p * n - k).toFixed(3)})`; if (v !== f.__v) { f.style.transform = v; f.__v = v; } });
    if (i === last) return; last = i;
    beats.forEach((b, k) => b.classList.toggle('is-active', k === i));
    root.classList.add('is-swapping'); clearTimeout(swapT);
    swapT = setTimeout(() => {
      const m = META[i]; eEl.textContent = m.e; nEl.textContent = m.n; uEl.textContent = m.u; tEl.textContent = m.t;
      if (idx) idx.textContent = i + 1;
      root.classList.remove('is-swapping');
    }, 250);
  };
  return { tick };
})();

/* LOGO DOCK — likova .header--landing logo pattern:
   translate(offset) scale(scaled) at rest → identity over 0.85 viewport heights.
   The white step behind it is the intro head band, not the logo's own background. */
const logoDock = (() => {
  const logo = $('.js-logo'), head = $('.js-intro-head'), bm = $('.js-intro-bookmark'), hdr = $('#header');
  if (!logo || !head || !bm) return { tick() {}, measure() {}, setK() {}, rect: null };
  let ox = 0, oy = 0, sc = 1, ready = false, bandH = 0, hdrH = 50;
  let lastK = -1, lastPaper = null;
  const measure = () => {
    const t = logo.style.transform; logo.style.transform = 'none';
    const l = logo.getBoundingClientRect(), b = bm.getBoundingClientRect();
    logo.style.transform = t;
    if (!l.width || !b.width) { ready = false; logo.style.transform = ''; hdr.classList.remove('header--landing'); return; }
    const slay = parseFloat(getComputedStyle(html).getPropertyValue('--slay')) || 20;
    /* likova sizes the giant wordmark at 71.5% of the step, but their word is
       6 glyphs; ORKUREITURINN is 13, so also reserve the chevron's own column. */
    const avail = Math.min(b.width * .84, b.width - 44 - slay * 3);
    sc = avail / l.width;
    ox = (b.left + slay) - l.left;
    oy = (b.bottom - slay) - l.bottom;
    bandH = head.offsetHeight;
    hdrH = hdr.offsetHeight || 50;
    ready = true;
    /* tick() only calls setK when k CHANGES, but a resize changes sc/ox/oy while k
       stays put (it is 1 at scroll 0 either way) — so the guard skipped the re-apply
       and a desktop-sized wordmark survived into a narrow viewport, clipped both
       sides. Invalidate the memo so the next tick rewrites with the new geometry. */
    lastK = -1; lastPaper = null;
  };
  const setK = k => {
    if (!ready) return;
    if (k < .002) { logo.style.transform = ''; hdr.classList.remove('header--landing'); return; }
    hdr.classList.add('header--landing');
    logo.style.transform = `translate(${(ox * k).toFixed(1)}px,${(oy * k).toFixed(1)}px) scale(${(1 + (sc - 1) * k).toFixed(4)})`;
  };
  const tick = y => {
    if (!ready) return;
    const k = 1 - clamp(y / (VH * .85));
    if (Math.abs(k - lastK) > .002) { setK(k); lastK = k; }
    /* the band translates 0 → -101% across one viewport, so its bottom edge is
       computable — no per-frame getBoundingClientRect, and it flips exactly when
       the white step stops covering the header rather than a guessed threshold */
    const paper = bandH * (1 - 1.01 * clamp(y / VH)) > hdrH + 2;
    if (paper !== lastPaper) { hdr.classList.toggle('header--on-paper', paper); lastPaper = paper; }
  };
  return { tick, measure, setK, get rect() { return logo.getBoundingClientRect(); } };
})();

/* LÍNURNAR — interior-line tabs */
(() => {
  const root = $('.js-lines'); if (!root) return;
  const tabs = $$('.js-line-tab', root), stages = $$('.js-line-stage', root);
  const set = i => { tabs.forEach((t, k) => t.classList.toggle('is-active', k === i)); stages.forEach((s, k) => s.classList.toggle('is-active', k === i)); };
  tabs.forEach((t, i) => { ['mouseenter', 'focus', 'click'].forEach(ev => t.addEventListener(ev, () => set(i))); });
  set(0);
})();

/* íbúðirnar slider chrome */
(() => {
  const stage = $('.js-ib-stage'); if (!stage) return;
  const slides = $$('.ib-slide', stage), iEl = $('.js-ib-i'); let i = 0;
  const set = n => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('is-active', k === i)); if (iEl) iEl.textContent = i + 1; };
  $('.js-ib-prev')?.addEventListener('click', () => set(i - 1));
  $('.js-ib-next')?.addEventListener('click', () => set(i + 1));
})();

/* parking spot grid + menu veil */
(() => {
  const grid = $('.js-spots');
  if (grid) {
    const N = 96, ON = 73, cells = Array.from({ length: N }, (_, i) => i);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const on = new Set(cells.slice(0, ON));
    grid.innerHTML = Array.from({ length: N }, (_, i) => `<span class="spot${on.has(i) ? ' spot--on' : ''}"></span>`).join('');
  }
  const v = $('.js-menu-veil'); if (v) v.addEventListener('click', () => menu.hide());
})();

/* ============================================================
   MEASURE + LOOP + BOOT
   ============================================================ */
const measureAll = () => {
  measureViewport();
  geo.measure();
  logoDock.measure();
  mapStage.measure();
  parallax.measure();
  header.measure();
  measureWellsSnaps();
  scroller.setLimit();
};
let resizeT;
const syncSmooth = () => {
  const next = evalSmooth(); if (next === SMOOTH) return;
  SMOOTH = next;
  html.classList.toggle('has-scroll-smooth', SMOOTH);
  html.classList.toggle('no-scroll-smooth', !SMOOTH);
  scroller.resync();
};
/* iOS Safari fires `resize` every time the URL bar collapses or expands DURING a
   scroll, and parallax.build() clears every inline transform before rebuilding —
   so the whole page visibly came apart mid-scroll on a phone, and pinch-zoom did
   the same. A rebuild is only needed when the BREAKPOINT could have changed;
   a height-only change just needs fresh measurements. */
let lastW = innerWidth, lastH = innerHeight;
const onResize = () => {
  clearTimeout(resizeT);
  const w = innerWidth, h = innerHeight;
  const widthChanged = w !== lastW;
  const bigHeightChange = Math.abs(h - lastH) > lastH * 0.25;
  lastW = w; lastH = h;
  resizeT = setTimeout(() => {
    if (widthChanged || bigHeightChange) { syncSmooth(); parallax.build(); }
    measureAll();
  }, 120);
};
window.addEventListener('resize', onResize);

/* The render loop is rAF-driven and skips idle frames by comparing scrollY to the
   last drawn frame. A tab that is hidden or throttled stops firing rAF while STILL
   firing scroll events, so the page can be left painted at a scroll position it no
   longer occupies — the header and wordmark stuck mid-dock after scrolling back up.
   Three forced repaints close that: a scroll can never be swallowed by the idle
   guard, returning to the tab always redraws, and a bfcache restore re-measures
   (its DOM is resurrected wholesale, with the old geometry baked in). */
let lastFrameY = -1, idleFrames = 0, lastFrameAt = 0;
const forceRepaint = () => { lastFrameY = -1; idleFrames = 0; };
window.addEventListener('scroll', forceRepaint, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) forceRepaint(); });
window.addEventListener('pageshow', e => { if (e.persisted) { syncSmooth(); parallax.build(); measureAll(); } forceRepaint(); });
/* The observer needs its OWN timer. Sharing `resizeT` meant a body-size change (which
   always follows a window resize) cancelled the pending full-resize pass and replaced
   it with this measure-only one — so syncSmooth() and parallax.build() never ran. */
let roT;
const ro = new ResizeObserver(() => { clearTimeout(roT); roT = setTimeout(measureAll, 120); });
ro.observe(document.body);

let running = false;
/* The frame loop only does work when something can have changed: a new scroll
   position, a running tween, reveals still pending, or the preloader. Idle frames
   cost one comparison instead of walking every parallax group and stage module. */
const render = (y, now) => {
  lastFrameY = y;
  lastFrameAt = now;
  reveal.tick(now);          // rect READS first, before the transform writes below
  parallax.apply(y);
  header.tick(y);
  logoDock.tick(y);
  statBeats.tick(y);
  parkStage.tick(y);
  seqBeats.tick(y);
  mapStage.tick(y);
  archStage.tick(y);
  menu.tick();
  scroller.listeners.forEach(f => f());
};
const loop = (now) => {
  if (!running) { preloader.tick(startPage); }
  scroller.tick();
  const y = SMOOTH ? scroller.y : scrollY;
  const busy = y !== lastFrameY || scroller.isTweening || reveal.pending || !running || menu.isOpen();
  if (!busy && idleFrames > 2) { requestAnimationFrame(loop); return; }
  idleFrames = busy ? 0 : idleFrames + 1;
  render(y, now);
  requestAnimationFrame(loop);
};

const startPage = () => {
  if (running) return; running = true;
  if (!wantsAnchor() && window.scrollY) window.scrollTo(0, 0);
  measureAll();
  reveal.start();
  measureAll();          // heights settled after the split pass
};

const boot = async () => {
  await document.fonts.ready;
  logoDock.measure(); logoDock.setK(1);
  parallax.build();
  measureAll();
  favourites.sync();
  if (location.hash && location.hash !== '#skip-preloader') { const t = $(location.hash); if (t) { const to = docTop(t); window.scrollTo(0, to); scroller.y = scroller.target = to; } }
  if (preloader.skip) { preloader.el.classList.add('is-removed'); startPage(); }
  requestAnimationFrame(loop);
};
boot();
