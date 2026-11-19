// Unit tests for spoken-sentence checking and text helpers (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSpoken, numberToWords, toneIndex } from '../../js/vietnamese.js';
import { fold, addDays, shuffle } from '../../js/util.js';

test('checkSpoken() passes when every syllable is heard with the right tone', () => {
  const r = checkSpoken('Tôi khỏe, cảm ơn.', ['tôi khỏe cảm ơn']);
  assert.ok(r.passed);
  assert.ok(r.parts.filter((p) => p.ok !== null).every((p) => p.ok));
});

test('checkSpoken() marks words with a wrong tone as missing', () => {
  const r = checkSpoken('Tôi khỏe, cảm ơn.', ['tôi khoe cảm ơn']);
  assert.ok(!r.passed);
  assert.deepEqual(
    r.parts.filter((p) => p.ok === false).map((p) => p.text),
    ['khỏe,'],
  );
});

test('checkSpoken() uses the best of several alternatives', () => {
  const r = checkSpoken('Xin chào!', ['sin chao', 'xin chào']);
  assert.ok(r.passed);
  assert.equal(r.heard, 'xin chào');
});

test('checkSpoken() accepts old and new tone placement (hoà = hòa)', () => {
  assert.ok(checkSpoken('Phòng có điều hòa không?', ['phòng có điều hoà không']).passed);
});

test('checkSpoken() understands numbers written as digits', () => {
  assert.ok(checkSpoken('Ba mươi nghìn.', ['30.000']).passed);
  assert.ok(checkSpoken('Tôi hai mươi lăm tuổi.', ['tôi 25 tuổi']).passed);
});

test('numberToWords() follows Northern rules', () => {
  assert.equal(numberToWords(15), 'mười lăm');
  assert.equal(numberToWords(21), 'hai mươi mốt');
  assert.equal(numberToWords(24), 'hai mươi tư');
  assert.equal(numberToWords(105), 'một trăm linh năm');
  assert.equal(numberToWords(100000), 'một trăm nghìn');
});

test('toneIndex() puts the tone on the right vowel', () => {
  const at = (s) => [...s][toneIndex([...s])];
  assert.equal(at('hoang'), 'a');
  assert.equal(at('mai'), 'a');
  assert.equal(at('thuong'.replace('uo', 'ươ')), 'ơ');
  assert.equal(at('quy'), 'y');
});

test('fold() strips accents, including đ', () => {
  assert.equal(fold('Cà phê ĐÁ'), 'ca phe da');
});

test('addDays() crosses month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('shuffle() keeps all elements and does not change the input', () => {
  const a = [1, 2, 3, 4, 5];
  const b = shuffle(a);
  assert.deepEqual(a, [1, 2, 3, 4, 5]);
  assert.deepEqual([...b].sort(), a);
});
