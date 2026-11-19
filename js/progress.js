// @ts-check
// Learning progress and settings, stored in localStorage. Lesson progress is keyed by lesson id,
// so lessons added later simply have no entry yet and existing progress is never affected.

import { today, addDays } from './util.js';

const KEY = 'lt.progress.v1';
const STREAK_KEY = 'lt.streak.v1';
const SETTINGS_KEY = 'lt.settings.v1';

/**
 * @typedef {Object} LessonProgress
 * @property {number} completed  how often the lesson was finished
 * @property {number} best       best accuracy in percent (first-try answers)
 * @property {string} last       date of the last completion (YYYY-MM-DD)
 *
 * @typedef {Object} State
 * @property {Record<string, LessonProgress>} lessons
 * @property {number} xp
 * @property {Record<string, number>} daily  XP per day (YYYY-MM-DD)
 *
 * @typedef {{ last: string, count: number, best: number }} Streak
 *
 * @typedef {Object} Settings
 * @property {boolean} listening   "tap what you hear" exercises
 * @property {boolean} speaking    "say this sentence" exercises
 * @property {boolean} autoplay    read Vietnamese prompts aloud automatically
 * @property {boolean} unlockAll   all lessons open, no need to go in order
 * @property {number} dailyGoal    XP per day
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = { listening: true, speaking: true, autoplay: true, unlockAll: false, dailyGoal: 30 };
export const DAILY_GOALS = [10, 20, 30, 50];

const emptyState = () => /** @type {State} */ ({ lessons: {}, xp: 0, daily: {} });
const emptyStreak = () => /** @type {Streak} */ ({ last: '', count: 0, best: 0 });

/** @type {State} */
let state = { ...emptyState(), ...readJSON(KEY, {}) };
/** @type {Streak} */
let streak = readJSON(STREAK_KEY, emptyStreak());
/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (e.g. some private modes) – the session still works in memory.
  }
}

/* ---------- lessons ---------- */

/** @param {string} id */
export function lesson(id) {
  return state.lessons[id] || null;
}

/** @param {string} id */
export function isCompleted(id) {
  return !!state.lessons[id]?.completed;
}

/**
 * A lesson is open when it is the first one, the one before it is completed, or all are unlocked.
 * @param {import('./data.js').Lesson} l
 * @param {import('./data.js').Course} course
 */
export function isUnlocked(l, course) {
  if (settings.unlockAll || l.order === 0 || isCompleted(l.id)) return true;
  return isCompleted(course.lessons[l.order - 1].id);
}

/**
 * The lesson to do next: the first one that is not completed yet (null when all are done).
 * @param {import('./data.js').Course} course
 */
export function currentLesson(course) {
  return course.lessons.find((l) => !isCompleted(l.id)) || null;
}

/**
 * Record a finished lesson (or practice session when `id` is empty) and add XP.
 * @param {string} id
 * @param {number} accuracy percent of first-try correct answers
 * @param {number} xp
 */
export function finishSession(id, accuracy, xp) {
  const t = today();
  if (id) {
    const prev = state.lessons[id];
    state.lessons[id] = {
      completed: (prev?.completed || 0) + 1,
      best: Math.max(prev?.best || 0, accuracy),
      last: t,
    };
  }
  state.xp += xp;
  state.daily[t] = (state.daily[t] || 0) + xp;
  // Keep only the last 60 days of daily XP.
  const cutoff = addDays(t, -60);
  for (const d of Object.keys(state.daily)) if (d < cutoff) delete state.daily[d];
  writeJSON(KEY, state);
  touchStreak(t);
}

export function totalXp() {
  return state.xp;
}

export function xpToday() {
  return state.daily[today()] || 0;
}

export function completedCount() {
  return Object.values(state.lessons).filter((p) => p.completed).length;
}

/* ---------- daily streak ---------- */

/** @param {string} t today */
function touchStreak(t) {
  if (streak.last === t) return;
  streak.count = streak.last === addDays(t, -1) ? streak.count + 1 : 1;
  streak.last = t;
  streak.best = Math.max(streak.best || 0, streak.count);
  writeJSON(STREAK_KEY, streak);
}

/** Current streak: days in a row with at least one finished lesson, ending today or yesterday. */
export function getStreak() {
  const t = today();
  const alive = streak.last === t || streak.last === addDays(t, -1);
  return { count: alive ? streak.count : 0, best: streak.best || 0, practicedToday: streak.last === t };
}

/* ---------- settings ---------- */

export function getSettings() {
  return { ...settings };
}

/** @param {Partial<Settings>} patch */
export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  writeJSON(SETTINGS_KEY, settings);
}

/* ---------- export / import / reset ---------- */

const APP = 'language-trainer';

export function exportData() {
  return { app: APP, version: 1, exported: new Date().toISOString(), progress: state, streak, settings };
}

/**
 * Validate an imported file. Returns the cleaned data or throws a readable error.
 * @param {any} data
 */
export function parseImport(data) {
  if (!data || typeof data !== 'object' || data.app !== APP || !data.progress || typeof data.progress !== 'object') {
    throw new Error('This is not a progress file from this app.');
  }
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const p = data.progress;
  /** @type {State} */
  const clean = emptyState();
  for (const [id, l] of Object.entries(p.lessons || {})) {
    if (!l || !Number.isInteger(l.completed) || l.completed < 0 || !isDate(l.last)) {
      throw new Error(`Invalid entry for lesson "${id}".`);
    }
    clean.lessons[id] = { completed: l.completed, best: Math.min(100, Math.max(0, Number(l.best) || 0)), last: l.last };
  }
  clean.xp = Math.max(0, Math.floor(Number(p.xp) || 0));
  for (const [d, xp] of Object.entries(p.daily || {})) if (isDate(d)) clean.daily[d] = Math.max(0, Number(xp) || 0);
  const s = data.streak;
  const cleanStreak = s && isDate(s.last) ? { last: s.last, count: Number(s.count) || 0, best: Number(s.best) || 0 } : emptyStreak();
  const cleanSettings = { ...DEFAULT_SETTINGS, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) };
  return { progress: clean, streak: cleanStreak, settings: cleanSettings };
}

/**
 * Replace all progress with imported data (already validated by parseImport).
 * @param {ReturnType<typeof parseImport>} data
 */
export function importData({ progress, streak: s, settings: st }) {
  state = progress;
  streak = s;
  settings = st;
  writeJSON(KEY, state);
  writeJSON(STREAK_KEY, streak);
  writeJSON(SETTINGS_KEY, settings);
}

/** Delete all progress and the streak. Settings are kept. */
export function resetAll() {
  state = emptyState();
  streak = emptyStreak();
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(STREAK_KEY);
  } catch {
    /* ignore */
  }
}
