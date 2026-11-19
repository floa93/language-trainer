#!/usr/bin/env node
// Validates data/course.json and every stage file it lists. Exits with code 1 and lists all problems.
// Usage: node scripts/validate-data.mjs [path/to/data]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'data';
const errors = [];
const warnings = [];
const MIN_ITEMS = 4;
const IDEAL_ITEMS = 10;

const UNIT_FIELDS = ['id', 'title', 'description', 'lessons'];
const LESSON_FIELDS = ['id', 'title', 'tip', 'items'];
const ITEM_FIELDS = ['vi', 'en', 'alt', 'note'];

function readJSON(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${file}: ${err.code === 'ENOENT' ? 'file not found' : `not valid JSON – ${err.message}`}`);
    return null;
  }
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const unknown = (obj, allowed, where) => {
  for (const f of Object.keys(obj)) if (!allowed.includes(f)) errors.push(`${where}: unknown field "${f}" (typo?)`);
};

const courseFile = join(dir, 'course.json');
const course = readJSON(courseFile);
const unitIds = new Map();
const lessonIds = new Map();
let lessonCount = 0;
let itemCount = 0;

if (course) {
  if (!Array.isArray(course.units) || !course.units.length) errors.push(`${courseFile}: "units" must be a non-empty array of file names`);
  for (const file of course.units || []) {
    const path = join(dir, file);
    const unit = readJSON(path);
    if (!unit) continue;
    if (typeof unit !== 'object' || Array.isArray(unit)) {
      errors.push(`${path}: must be an object`);
      continue;
    }
    unknown(unit, UNIT_FIELDS, path);
    for (const f of ['id', 'title']) if (!isText(unit[f])) errors.push(`${path}: missing or empty "${f}"`);
    if ('description' in unit && typeof unit.description !== 'string') errors.push(`${path}: "description" must be a string`);
    if (isText(unit.id)) {
      if (unitIds.has(unit.id)) errors.push(`${path}: duplicate stage id "${unit.id}" (also in ${unitIds.get(unit.id)})`);
      else unitIds.set(unit.id, path);
    }
    if (!Array.isArray(unit.lessons) || !unit.lessons.length) {
      errors.push(`${path}: "lessons" must be a non-empty array`);
      continue;
    }
    if (unit.lessons.length !== IDEAL_ITEMS) warnings.push(`${path}: has ${unit.lessons.length} lessons (usually ${IDEAL_ITEMS})`);

    unit.lessons.forEach((lesson, li) => {
      const where = `${path} lessons[${li}]${lesson && isText(lesson.id) ? ` (${lesson.id})` : ''}`;
      if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
        errors.push(`${where}: must be an object`);
        return;
      }
      lessonCount++;
      unknown(lesson, LESSON_FIELDS, where);
      for (const f of ['id', 'title']) if (!isText(lesson[f])) errors.push(`${where}: missing or empty "${f}"`);
      if ('tip' in lesson && typeof lesson.tip !== 'string') errors.push(`${where}: "tip" must be a string`);
      if (isText(lesson.id)) {
        if (!/^[A-Za-z0-9_-]+$/.test(lesson.id)) errors.push(`${where}: id may only contain letters, digits, - and _`);
        if (lessonIds.has(lesson.id)) errors.push(`${where}: duplicate lesson id "${lesson.id}" (also at ${lessonIds.get(lesson.id)})`);
        else lessonIds.set(lesson.id, where);
      }
      if (!Array.isArray(lesson.items)) {
        errors.push(`${where}: "items" must be an array`);
        return;
      }
      if (lesson.items.length < MIN_ITEMS) errors.push(`${where}: needs at least ${MIN_ITEMS} items, has ${lesson.items.length}`);
      else if (lesson.items.length !== IDEAL_ITEMS) warnings.push(`${where}: has ${lesson.items.length} items (usually ${IDEAL_ITEMS})`);

      const seen = new Map();
      lesson.items.forEach((item, ii) => {
        const w = `${where} items[${ii}]`;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${w}: must be an object`);
          return;
        }
        itemCount++;
        unknown(item, ITEM_FIELDS, w);
        for (const f of ['vi', 'en']) if (!isText(item[f])) errors.push(`${w}: missing or empty "${f}"`);
        if ('note' in item && typeof item.note !== 'string') errors.push(`${w}: "note" must be a string`);
        if ('alt' in item && (!Array.isArray(item.alt) || !item.alt.every(isText))) errors.push(`${w}: "alt" must be an array of non-empty strings`);
        if (isText(item.vi)) {
          if (item.vi !== item.vi.normalize('NFC')) errors.push(`${w}: "vi" is not NFC-normalized (retype the accents)`);
          const key = item.vi.normalize('NFC').toLowerCase().replace(/[.,!?;:…]/g, '').trim();
          if (seen.has(key)) errors.push(`${w}: duplicate sentence "${item.vi}" (also items[${seen.get(key)}])`);
          else seen.set(key, ii);
        }
      });
    });
  }
}

for (const w of warnings) console.warn(`! ${w}`);
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${unitIds.size} stages, ${lessonCount} lessons, ${itemCount} sentences – all valid`);
