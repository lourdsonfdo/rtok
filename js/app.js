import { loadProgress, saveProgressStrict, downloadBackup, readBackup } from './store.js';
import { recordAnswer, recordSeen, hideVideo } from './progress.js';
import { startFeed } from './feed.js';
import { startVideos } from './videos.js';
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
    topicsById: state.topicsById,
    onHideVideo: (clip) => state.update((p) => hideVideo(p, clip.id)),
    onPlayVideo: (clip) => state.update((p) => recordSeen(p, clip, Date.now())),
    onAnswer: (clip, correct) => state.update((p) => recordAnswer(p, clip.topics, correct, Date.now())),
  };

  const courses = [...new Set(topics.map((t) => t.course))].sort();
  $('#course').innerHTML = ['all', ...courses].map((c) =>
    `<option value="${escape(c)}">${c === 'all' ? 'All courses' : `RCP ${escape(c)}`}</option>`).join('');

  $('#start').addEventListener('click', () => {
    player.unlock(); // must stay synchronous and first: iOS only unlocks audio inside the tap
    $('#gate').hidden = true;
    const feed = startFeed($('#feed'), state);
    const videos = startVideos($('#videos'), state);
    let tab = 'feed';
    $('#tabs').hidden = false;
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.tab === tab) return;
      tab = b.dataset.tab;
      for (const x of $('#tabs').children) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      }
      const [show, hide] = tab === 'videos' ? [videos, feed] : [feed, videos];
      hide.pause();
      player.pause();
      $('#feed').hidden = tab !== 'feed';
      $('#videos').hidden = tab !== 'videos';
      show.resume();
    });
    $('#course').addEventListener('change', () => {
      state.filter = $('#course').value;
      feed.reset();
      videos.reset();
    });
  }, { once: true });

  const exams = [...new Set(topics.map((t) => `${t.course}-${t.exam}`))];
  $('#exams').innerHTML = exams.map((k) => {
    const v = state.progress.exams[k] ? formatLocalDate(state.progress.exams[k]) : '';
    return `<label>${escape(k.replace('-', ' '))} <input type="date" data-k="${escape(k)}" value="${escape(v)}"></label>`;
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
  function setSettings(open) {
    $('#settings').hidden = !open;
    $('#gear').setAttribute('aria-expanded', String(open));
    (open ? $('#settings-close') : $('#gear')).focus();
  }
  $('#gear').addEventListener('click', () => setSettings($('#settings').hidden));
  $('#settings-close').addEventListener('click', () => setSettings(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#settings').hidden) setSettings(false);
  });
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

  if ('serviceWorker' in navigator) watchForUpdates();
}

// iOS keeps a Home Screen app's page alive for a long time, so a new publish can sit waiting for
// days. Check on launch and whenever the app comes back to the foreground, and offer a one-tap update.
function watchForUpdates() {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (sw) => {
      if (!sw || !navigator.serviceWorker.controller || $('#update')) return;
      const b = document.createElement('button');
      b.id = 'update';
      b.className = 'notice update';
      b.textContent = 'New version ready — tap to update';
      b.addEventListener('click', () => {
        b.disabled = true;
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        sw.postMessage({ type: 'SKIP_WAITING' });
      });
      document.body.appendChild(b);
    };
    const track = (sw) => sw && sw.addEventListener('statechange', () => { if (sw.state === 'installed') offer(sw); });
    offer(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

boot().catch((err) => {
  console.error(err);
  const gate = $('#gate');
  gate.hidden = false;
  gate.innerHTML = '<p class="empty">Couldn\'t load study content. Check your connection and reload.</p>';
});
