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
  el.setAttribute('aria-label', 'Narrated lesson');
  const course = ctx.topicsById?.[clip.topics?.[0]]?.course;
  const arrow = (forward) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${forward ? 'M18 5v14M5 5l10 7-10 7Z' : 'M6 5v14M19 5l-10 7 10 7Z'}"/></svg>`;
  el.innerHTML = `
    <div class="lesson-head"><p class="kicker">${course ? `RCP ${escape(course)}` : 'Your daily dose'}</p><span class="lesson-format">Listen &amp; learn</span></div>
    <div class="lesson-art" aria-hidden="true"></div>
    <div class="frames">${clip.frames.map((f, i) => `
      <div class="frame${i ? '' : ' on'}"><span class="frame-number">${escape(String(i + 1).padStart(2, '0'))} / ${escape(String(clip.frames.length).padStart(2, '0'))}</span><p class="big">${escape(f.text)}</p>
        <p class="src">${sourceLines(f.claims, ctx.sources)}</p></div>`).join('')}
    </div>
    <div class="lesson-controls">
      <div class="bar" aria-hidden="true"><div class="fill"></div></div>
      <div class="transport">
        <button class="frame-step" data-step="-1" aria-label="Previous slide">${arrow(false)}</button>
        <button class="lesson-toggle" aria-label="Play narration"></button>
        <button class="frame-step" data-step="1" aria-label="Next slide">${arrow(true)}</button>
      </div>
      <p class="playback-status" role="status">Narrated lesson</p>
      <p class="teach-hint">Swipe for the next lesson</p>
    </div>`;
  const frames = [...el.querySelectorAll('.frame')];
  const fill = el.querySelector('.fill');
  const toggleButton = el.querySelector('.lesson-toggle');
  const previous = el.querySelector('[data-step="-1"]');
  const next = el.querySelector('[data-step="1"]');
  const status = el.querySelector('.playback-status');
  const { marks, duration } = timeline(clip);
  let current = 0, pos = 0, active = false, timer = null, attempt = 0;
  let mode = 'idle'; // idle | audio | paused | timer | done
  let fallbackUsed = false;

  function controls() {
    const running = mode === 'audio' || mode === 'timer';
    toggleButton.setAttribute('aria-label', mode === 'done' ? 'Replay narration' : running ? 'Pause narration' : 'Play narration');
    toggleButton.innerHTML = running
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 12 8-12 8Z"/></svg>';
    previous.disabled = current === 0;
    next.disabled = current === frames.length - 1;
    status.textContent = mode === 'done' ? 'Lesson complete · Replay or swipe on' :
      mode === 'timer' ? 'Audio unavailable · Slides advancing' :
      mode === 'paused' ? (fallbackUsed ? 'Paused · Play to retry audio' : 'Paused') : 'Narrated lesson';
  }
  function update(t) {
    pos = t;
    const i = frameAt(t, marks, frames.length);
    if (i !== current) {
      frames[current].classList.remove('on');
      frames[i].classList.add('on');
      frames[i].scrollTop = 0;
      current = i;
    }
    fill.style.width = `${Math.min(100, (100 * t) / duration)}%`;
    previous.disabled = current === 0;
    next.disabled = current === frames.length - 1;
  }
  const stopTimer = () => { clearInterval(timer); timer = null; };
  function finish() { stopTimer(); mode = 'done'; update(duration); controls(); ctx.onDone?.(clip); }

  function fallback() {
    if (!active || mode === 'timer') return;
    player.pause();
    mode = 'timer';
    fallbackUsed = true;
    const start = performance.now() - pos * 1000;
    stopTimer();
    controls();
    timer = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      if (t >= duration) finish(); else update(t);
    }, 200);
  }
  function pause() {
    attempt++;
    stopTimer();
    player.pause();
    mode = 'paused';
    controls();
  }
  const handlers = {
    onTime: (t) => { if (mode === 'audio') update(t); },
    onEnded: () => { if (mode === 'audio') finish(); },
    onError: () => { if (mode === 'audio') fallback(); },
    onHidden: () => { if (mode === 'audio' || mode === 'timer') pause(); },
  };
  function playAudio() {
    const request = ++attempt;
    stopTimer();
    if (!player.owns(clip) || player.failed()) player.load(clip, handlers);
    player.seek(pos);
    mode = 'audio';
    controls();
    player.play().then(() => {
      if (!active) { player.release(clip); return; }
      if (request !== attempt) return;
      fallbackUsed = false;
      mode = 'audio';
      controls();
    }).catch(() => { if (request === attempt && mode === 'audio') fallback(); });
  }
  toggleButton.addEventListener('click', () => {
    if (!active) return;
    if (mode === 'audio' || mode === 'timer') { pause(); return; }
    if (mode === 'done') update(0);
    playAudio();
  });
  for (const button of el.querySelectorAll('.frame-step')) button.addEventListener('click', () => {
    if (!active) return;
    const target = Math.max(0, Math.min(frames.length - 1, current + Number(button.dataset.step)));
    const running = mode === 'audio' || mode === 'timer';
    stopTimer();
    attempt++;
    update(marks[target] ?? target * FALLBACK_FRAME_SECS);
    if (running) playAudio();
    else { player.seek(pos); mode = 'paused'; controls(); }
  });
  controls();
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
      attempt++;
      stopTimer();
      mode = 'idle';
      controls();
      player.release(clip);
    },
  };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
export { escape };
