// Vertical scroll-snap feed: activates the clip in view, appends more near the end,
// prunes old clips above the viewport so the DOM stays small.
import { render as renderTeach } from './teach.js';
import { render as renderCheck } from './check.js';
import { render as renderVideo } from './video.js';
import { pickNext } from './ranker.js';
import { recordSeen, recordExposure } from './progress.js';

const VIEWS = { teach: renderTeach, check: renderCheck, video: renderVideo };
const AUTO_NEXT_MS = 1200; // pause after a lesson/video ends before the next card slides in
const KEEP_ABOVE = 10; // clip sections kept above the current one
const warned = new Set();

export function startFeed(root, state) {
  const shown = [];
  const recentIds = []; // every id served this session (no repeats until the pool runs out), independent of DOM pruning
  let active = null;
  let sinceCheck = 0, lastType = null, caughtUp = false;
  let pruneTimer = null;
  let paused = false, lastRecorded = null; // paused while the Videos tab is open

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const item = shown.find((s) => s.view.el === e.target);
      if (!item || paused) continue;
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        if (active !== item) {
          if (active) active.view.deactivate();
          active = item;
          item.view.activate();
          // A video teaches only once played (ctx.onPlayVideo); scrolling past its poster is exposure.
          const record = item.clip.type === 'video' ? recordExposure : recordSeen;
          if (lastRecorded !== item) state.update((p) => record(p, item.clip, Date.now()));
          lastRecorded = item;
          if (shown.indexOf(item) >= shown.length - 2) more();
          schedulePrune();
        }
      } else if (active === item && !e.isIntersecting) {
        item.view.deactivate();
        active = null;
      }
    }
  }, { root, threshold: [0, 0.6] });

  // Prune only once scrolling settles; changing scrollTop mid-fling kills iOS momentum.
  function schedulePrune() {
    clearTimeout(pruneTimer);
    pruneTimer = setTimeout(prune, 250);
  }
  root.addEventListener('scroll', () => { if (pruneTimer) schedulePrune(); }, { passive: true });

  function prune() {
    pruneTimer = null;
    const idx = active ? shown.indexOf(active) : -1;
    const extra = idx - KEEP_ABOVE;
    if (extra <= 0) return;
    const removed = shown.splice(0, extra);
    let height = 0;
    for (const s of removed) height += s.view.el.offsetHeight;
    for (const s of removed) {
      io.unobserve(s.view.el);
      s.view.deactivate();
      s.view.el.remove();
    }
    root.scrollTop -= height;
  }

  function more() {
    const pool = state.clips.filter((c) =>
      (c.type !== 'video' || (navigator.onLine !== false && !(state.progress.hiddenVideos || []).includes(c.id))) &&
      (state.filter === 'all' || c.topics.some((t) => state.topicsById[t]?.course === state.filter)));
    const next = pickNext({ clips: pool, topics: state.topics, progress: state.progress, now: Date.now(),
      recent: recentIds, n: 5, sinceCheck, lastType, rand: Math.random });
    for (const clip of next) {
      if (!VIEWS[clip.type]) {
        if (!warned.has(clip.type)) { warned.add(clip.type); console.warn(`Unknown clip type "${clip.type}"; skipping.`); }
        continue;
      }
      const onNext = () => {
        if (!view.el.nextElementSibling) more();
        const next = view.el.nextElementSibling;
        if (next) { next.tabIndex = -1; next.focus({ preventScroll: true }); }
        next?.scrollIntoView({ behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      };
      // A finished lesson or video moves on by itself after a beat, unless the user has already left it.
      const onDone = () => setTimeout(() => {
        if (!paused && active && active.view === view) onNext();
      }, AUTO_NEXT_MS);
      const view = VIEWS[clip.type](clip, { ...state.ctx, onNext, onDone });
      root.appendChild(view.el);
      shown.push({ clip, view });
      recentIds.push(clip.id);
      io.observe(view.el);
      sinceCheck = clip.type === 'check' ? 0 : sinceCheck + 1;
      lastType = clip.type;
    }
    if (!next.length && !shown.length) root.innerHTML = '<p class="empty">No clips for this filter yet.</p>';
    else if (!next.length && !caughtUp) {
      caughtUp = true;
      root.insertAdjacentHTML('beforeend', '<p class="empty">You\'re caught up. Pick another course or come back later.</p>');
    }
  }

  function reset() {
    clearTimeout(pruneTimer); pruneTimer = null;
    if (active) active.view.deactivate();
    active = null;
    for (const s of shown) io.unobserve(s.view.el);
    shown.length = 0;
    recentIds.length = 0;
    root.innerHTML = '';
    sinceCheck = 0; lastType = null; caughtUp = false;
    more();
    root.scrollTop = 0;
  }

  more();
  return {
    reset,
    pause() { paused = true; for (const s of shown) s.view.deactivate(); active = null; },
    // Re-observing makes IntersectionObserver report the clip in view again, which re-activates it.
    resume() { paused = false; for (const s of shown) { io.unobserve(s.view.el); io.observe(s.view.el); } },
  };
}
