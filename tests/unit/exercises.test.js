// Unit tests for exercise generation and answer checking (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { words, isCorrect, accepted, makeExercise, buildExercises } from '../../js/exercises.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), 'utf8'));
const units = read('course.json').units.map(read);
// Lessons take distractors from their own stage, so test each stage's sentences against that stage.
const stages = units.map((u) => u.lessons.flatMap((l) => l.items));
const pool = stages[0];
const lesson = units[0].lessons[0].items;
const everyItem = (fn) => stages.forEach((stage) => stage.forEach((item) => fn(item, stage)));
const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());

test('words() splits into tiles without punctuation', () => {
  assert.deepEqual(words('Tôi khỏe, cảm ơn.'), ['Tôi', 'khỏe', 'cảm', 'ơn']);
  assert.deepEqual(words('“Hello,” I said!'), ['Hello', 'I', 'said']);
  assert.deepEqual(words("I'm fine."), ["I'm", 'fine']);
});

test('isCorrect() ignores case and punctuation but not word order or tones', () => {
  assert.ok(isCorrect(['tôi', 'khỏe', 'cảm', 'ơn'], ['Tôi khỏe, cảm ơn.']));
  assert.ok(!isCorrect(['khỏe', 'tôi', 'cảm', 'ơn'], ['Tôi khỏe, cảm ơn.']));
  assert.ok(!isCorrect(['tôi', 'khoe', 'cảm', 'ơn'], ['Tôi khỏe, cảm ơn.']));
  assert.ok(isCorrect(['Hi'], ['Hello!', 'Hi!']));
});

test('isCorrect() treats decomposed and precomposed accents the same', () => {
  assert.ok(isCorrect(['khỏe'.normalize('NFD')], ['khỏe']));
});

test('accepted() includes alternative English translations', () => {
  const item = { vi: 'Xin chào!', en: 'Hello!', alt: ['Hi!'] };
  assert.deepEqual(accepted({ type: 'build-en', item }), ['Hello!', 'Hi!']);
  assert.deepEqual(accepted({ type: 'build-vi', item }), ['Xin chào!']);
  assert.deepEqual(accepted({ type: 'listen', item }), ['Xin chào!']);
});

for (const type of ['build-en', 'build-vi', 'listen']) {
  test(`${type}: tiles contain every word of the answer, plus distractors`, () => {
    everyItem((item, pool) => {
      const ex = makeExercise(type, item, pool);
      const answer = words(type === 'build-en' ? item.en : item.vi);
      const tiles = ex.tiles.map((t) => t.text);
      const have = count(tiles);
      for (const [w, n] of count(answer)) assert.ok((have.get(w) || 0) >= n, `"${w}" missing for "${item.vi}"`);
      assert.ok(tiles.length > answer.length, `no distractors for "${item.vi}"`);
      assert.equal(new Set(ex.tiles.map((t) => t.id)).size, tiles.length, 'tile ids are unique');
      // Building the answer from the tiles must be accepted.
      assert.ok(isCorrect(answer, accepted(ex)));
    });
  });
}

test('distractor tiles never repeat a word of the answer', () => {
  everyItem((item, pool) => {
    const ex = makeExercise('build-vi', item, pool);
    const answer = words(item.vi).map((w) => w.toLowerCase());
    const extra = ex.tiles.map((t) => t.text.toLowerCase()).filter((w) => !answer.includes(w));
    assert.equal(extra.length + answer.length, ex.tiles.length, `"${item.vi}" has a distractor equal to an answer word`);
  });
});

test('choice: three options, exactly one correct, all different in both languages', () => {
  everyItem((item, pool) => {
    const ex = makeExercise('choice', item, pool);
    assert.equal(ex.options.length, 3);
    assert.equal(ex.options.filter((o) => o === item).length, 1);
    assert.equal(new Set(ex.options.map((o) => o.vi)).size, 3);
    assert.equal(new Set(ex.options.map((o) => o.en.toLowerCase())).size, 3);
  });
});

test('buildExercises() makes one exercise per sentence with a mix of types', () => {
  const exs = buildExercises(lesson, pool, { listening: true, speaking: true });
  assert.equal(exs.length, lesson.length);
  assert.deepEqual(new Set(exs.map((e) => e.item)), new Set(lesson));
  assert.deepEqual(new Set(exs.map((e) => e.type)), new Set(['choice', 'build-en', 'build-vi', 'listen', 'speak']));
  assert.equal(exs[0].type, 'choice', 'starts with an easy exercise');
});

test('buildExercises() replaces listening and speaking when the device cannot do them', () => {
  for (let i = 0; i < 20; i++) {
    const types = buildExercises(lesson, pool, { listening: false, speaking: false }).map((e) => e.type);
    assert.ok(!types.includes('listen') && !types.includes('speak'));
  }
});
