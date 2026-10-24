import { loadProgress, saveProgressStrict, downloadBackup, readBackup } from './store.js';
import { recordAnswer, recordSeen, hideVideo } from './progress.js';
import { startFeed } from './feed.js';
import { formatLocalDate } from './dates.js';
import { escape } from './teach.js';
import * as player from './player.js';

const $ = (s) => document.querySelector(s);

function notice(msg) {
  const n = document.createElement('div');
  n.className = 'notice';
  n.setAttribute('role', 'status');
  n.textContent = msg;
  n.addEventListener('click', () => n.remove());
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 12000);
}

async function boot() {
  const [clips, topics, sources] = await Promise.all(
    ['content/clips.json', 'content/topics.json', 'content/sources.json'].map((u) => fetch(u).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${u}: ${r.status}`);
      return r.json();
    })));
  const { progress, loadFailed } = await loadProgress();
  const state = {
    clips, topics, filter: 'all', progress,
    saveDisabled: loadFailed,
    topicsById: Object.fromEntries(topics.map((t) => [t.id, t])),
    update(fn) {
      state.progress = fn(state.progress);
      if (state.saveDisabled) return;
      // Warn once per failure streak: answers stay in memory, and a backup from ⚙ still works.
      saveProgressStrict(state.progress).then(() => { state.saveWarned = false; }, (err) => {
        console.warn('saveProgress failed', err);
        if (!state.saveWarned) notice("Progress isn't saving on this device. Use ⚙ → Download backup to keep it.");
        state.saveWarned = true;
      });
    },
  };
  if (loadFailed) notice("Progress couldn't be loaded; changes won't be saved this session.");
  state.ctx = {
    sources,
    onHideVideo: (clip) => state.update((p) => hideVideo(p, clip.id)),
    onPlayVideo: (clip) => state.update((p) => recordSeen(p, clip, Date.now())),
    onAnswer: (clip, correct) => state.update((p) => recordAnswer(p, clip.topics, correct, Date.now())),
  };

  const courses = [...new Set(topics.map((t) => t.course))].sort();
  $('#filters').innerHTML = ['all', ...courses].map((c) => {
    const on = c === 'all';
    return `<button data-c="${escape(c)}" class="${on ? 'on' : ''}" aria-pressed="${on}">${on ? 'All' : escape(c)}</button>`;
  }).join('');

  $('#start').addEventListener('click', () => {
    player.unlock(); // must stay synchronous and first: iOS only unlocks audio inside the tap
    $('#gate').hidden = true;
    const feed = startFeed($('#feed'), state);
    $('#filters').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state.filter = b.dataset.c;
      for (const x of $('#filters').children) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      }
      feed.reset();
    });
  }, { once: true });

  const exams = [...new Set(topics.map((t) => `${t.course}-${t.exam}`))];
  $('#exams').innerHTML = exams.map((k) => {
    const v = state.progress.exams[k] ? formatLocalDate(state.progress.exams[k]) : '';
    return `<label>${escape(k.replace('-', ' '))} <input type="date" data-k="${escape(k)}" value="${v}"></label>`;
  }).join('');
  $('#exams').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    state.update((p) => {
      const exams = { ...p.exams };
      if (e.target.value) exams[k] = Date.parse(e.target.value + 'T08:00:00');
      else delete exams[k];
      return { ...p, exams };
    });
  });
  $('#gear').addEventListener('click', () => { $('#settings').hidden = !$('#settings').hidden; });
  $('#backup').addEventListener('click', () => { downloadBackup(state.progress).catch((err) => alert(err.message)); });
  $('#restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const p = await readBackup(file);
      await saveProgressStrict(p);
      location.reload();
    } catch (err) {
      alert(`Restore failed: ${err && err.message ? err.message : err}`);
    } finally {
      e.target.value = '';
    }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  const gate = $('#gate');
  gate.hidden = false;
  gate.innerHTML = '<p class="empty">Couldn\'t load study content. Check your connection and reload.</p>';
});
