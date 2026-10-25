// Check clip: one question; tap to answer, then explanation + source.
import { escape, sourceLines } from './teach.js';

// Fisher-Yates; returns a new array, leaves input untouched.
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function render(clip, ctx) {
  const el = document.createElement('section');
  el.className = 'clip check';
  const order = shuffle(clip.o.map((_, i) => i));
  el.innerHTML = `<div class="body">
    <p class="kicker">Quick check</p>
    <p class="q">${escape(clip.q)}</p>
    <div class="opts">${order.map((i, letter) => `<button data-i="${escape(i)}"><span class="option-letter" aria-hidden="true">${escape(String.fromCharCode(65 + letter))}</span><span class="option-text">${escape(clip.o[i])}</span></button>`).join('')}</div>
    <div class="why" role="status" hidden><strong class="why-title">The reasoning</strong><p>${escape(clip.e)}</p>
      <p class="src">${sourceLines(clip.claims, ctx.sources)}</p></div><button class="check-next" hidden>Next lesson →</button></div>`;
  el.querySelector('.check-next').addEventListener('click', () => ctx.onNext?.());
  let answered = false;
  el.querySelector('.opts').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || answered) return;
    answered = true;
    const pick = Number(b.dataset.i);
    for (const btn of el.querySelectorAll('.opts button')) {
      const i = Number(btn.dataset.i);
      if (i === clip.a) { btn.classList.add('right'); btn.insertAdjacentHTML('afterbegin', '<span class="mark">✓</span> '); }
      else if (i === pick) { btn.classList.add('wrong'); btn.insertAdjacentHTML('afterbegin', '<span class="mark">✗</span> '); }
      btn.disabled = true;
    }
    el.querySelector('.why-title').textContent = pick === clip.a ? 'Correct.' : 'Not quite.';
    el.querySelector('.why').hidden = false;
    el.querySelector('.check-next').hidden = false;
    // A long explanation scrolls inside the card; bring it into view without moving the feed.
    const body = el.querySelector('.body');
    if (body.scrollHeight > body.clientHeight) body.scrollTo({ top: body.scrollHeight, behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    ctx.onAnswer(clip, pick === clip.a);
  });
  return { el, activate() {}, deactivate() {} };
}
