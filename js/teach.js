// Teach clip: frames advance in sync with narration marks (or on a timer if audio fails).
import * as player from './player.js';

const FALLBACK_FRAME_SECS = 4;
const chip = (claim, sources) => `${sources[claim.src] || claim.src} · ${claim.loc}`;
// One line per distinct source unit; several quotes from one slide show once.
export const sourceLines = (claims, sources) => [...new Set((claims || []).map((c) => chip(c, sources)))].map(escape).join('<br>');

// Pure: frame start times and total length, tolerating missing/odd marks.
export function timeline(clip) {
  const n = clip.frames.length;
  let marks = Array.isArray(clip.marks) ? clip.marks.filter((m) => Number.isFinite(m)) : [];
  if (!marks.length) marks = Array.from({ length: n }, (_, i) => i * FALLBACK_FRAME_SECS);
  const last = marks[Math.min(marks.length, n) - 1] || 0;
  const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : last + FALLBACK_FRAME_SECS;
  return { marks, duration };
}

// Pure: index of the frame showing at time t, clamped to [0, nFrames - 1].
export function frameAt(t, marks, nFrames) {
  let i = 0;
  for (let k = 0; k < marks.length; k++) if (t >= marks[k]) i = k;
  return Math.max(0, Math.min(i, nFrames - 1));
}

export function render(clip, ctx) {
  const el = document.createElement('section');
  el.className = 'clip teach';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', 'Play or pause narration');
  el.innerHTML = `
    <div class="frames">${clip.frames.map((f, i) => `
      <div class="frame${i ? '' : ' on'}"><p class="big">${escape(f.text)}</p>
        <p class="src">${sourceLines(f.claims, ctx.sources)}</p></div>`).join('')}
    </div>
    <div class="bar"><div class="fill"></div></div>
    <div class="paused" aria-hidden="true" hidden>▶</div>`;
  const frames = [...el.querySelectorAll('.frame')];
  const fill = el.querySelector('.fill');
  const overlay = el.querySelector('.paused');
  const { marks, duration } = timeline(clip);

  let current = 0, pos = 0, active = false, timer = null;
  let mode = 'idle'; // idle | audio | paused | timer | done

  const show = (i) => {
    if (i === current) return;
    frames[current].classList.remove('on');
    frames[i].classList.add('on');
    current = i;
  };
  const update = (t) => {
    pos = t;
    show(frameAt(t, marks, frames.length));
    fill.style.width = `${Math.min(100, (100 * t) / duration)}%`;
  };
  const setOverlay = (kind) => { // null | 'paused' | 'retry'
    overlay.hidden = !kind;
    overlay.classList.toggle('retry', kind === 'retry');
  };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const finish = () => { stopTimer(); mode = 'done'; update(duration); setOverlay('paused'); ctx.onDone && ctx.onDone(clip); };

  // Audio failed or was blocked: keep going on a timer; tapping retries audio.
  function fallback() {
    if (!active || mode === 'timer') return;
    player.pause();
    mode = 'timer';
    setOverlay('retry');
    const start = performance.now() - pos * 1000;
    stopTimer();
    timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      if (t >= duration) finish(); else update(t);
    }, 200);
  }

  const handlers = {
    onTime: (t) => { if (mode === 'audio') update(t); },
    onEnded: () => { if (mode === 'audio') finish(); },
    onError: () => fallback(),
    onHidden: () => {
      if (mode === 'audio' || mode === 'timer') { stopTimer(); mode = 'paused'; setOverlay('paused'); }
    },
  };

  function playAudio() {
    if (!player.owns(clip) || player.failed()) player.load(clip, handlers); // reload after an error so a retry can succeed
    if (pos > 0 && pos < duration) player.seek(pos);
    mode = 'audio';
    setOverlay(null);
    player.play().then(() => {
      if (!active) { player.release(clip); return; }
      stopTimer();
      mode = 'audio';
      setOverlay(null);
    }).catch(() => { if (mode === 'audio') fallback(); });
  }

  function toggle() {
    if (!active) return;
    if (mode === 'audio' && player.isPlaying()) {
      player.pause();
      mode = 'paused';
      setOverlay('paused');
      return;
    }
    if (mode === 'done') update(0);
    stopTimer();
    mode = 'idle';
    playAudio();
  }

  el.addEventListener('click', toggle);
  el.addEventListener('keydown', (e) => {
    if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    toggle();
  });

  return {
    el,
    activate() {
      active = true;
      stopTimer();
      update(0);
      mode = 'idle';
      player.release(clip);
      playAudio();
    },
    deactivate() {
      active = false;
      stopTimer();
      mode = 'idle';
      setOverlay(null);
      player.release(clip);
    },
  };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
export { escape };
