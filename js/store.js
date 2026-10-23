// IndexedDB key-value persistence + JSON backup/restore.
import { emptyProgress, sanitizeProgress } from './progress.js';

const DB = 'rtok', STORE = 'kv';
let dbPromise = null; // one cached connection; reset on close/versionchange/error

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      const db = r.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => { dbPromise = null; reject(r.error); };
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); }
    catch (err) { dbPromise = null; reject(err); return; } // connection closed underneath us
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

// { progress, loadFailed }. Nothing saved yet -> empty progress, saving allowed.
// Read error (after one retry) -> empty progress with loadFailed so the caller stops saving.
export async function loadProgress() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const p = await tx('readonly', (s) => s.get('progress'));
      return { progress: p == null ? emptyProgress() : sanitizeProgress(p), loadFailed: false };
    } catch (err) {
      console.warn('loadProgress failed', err);
      dbPromise = null;
    }
  }
  return { progress: emptyProgress(), loadFailed: true };
}

export function saveProgressStrict(p) {
  return tx('readwrite', (s) => s.put(p, 'progress'));
}

export function saveProgress(p) {
  return saveProgressStrict(p).catch((err) => console.warn('saveProgress failed', err));
}

// Share sheet where file sharing is supported (iOS), otherwise an anchor download.
export async function downloadBackup(p) {
  const name = `rtok-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify({ app: 'rtok', v: 1, progress: p });
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function readBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Not an RTok backup'); }
  if (!data || data.app !== 'rtok' || !data.progress || typeof data.progress !== 'object') throw new Error('Not an RTok backup');
  return sanitizeProgress(data.progress);
}
