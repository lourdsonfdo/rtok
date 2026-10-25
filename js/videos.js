// Searchable shelf of vetted videos. Opening a card reuses the feed's video player.
import { render as renderVideo } from './video.js';
import { escape } from './teach.js';

// Grouped by topic then title; with rand (e.g. Math.random) shuffled instead, so each open differs.
export function videoList(clips, topicsById, filter, rand = null) {
  const list = clips
    .filter((c) => c.type === 'video' &&
      (filter === 'all' || c.topics.some((t) => topicsById[t]?.course === filter)))
    .sort((a, b) => a.topics[0].localeCompare(b.topics[0]) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (rand) for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function searchVideos(clips, topicsById, filter, query = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return videoList(clips, topicsById, filter).filter((c) => {
    const text = [c.title, c.creator, c.platform, ...c.topics.map((id) => topicsById[id]?.text || '')]
      .join(' ').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function startVideos(root, state) {
  let active = null, paused = true, lastButton = null, shelfScroll = 0;
  root.innerHTML = `<div class="library-shelf">
    <div class="library-heading"><p class="kicker">The video collection</p><h1>Your study shelf.</h1><p>Find a topic. Take a moment.</p></div>
    <label class="library-search"><span>Search videos</span><input type="search" placeholder="Search titles, topics or creators" autocomplete="off"></label>
    <p class="library-count" role="status"></p><div class="library-list"></div>
  </div><div class="library-detail" hidden><button class="library-back">← Back to your shelf</button><div class="library-player"></div></div>`;
  const shelf = root.querySelector('.library-shelf');
  const detail = root.querySelector('.library-detail');
  const input = root.querySelector('input');
  const list = root.querySelector('.library-list');
  const player = root.querySelector('.library-player');
  const back = root.querySelector('.library-back');

  function close(focus = true) {
    active?.deactivate();
    active = null;
    player.replaceChildren();
    detail.hidden = true;
    shelf.hidden = false;
    root.scrollTop = shelfScroll;
    if (focus) lastButton?.focus({ preventScroll: true });
  }
  back.addEventListener('click', () => close());
  detail.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  function draw() {
    const videos = searchVideos(state.clips, state.topicsById, state.filter, input.value);
    root.querySelector('.library-count').textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}${input.value.trim() ? ' found' : ' in your collection'}`;
    list.innerHTML = videos.map((clip, i) => `<button class="library-card" data-index="${i}">
      <span class="library-cover" aria-hidden="true"><span>▶</span></span>
      <span class="library-copy"><span class="library-title">${escape(clip.title)}</span>
      <span class="library-meta">${escape(clip.creator)} · ${escape(clip.platform)}</span>
      <span class="library-review">${clip.badge === 'ok' ? `${escape(clip.checked)}/${escape(clip.total)} facts checked` : 'Source differences noted'} ↗</span></span>
      <span aria-hidden="true">→</span></button>`).join('');
    if (!videos.length) list.innerHTML = '<p class="library-empty">No videos match. Try another topic or course.</p>';
    for (const button of list.querySelectorAll('button')) button.addEventListener('click', () => {
      lastButton = button;
      shelfScroll = root.scrollTop;
      active?.deactivate();
      active = renderVideo(videos[Number(button.dataset.index)], { ...state.ctx, videoExitHint: 'return to your shelf' });
      player.replaceChildren(active.el);
      shelf.hidden = true;
      detail.hidden = false;
      root.scrollTop = 0;
      if (!paused) active.activate();
      back.focus({ preventScroll: true });
    });
  }
  input.addEventListener('input', draw);
  draw();
  return {
    reset() { close(false); input.value = ''; lastButton = null; shelfScroll = 0; draw(); root.scrollTop = 0; },
    pause() { paused = true; active?.deactivate(); },
    resume() { paused = false; active?.activate(); },
  };
}
