// Official embeds are created only inside a tap; removing the iframe stops playback.
import { escape } from './teach.js';
import * as player from './player.js';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,20}$/;
const IG_KIND = { reel: 'reel', reels: 'reel', p: 'p', tv: 'tv' };

// Instagram: the embed is built from the validated shortcode, and the kind from the URL's path
// (which must name the same shortcode); a share query (?igsh=) or fragment never reaches it.
function instagramEmbed(clip) {
  if (!clip.url || !IG_CODE.test(clip.embed || '')) return null;
  let u;
  try { u = new URL(clip.url); } catch { return null; }
  if (!/^(www\.|m\.)?instagram\.com$/.test(u.hostname)) return null;
  const [kind, code] = u.pathname.split('/').filter(Boolean);
  if (!Object.hasOwn(IG_KIND, kind || '') || code !== clip.embed) return null;
  return `https://www.instagram.com/${IG_KIND[kind]}/${clip.embed}/embed`;
}

export function embedSrc(clip) {
  switch (clip.platform) {
    case 'youtube': return YT_ID.test(clip.embed || '') ? `https://www.youtube-nocookie.com/embed/${clip.embed}?playsinline=1&autoplay=1&rel=0` : null;
    case 'tiktok': return /^\d+$/.test(clip.embed || '') ? `https://www.tiktok.com/player/v1/${clip.embed}?autoplay=1&rel=0` : null;
    case 'instagram': return instagramEmbed(clip);
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
    <p class="kicker"><span class="platform-pill">${escape(PLATFORMS[platform] || clip.platform)}</span><span>${escape(clip.creator)}</span></p>
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
    <div class="video-actions">
      <button class="video-retry" hidden>Stuck? Retry</button>
      <button class="video-skip">Not playing? Skip</button>
    </div>
  </div>`;
  const media = el.querySelector('.video-media');
  const poster = el.querySelector('.poster');
  const play = el.querySelector('.video-play');
  const status = el.querySelector('.video-status');
  const retry = el.querySelector('.video-retry');
  const skip = el.querySelector('.video-skip');
  retry.hidden = true;
  let iframe = null, hidden = false, played = false;

  function notice(text) {
    status.innerHTML = escape(text);
    status.hidden = false;
    play.hidden = true;
  }

  // Play is offered only while online with a usable embed; re-checked on (re)activation and on
  // connectivity changes, so an offline notice never hides Play for good.
  function refresh() {
    if (hidden || iframe) return;
    if (navigator.onLine === false) notice('Video needs internet — swipe on');
    else if (!src) notice('Video unavailable — swipe on');
    else { status.hidden = true; play.hidden = false; }
  }

  function stop() {
    if (iframe) iframe.remove();
    iframe = null;
    poster.hidden = false;
    retry.hidden = true;
  }

  function start() {
    if (hidden || iframe) return;
    refresh();
    if (play.hidden) return;
    player.pause(); // synchronous in the user gesture, before inserting the embed
    iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = clip.title;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    poster.hidden = true;
    status.hidden = true;
    retry.hidden = false; // a stalled or failed embed has no recovery of its own
    media.appendChild(iframe);
    // Only a real play teaches the topic; scrolling past the poster does not.
    if (!played) { played = true; ctx.onPlayVideo?.(clip); }
  }

  play.addEventListener('click', start);
  retry.addEventListener('click', () => {
    if (hidden || !iframe) return;
    stop();
    start();
  });
  skip.addEventListener('click', () => {
    if (hidden) return;
    hidden = true;
    stop();
    notice('Hidden — swipe on');
    skip.disabled = true;
    ctx.onHideVideo(clip);
  });
  refresh();

  return {
    el,
    activate() {
      globalThis.addEventListener?.('online', refresh);
      globalThis.addEventListener?.('offline', refresh);
      refresh();
    },
    deactivate() {
      globalThis.removeEventListener?.('online', refresh);
      globalThis.removeEventListener?.('offline', refresh);
      stop();
      refresh();
    },
  };
}
