// @ts-check
// Vietnamese text helpers: tone placement and checking spoken sentences.

import { fold } from './util.js';

export const PUNCT = /[.,!?;:…"“”'‘’()\-–—]/g;

/** NFC, lowercase, no punctuation, single spaces. */
export function clean(text) {
  return String(text).normalize('NFC').toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim();
}

const TONE_RE = /[̣̀́̃̉]/g;
const SHAPE_RE = /[̛̂̆]/; // circumflex, breve, horn  (â ê ô, ă, ơ ư)
const isVowel = (ch) => 'aeiouy'.includes(fold(ch));

/**
 * Index (within `syllable`) of the vowel that should carry the tone, or -1.
 * Rules (traditional Northern placement):
 *  - a vowel with a shape mark (ă â ê ô ơ ư) takes the tone (last one for ươ → ơ);
 *  - "qu"/"gi" + vowel: the u / i belongs to the consonant;
 *  - vowel cluster at the end of the syllable (mái, của, hòa): second-to-last vowel;
 *  - otherwise (cluster followed by a consonant: hoàng, toán): last vowel of the cluster.
 * @param {string[]} syllable letters, NFC
 */
export function toneIndex(syllable) {
  let vowels = syllable.map((ch, i) => (isVowel(ch) ? i : -1)).filter((i) => i >= 0);
  if (!vowels.length) return -1;
  const word = fold(syllable.join(''));
  if ((word.startsWith('qu') || word.startsWith('gi')) && vowels.length > 1 && vowels[0] === 1) vowels = vowels.slice(1);
  const shaped = vowels.filter((i) => SHAPE_RE.test(syllable[i].normalize('NFD')));
  if (shaped.length) return shaped[shaped.length - 1];
  if (vowels.length === 1) return vowels[0];
  const last = vowels[vowels.length - 1];
  const endsWithVowel = last === syllable.length - 1;
  return endsWithVowel ? vowels[vowels.length - 2] : last;
}

/* ---------- speaking: compare what the recognizer heard with the sentence ---------- */

/**
 * One spelling per syllable, so old- and new-style tone placement compare equal
 * ("hoà" = "hòa", "thuỷ" = "thủy"): strip the tone and put it back by the rules above.
 * @param {string} syllable lowercase, NFC
 */
function canonSyllable(syllable) {
  const nfd = syllable.normalize('NFD');
  const tone = (nfd.match(TONE_RE) || [])[0];
  const base = [...nfd.replace(TONE_RE, '').normalize('NFC')];
  if (!tone) return base.join('');
  const idx = toneIndex(base);
  if (idx >= 0) base[idx] = (base[idx].normalize('NFD') + tone).normalize('NFC');
  return base.join('');
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** 0–999 in Northern Vietnamese; `full` adds "không trăm" / "linh" inside bigger numbers. */
function below1000(n, full) {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out = [];
  if (h || full) out.push(DIGITS[h], 'trăm');
  if (t === 0) {
    if (u && (h || full)) out.push('linh');
    if (u || !out.length) out.push(DIGITS[u]);
  } else {
    out.push(t === 1 ? 'mười' : `${DIGITS[t]} mươi`);
    if (u === 1) out.push(t === 1 ? 'một' : 'mốt');
    else if (u === 4) out.push(t === 1 ? 'bốn' : 'tư');
    else if (u === 5) out.push('lăm');
    else if (u) out.push(DIGITS[u]);
  }
  return out.join(' ');
}

/** Spell out a whole number (up to billions) the Northern way, e.g. 25000 → "hai mươi lăm nghìn". */
export function numberToWords(n) {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  if (n < 1000) return below1000(n, false);
  const groups = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const out = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    out.push(below1000(groups[i], i < groups.length - 1), units[i] || '');
  }
  return out.join(' ').trim();
}

/** Recognizers often write numbers as digits ("50.000", "2"): spell them out. */
function spellNumbers(text) {
  return text.replace(/\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+/g, (m) => numberToWords(Number(m.replace(/[.,]/g, ''))));
}

/** Other spellings recognizers use for loanwords, mapped to the spelling in the word list. */
const ALIASES = { cafe: 'cà phê', café: 'cà phê', coffee: 'cà phê', 'wi fi': 'wifi', bus: 'buýt', ok: 'ô kê', okay: 'ô kê', oke: 'ô kê' };
const ALIAS_RE = new RegExp(`(^|\\s)(${Object.keys(ALIASES).join('|')})(?=\\s|$)`, 'g');

/** @param {string} text */
const syllables = (text) =>
  clean(text)
    .replace(ALIAS_RE, (_, sp, w) => sp + ALIASES[w])
    .split(' ')
    .filter(Boolean)
    .map(canonSyllable);

/**
 * Indices of `expected` that are matched, in order, by `heard` (longest common subsequence).
 * @param {string[]} expected
 * @param {string[]} heard
 */
function matchedIndices(expected, heard) {
  const n = expected.length;
  const m = heard.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = expected[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Set();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (expected[i] === heard[j]) {
      hit.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return hit;
}

/**
 * Check a spoken sentence word by word. Tones count: "ba" is not "bà".
 * @param {string} expected        the Vietnamese sentence
 * @param {string[]} alternatives  transcripts from the recognizer
 * @returns {{ parts: { text: string, ok: boolean | null }[], passed: boolean, heard: string }}
 *   parts: the sentence split at spaces (spaces kept, ok = null), each word marked heard or not
 */
export function checkSpoken(expected, alternatives) {
  const pieces = expected.normalize('NFC').split(/(\s+)/);
  /** @type {{ syl: string, piece: number }[]} */
  const exp = [];
  pieces.forEach((p, i) => {
    if (!/\s/.test(p)) for (const syl of syllables(p)) exp.push({ syl, piece: i });
  });
  const target = exp.map((e) => e.syl);

  let best = { hit: new Set(), heard: alternatives[0] || '' };
  for (const alt of alternatives) {
    const hit = matchedIndices(target, syllables(spellNumbers(alt)));
    if (hit.size > best.hit.size) best = { hit, heard: alt };
  }

  const missing = new Set(exp.filter((_, i) => !best.hit.has(i)).map((e) => e.piece));
  return {
    parts: pieces.map((text, i) => ({ text, ok: /\s/.test(text) || text === '' ? null : !missing.has(i) })),
    passed: best.hit.size === target.length && target.length > 0,
    heard: best.heard,
  };
}
