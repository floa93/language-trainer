// Unit tests for progress, unlocking, streak and import (node --test).
// progress.js reads localStorage when it is imported, so a fake one is installed first.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const progress = await import('../../js/progress.js');
const { today, addDays } = await import('../../js/util.js');

const lessons = ['a', 'b', 'c'].map((id, order) => ({ id, order }));
const course = /** @type {any} */ ({ lessons });

beforeEach(() => {
  progress.resetAll();
  progress.saveSettings({ ...progress.DEFAULT_SETTINGS });
});

test('only the first lesson is open at the start', () => {
  assert.deepEqual(lessons.map((l) => progress.isUnlocked(l, course)), [true, false, false]);
  assert.equal(progress.currentLesson(course)?.id, 'a');
});

test('finishing a lesson unlocks the next one and adds XP', () => {
  progress.finishSession('a', 80, 10);
  assert.ok(progress.isCompleted('a'));
  assert.deepEqual(lessons.map((l) => progress.isUnlocked(l, course)), [true, true, false]);
  assert.equal(progress.currentLesson(course)?.id, 'b');
  assert.equal(progress.totalXp(), 10);
  assert.equal(progress.xpToday(), 10);
});

test('repeating a lesson counts completions and keeps the best accuracy', () => {
  progress.finishSession('a', 90, 10);
  progress.finishSession('a', 70, 10);
  assert.deepEqual(progress.lesson('a'), { completed: 2, best: 90, last: today() });
  assert.equal(progress.totalXp(), 20);
});

test('practice sessions add XP without completing a lesson', () => {
  progress.finishSession('', 100, 15);
  assert.equal(progress.completedCount(), 0);
  assert.equal(progress.totalXp(), 15);
});

test('"unlock all lessons" opens everything', () => {
  progress.saveSettings({ unlockAll: true });
  assert.ok(lessons.every((l) => progress.isUnlocked(l, course)));
});

test('the streak starts at 1 and is saved', () => {
  assert.equal(progress.getStreak().count, 0);
  progress.finishSession('a', 100, 15);
  assert.deepEqual(progress.getStreak(), { count: 1, best: 1, practicedToday: true });
  assert.equal(JSON.parse(store.get('lt.streak.v1')).last, today());
});

test('export → import round-trips', () => {
  progress.finishSession('a', 90, 10);
  const file = JSON.parse(JSON.stringify(progress.exportData()));
  progress.resetAll();
  assert.equal(progress.totalXp(), 0);
  progress.importData(progress.parseImport(file));
  assert.ok(progress.isCompleted('a'));
  assert.equal(progress.totalXp(), 10);
});

test('import rejects foreign or broken files', () => {
  assert.throws(() => progress.parseImport({ app: 'something-else', progress: {} }), /not a progress file/);
  assert.throws(
    () => progress.parseImport({ app: 'language-trainer', progress: { lessons: { a: { completed: 'x', last: today() } } } }),
    /Invalid entry for lesson "a"/,
  );
});

test('import drops invalid daily entries and clamps numbers', () => {
  const parsed = progress.parseImport({
    app: 'language-trainer',
    progress: { lessons: { a: { completed: 1, best: 250, last: addDays(today(), -1) } }, xp: -5, daily: { nonsense: 3 } },
  });
  assert.equal(parsed.progress.lessons.a.best, 100);
  assert.equal(parsed.progress.xp, 0);
  assert.deepEqual(parsed.progress.daily, {});
});
