// Per-topic spaced repetition. Pure functions; callers persist the result.
export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;
const STEPS = [1, 3, 7, 14, 30];

export function emptyProgress() {
  return { topics: {}, clips: {}, exams: {}, hiddenVideos: [] };
}

function topic(p, id) {
  return p.topics[id] || { streak: 0, due: 0, seen: 0, misses: 0, answered: 0 };
}

export function recordAnswer(p, topicIds, correct, now) {
  const topics = { ...p.topics };
  for (const id of topicIds) {
    const t = { ...topic(p, id), answered: topic(p, id).answered + 1 };
    if (correct) {
      t.streak += 1;
      t.due = now + STEPS[Math.min(t.streak, STEPS.length) - 1] * DAY;
    } else {
      t.streak = 0;
      t.misses += 1;
      t.due = now + 10 * MIN;
    }
    topics[id] = t;
  }
  return { ...p, topics };
}

export function recordSeen(p, clip, now) {
  const topics = { ...p.topics };
  for (const id of clip.topics) topics[id] = { ...topic(p, id), seen: topic(p, id).seen + 1 };
  return { ...p, topics, clips: { ...p.clips, [clip.id]: now } };
}

const videoId = (id) => typeof id === 'string' && /^v-(yt|tt|ig|fb)-[A-Za-z0-9_-]+$/.test(id);
const hiddenIds = (ids) => Array.isArray(ids) ? [...new Set(ids.filter(videoId))] : [];

export function hideVideo(p, id) {
  return { ...p, hiddenVideos: hiddenIds([...(p.hiddenVideos || []), id]) };
}

const TOPIC_FIELDS = ['streak', 'due', 'seen', 'misses', 'answered'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const safeKey = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

function numbersOnly(src) {
  const out = {};
  if (isObj(src)) for (const [k, v] of Object.entries(src)) if (safeKey(k) && isNum(v)) out[k] = v;
  return out;
}

// Pure: coerce anything (stored data, a restored backup) into a valid progress object.
export function sanitizeProgress(p) {
  const out = emptyProgress();
  if (!isObj(p)) return out;
  if (isObj(p.topics)) {
    for (const [id, t] of Object.entries(p.topics)) {
      if (!safeKey(id) || !isObj(t)) continue;
      const entry = {};
      let ok = true;
      for (const f of TOPIC_FIELDS) {
        if (t[f] === undefined) entry[f] = 0;
        else if (Number.isInteger(t[f]) && t[f] >= 0) entry[f] = t[f]; // counters and ms timestamps
        else { ok = false; break; }
      }
      if (ok) out.topics[id] = entry;
    }
  }
  out.clips = numbersOnly(p.clips);
  out.exams = numbersOnly(p.exams);
  out.hiddenVideos = hiddenIds(p.hiddenVideos);
  return out;
}
