// Official embeds are created only inside a tap; removing the iframe stops playback.
import { escape } from './teach.js';
import * as player from './player.js';

export function embedSrc(clip) {
  switch (clip.platform) {
    case 'youtube': return `https://www.youtube-nocookie.com/embed/${clip.embed}?playsinline=1&autoplay=1&rel=0`;
    case 'tiktok': return `https://www.tiktok.com/player/v1/${clip.embed}?autoplay=1&rel=0`;
    case 'instagram': return clip.url ? clip.url.replace(/\/+$/, '') + '/embed' : null;
    case 'facebook': return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clip.url)}&show_text=false&autoplay=true`;
    default: return null;
  }
}

export const badgeText = (clip) => clip.badge === 'ok' ? '✅ Matches your sources' : '⚠️ Differs from your sources';
export const checkedText = (clip) => `${clip.checked} of ${clip.total} facts checked against your sources`;
export const thumbSrc = (clip) => clip.platform === 'youtube' ? `https://i.ytimg.com/vi/${clip.embed}/hqdefault.jpg` : null;

const PLATFORMS = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook' };

export function render(clip, ctx) {
  const el = document.createElement('section');
  const platform = Object.hasOwn(PLATFORMS, clip.platform) ? clip.platform : 'unknown';
  const thumb = thumbSrc(clip);
  const src = embedSrc(clip);
  el.className = `clip video ${platform}`;
  el.innerHTML = `<div class="body">
    <p class="kicker">${escape(PLATFORMS[platform] || clip.platform)} · ${escape(clip.creator)}</p>
    <h2>${escape(clip.title)}</h2>
    <p class="video-badge ${clip.badge === 'ok' ? 'ok' : 'conflict'}">${escape(badgeText(clip))}</p>
    <p class="src">${escape(checkedText(clip))}</p>
    ${(clip.conflicts || []).length ? `<ul class="video-conflicts">${clip.conflicts.map((c) =>
      `<li>Video: ${escape(c.video)} → Your source (${escape(ctx.sources[c.src] || c.src)} · ${escape(c.loc)}): ${escape(c.source)}</li>`).join('')}</ul>` : ''}
    <div class="video-media">
      <div class="poster">${thumb ? `<img src="${escape(thumb)}" loading="lazy" alt="">` : ''}
        <button class="video-play" aria-label="Play video">▶</button>
      </div>
    </div>
    <p class="video-status" role="status" hidden></p>
    <button class="video-skip">Not playing? Skip</button>
  </div>`;
  const media = el.querySelector('.video-media');
  const poster = el.querySelector('.poster');
  const play = el.querySelector('.video-play');
  const status = el.querySelector('.video-status');
  const skip = el.querySelector('.video-skip');
  let iframe = null, hidden = false;

  function notice(text) {
    status.innerHTML = escape(text);
    status.hidden = false;
    play.hidden = true;
  }

  function stop() {
    if (iframe) iframe.remove();
    iframe = null;
    poster.hidden = false;
  }

  play.addEventListener('click', () => {
    if (hidden || iframe) return;
    if (navigator.onLine === false) { notice('Video needs internet — swipe on'); return; }
    if (!src) { notice('Video unavailable — swipe on'); return; }
    player.pause(); // synchronous in the user gesture, before inserting the embed
    iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = clip.title;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    poster.hidden = true;
    status.hidden = true;
    media.appendChild(iframe);
  });
  skip.addEventListener('click', () => {
    if (hidden) return;
    hidden = true;
    stop();
    notice('Hidden — swipe on');
    skip.disabled = true;
    ctx.onHideVideo(clip);
  });
  if (navigator.onLine === false) notice('Video needs internet — swipe on');
  else if (!src) notice('Video unavailable — swipe on');

  return { el, activate() {}, deactivate: stop };
}
