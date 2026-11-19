// @ts-check
// Loads the course: data/course.json lists the stage files in data/units/.

/**
 * @typedef {Object} Item  one sentence / practice
 * @property {string} vi       Vietnamese sentence
 * @property {string} en       English translation
 * @property {string[]} [alt]  other accepted English translations
 * @property {string} [note]   hint shown in the feedback
 *
 * @typedef {Object} Lesson
 * @property {string} id       stable id, progress is linked to it
 * @property {string} title
 * @property {string} [tip]    short explanation shown before the lesson
 * @property {Item[]} items
 * @property {Unit} unit       (added on load)
 * @property {number} index    position within the unit (added on load)
 * @property {number} order    position within the whole course (added on load)
 *
 * @typedef {Object} Unit  a stage
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {Lesson[]} lessons
 * @property {number} index    (added on load)
 *
 * @typedef {Object} Course
 * @property {string} language
 * @property {string} lang     BCP 47 code for speech, e.g. "vi-VN"
 * @property {Unit[]} units
 * @property {Lesson[]} lessons     all lessons in course order
 * @property {Map<string, Lesson>} lessonById
 */

/** @type {Promise<Course> | null} */
let pending = null;

/** @param {string} path */
async function getJSON(path) {
  // "no-cache" revalidates with the server, so newly pushed lessons show up right away.
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res.json();
}

/** Load the course once; every caller shares the same request. A failed load can be retried. */
export function loadData() {
  pending ??= load().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}

/** @returns {Promise<Course>} */
async function load() {
  const course = await getJSON('data/course.json');
  /** @type {Unit[]} */
  const units = await Promise.all((course.units || []).map((/** @type {string} */ file) => getJSON(`data/${file}`)));
  /** @type {Lesson[]} */
  const lessons = [];
  units.forEach((unit, ui) => {
    unit.index = ui;
    unit.lessons.forEach((lesson, li) => {
      lesson.unit = unit;
      lesson.index = li;
      lesson.order = lessons.length;
      lessons.push(lesson);
    });
  });
  return {
    language: course.language || 'Vietnamese',
    lang: course.lang || 'vi-VN',
    units,
    lessons,
    lessonById: new Map(lessons.map((l) => [l.id, l])),
  };
}
