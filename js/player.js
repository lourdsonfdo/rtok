// One shared <audio> element for all teach clips.
//
// iOS Safari only lets an element start playback with sound if that element has
// already been played (unmuted) inside a user gesture; after that, the same element
// may play() again with a new src without a gesture. So unlock() must run
// synchronously inside the Start tap, before any await: it plays a short silent WAV
// on the shared element (unmuted, volume untouched; muted plays don't count) and
// pauses it once playback starts. Every teach clip then reuses this element.

let audio = null;
let handlers = null; // { onTime, onEnded, onError, onHidden } for the active clip
let owner = null; // id of the clip whose handlers are attached
let silentUrl = null;

function silentWav() {
  // 50 ms of 16-bit mono PCM silence at 22.05 kHz; built in code so it is always a valid file.
  const rate = 22050, samples = 1102, bytes = samples * 2;
  const buf = new Uint8Array(44 + bytes);
  const v = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes, true);
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return 'data:audio/wav;base64,' + btoa(s);
}

const onTime = () => handlers?.onTime?.(audio.currentTime, audio.duration);
const onEnded = () => handlers?.onEnded?.();
const onError = () => handlers?.onError?.(audio.error);

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      if (!audio.paused) audio.pause();
      handlers?.onHidden?.();
    });
  }
  return audio;
}

function detach() {
  const a = el();
  a.removeEventListener('timeupdate', onTime);
  a.removeEventListener('ended', onEnded);
  a.removeEventListener('error', onError);
  handlers = null;
  owner = null;
}

// Call synchronously from a click/touchend handler, before any await.
export function unlock() {
  const a = el();
  silentUrl ||= silentWav();
  detach();
  a.src = silentUrl;
  let p;
  try { p = a.play(); } catch { return; }
  if (p && p.then) p.then(() => { if (a.src === silentUrl) a.pause(); }).catch(() => {});
}

// Point the shared element at a clip; only this clip's handlers receive events.
export function load(clip, h) {
  const a = el();
  detach();
  a.pause();
  a.src = clip.audio;
  handlers = h;
  owner = clip.id;
  a.addEventListener('timeupdate', onTime);
  a.addEventListener('ended', onEnded);
  a.addEventListener('error', onError);
}

export function owns(clip) { return owner === clip.id; }

// True after a load/decode error; the element must be given its source again before play().
export function failed() { return !!audio && !!audio.error; }

export function seek(t) { const a = el(); try { a.currentTime = t; } catch {} }

// Resolves when playback starts; rejects if blocked or the source fails.
export function play() {
  const a = el();
  try { return Promise.resolve(a.play()); } catch (err) { return Promise.reject(err); }
}

export function pause() { if (audio && !audio.paused) audio.pause(); }

export function isPlaying() { return !!audio && !audio.paused && !audio.ended; }

// Stop and detach if this clip owns the player.
export function release(clip) {
  if (!owns(clip)) return;
  pause();
  detach();
}
