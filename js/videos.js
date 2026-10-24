// Videos tab: every vetted video in one scroll-snap list, so they can be watched on purpose
// instead of waiting for the feed's ranker to serve one.
import { render as renderVideo } from './video.js';

export function videoList(clips, topicsById, filter) {
  return clips
    .filter((c) => c.type === 'video' &&
      (filter === 'all' || c.topics.some((t) => topicsById[t]?.course === filter)))
    .sort((a, b) => a.topics[0].localeCompare(b.topics[0]) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

export function startVideos(root, state) {
  let views = [], active = null, paused = true;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const view = views.find((v) => v.el === e.target);
      if (!view || paused) continue;
      if (e.isIntersecting && e.intersectionRatio >= 0.6 && active !== view) {
        if (active) active.deactivate();
        active = view;
        view.activate();
      } else if (active === view && !e.isIntersecting) {
        view.deactivate();
        active = null;
      }
    }
  }, { root, threshold: [0, 0.6] });

  function reset() {
    if (active) active.deactivate();
    active = null;
    for (const v of views) io.unobserve(v.el);
    root.innerHTML = '';
    const list = videoList(state.clips, state.topicsById, state.filter);
    views = list.map((clip) => renderVideo(clip, state.ctx));
    for (const v of views) { root.appendChild(v.el); io.observe(v.el); }
    if (!views.length) root.innerHTML = '<p class="empty">No videos for this filter yet.</p>';
    root.scrollTop = 0;
  }

  reset();
  return {
    reset,
    // Leaving the tab stops any playing embed; IntersectionObserver re-activates on return.
    // every card, not just the active one: Play works on a card still mid-swipe
    pause() { paused = true; for (const v of views) v.deactivate(); active = null; },
    resume() { paused = false; for (const v of views) { io.unobserve(v.el); io.observe(v.el); } },
  };
}
