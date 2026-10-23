// Pure: choose the next clips from topic need, exam proximity, and mix rules.
import { DAY } from './progress.js';

function need(t, now) {
  if (!t || !t.seen) return 2;
  if (!t.answered) return t.seen ? 1 : 2;
  if (now >= t.due) return 3 + Math.min(t.misses || 0, 3);
  return 0.3;
}

function boost(topic, exams, now) {
  const date = exams[`${topic.course}-${topic.exam}`];
  if (date == null) return 1;
  const daysLeft = (date - now) / DAY;
  if (daysLeft < 0 || daysLeft > 30) return 1;
  return 1 + (30 - daysLeft) / 10;
}

export function pickNext({ clips, topics, progress, now, recent, n, sinceCheck = 0, lastType = null }) {
  const used = new Set(recent);
  const score = {};
  for (const t of topics) score[t.id] = need(progress.topics[t.id], now) * boost(t, progress.exams || {}, now);
  const byTopic = {};
  for (const c of clips) for (const id of c.topics) (byTopic[id] ||= []).push(c);
  const lastSeen = (c) => progress.clips[c.id] ?? -1;
  // Ties between equally needed topics go to the one seen longest ago, so the feed rotates.
  const topicSeen = {};
  for (const c of clips) for (const id of c.topics) topicSeen[id] = Math.max(topicSeen[id] ?? -1, lastSeen(c));
  // Teach before quizzing: a topic counts as taught once seen before or picked in this batch.
  const taught = new Set(Object.keys(progress.topics).filter((id) => progress.topics[id]?.seen));
  for (const id of used) for (const c of clips) if (c.id === id && c.type !== 'check') c.topics.forEach((t) => taught.add(t));
  const typeRank = (c) => (c.type === 'check' ? 1 : 0);

  const out = [];
  let since = sinceCheck;
  let prev = lastType;
  while (out.length < n) {
    const wantCheck = since >= 3;
    const ok = (c, strict) => !used.has(c.id) && !(c.type === 'video' && prev === 'video') &&
      (!strict || (wantCheck ? c.type === 'check' && c.topics.some((t) => taught.has(t)) : c.type !== 'check' || c.topics.some((t) => taught.has(t))));
    let pick = null;
    for (const strict of [true, false]) {
      const order = Object.keys(score).sort((a, b) => score[b] - score[a] || (topicSeen[a] ?? -1) - (topicSeen[b] ?? -1) || (a < b ? -1 : 1));
      for (const tid of order) {
        const cand = (byTopic[tid] || []).filter((c) => ok(c, strict)).sort((a, b) => lastSeen(a) - lastSeen(b) || typeRank(a) - typeRank(b) || (a.id < b.id ? -1 : 1));
        if (cand.length) { pick = cand[0]; break; }
      }
      if (pick) break;
    }
    if (!pick) break;
    out.push(pick);
    used.add(pick.id);
    if (pick.type !== 'check') pick.topics.forEach((t) => taught.add(t));
    for (const tid of pick.topics) if (tid in score) score[tid] *= 0.1;
    since = pick.type === 'check' ? 0 : since + 1;
    prev = pick.type;
  }
  return out;
}
