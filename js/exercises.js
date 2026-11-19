// @ts-check
// Turns the plain sentences of a lesson into exercises. The data files only contain
// sentence pairs; the exercise type is chosen here, so every sentence can be practised
// in every way:
//
//   choice    English sentence → pick the right Vietnamese one of three
//   build-en  Vietnamese sentence → put English word tiles in order
//   build-vi  English sentence → put Vietnamese word tiles in order
//   listen    hear the Vietnamese sentence → put Vietnamese tiles in order
//   speak     read the Vietnamese sentence aloud (speech recognition)

import { shuffle } from './util.js';
import { clean } from './vietnamese.js';

/** @typedef {import('./data.js').Item} Item */
/** @typedef {'choice' | 'build-en' | 'build-vi' | 'listen' | 'speak'} ExerciseType */
/** @typedef {{ id: number, text: string }} Tile */

/**
 * @typedef {Object} Exercise
 * @property {ExerciseType} type
 * @property {Item} item
 * @property {Tile[]} [tiles]       build/listen: shuffled word bank (answer words + distractors)
 * @property {Item[]} [options]     choice: shuffled options, one of them is `item`
 */

const EDGE_PUNCT = /^[“"‘'(¿¡]+|[.,!?;:…"”’')]+$/g;

/** Split a sentence into word tiles (Vietnamese: one tile per syllable), without punctuation. */
export function words(text) {
  return text
    .normalize('NFC')
    .split(/\s+/)
    .map((w) => w.replace(EDGE_PUNCT, ''))
    .filter(Boolean);
}

/** Comparable form: lowercase, NFC, no punctuation, single spaces. */
export const normalize = clean;

/**
 * Is the built sentence one of the accepted answers?
 * @param {string[]} built tile texts in order
 * @param {string[]} accepted
 */
export function isCorrect(built, accepted) {
  const answer = normalize(built.join(' '));
  return accepted.some((a) => normalize(a) === answer);
}

/** Accepted answers for an exercise. */
export function accepted(/** @type {Exercise} */ ex) {
  if (ex.type === 'build-en') return [ex.item.en, ...(ex.item.alt || [])];
  return [ex.item.vi];
}

/**
 * Word bank: the answer's words plus a few distractors taken from other sentences.
 * @param {string} answer
 * @param {string[]} others other sentences in the same language
 */
function makeTiles(answer, others) {
  const answerWords = words(answer);
  const taken = new Set(answerWords.map((w) => w.toLowerCase()));
  const candidates = [];
  for (const s of shuffle(others)) {
    for (const w of words(s)) {
      const key = w.toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      candidates.push(w);
    }
  }
  const n = Math.min(candidates.length, Math.max(2, Math.min(5, Math.ceil(answerWords.length / 2))));
  const texts = shuffle([...answerWords, ...shuffle(candidates).slice(0, n)]);
  return texts.map((text, id) => ({ id, text }));
}

/**
 * Build one exercise.
 * @param {ExerciseType} type
 * @param {Item} item
 * @param {Item[]} pool sentences to take distractors from (usually the whole unit)
 * @returns {Exercise}
 */
export function makeExercise(type, item, pool) {
  const others = pool.filter((p) => p.vi !== item.vi);
  if (type === 'choice') {
    // Distractors must differ from the answer and from each other, in both languages.
    const seenVi = new Set([normalize(item.vi)]);
    const seenEn = new Set([normalize(item.en)]);
    const wrong = shuffle(others).filter((o) => {
      const vi = normalize(o.vi);
      const en = normalize(o.en);
      if (seenVi.has(vi) || seenEn.has(en)) return false;
      seenVi.add(vi);
      seenEn.add(en);
      return true;
    });
    return { type, item, options: shuffle([item, ...wrong.slice(0, 2)]) };
  }
  if (type === 'build-en') return { type, item, tiles: makeTiles(item.en, others.map((o) => o.en)) };
  return { type, item, tiles: makeTiles(item.vi, others.map((o) => o.vi)) };
}

/**
 * Exercises for a lesson: the types are spread evenly over the sentences and shuffled.
 * Listening and speaking are swapped for tile exercises when the device can't do them.
 * @param {Item[]} items
 * @param {Item[]} pool
 * @param {{ listening: boolean, speaking: boolean }} can
 */
export function buildExercises(items, pool, can) {
  /** @type {ExerciseType[]} */
  const cycle = ['build-en', 'build-vi', 'listen', 'speak', 'choice'];
  const types = shuffle(items.map((_, i) => cycle[i % cycle.length]));
  // Start with something easy that introduces a sentence.
  const easy = types.indexOf('choice');
  if (easy > 0) [types[0], types[easy]] = [types[easy], types[0]];
  return shuffle(items).map((item, i) => {
    let type = types[i];
    if (type === 'listen' && !can.listening) type = 'build-vi';
    if (type === 'speak' && !can.speaking) type = 'build-en';
    return makeExercise(type, item, pool);
  });
}
