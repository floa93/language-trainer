// @ts-check
// Lesson intro, the lesson session (full screen) and practice sessions.
import * as progress from '../progress.js';
import { esc, shuffle } from '../util.js';
import { speak, speakButton, hasVoice } from '../speech.js';
import { canListen, listen, stopListening } from '../listen.js';
import { checkSpoken } from '../vietnamese.js';
import { buildExercises, makeExercise, isCorrect, accepted } from '../exercises.js';

/** @typedef {import('../data.js').Course} Course */
/** @typedef {import('../data.js').Lesson} Lesson */
/** @typedef {import('../data.js').Item} Item */
/** @typedef {import('../exercises.js').Exercise} Exercise */

const PRACTICE_SIZE = 10;
const XP_LESSON = 10;
const XP_PERFECT_BONUS = 5;

const MIC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const PRAISE = ['Great!', 'Nice!', 'Correct!', 'Well done!', 'Excellent!', 'Tuyệt vời!', 'Giỏi quá!'];

/* ---------------------------------------------------------------- intro screens */

/** @param {HTMLElement} root @param {Course} data @param {RegExpMatchArray} match */
export function renderIntro(root, data, match) {
  const lesson = data.lessonById.get(decodeURIComponent(match[1]));
  if (!lesson) {
    location.replace('#/');
    return '';
  }
  const open = progress.isUnlocked(lesson, data);
  const p = progress.lesson(lesson.id);
  root.innerHTML = `
    <a class="back" href="#/">‹ Learning path</a>
    <section class="panel intro" style="--unit: var(--unit-${lesson.unit.index % 5})">
      <p class="unit-kicker">Stage ${lesson.unit.index + 1} · ${esc(lesson.unit.title)} · Lesson ${lesson.index + 1}</p>
      <h2 class="intro-title">${esc(lesson.title)}</h2>
      <p class="muted">${lesson.items.length} sentences${
        p ? ` · completed ${p.completed}× · best ${p.best}%` : ''
      }</p>
      ${lesson.tip ? `<div class="note tip"><strong>Tip</strong><br>${esc(lesson.tip)}</div>` : ''}
      ${
        open
          ? `<a class="btn btn-primary btn-block" href="#/lesson/${encodeURIComponent(lesson.id)}/play">${p ? 'Practice again' : 'Start lesson'}</a>`
          : `<p class="note">🔒 Finish the previous lesson to unlock this one (or turn on “Unlock all lessons” in Settings).</p>`
      }
    </section>
    <details class="panel preview">
      <summary>Sentences in this lesson</summary>
      <ul class="phrase-list">${lesson.items.map(phraseRow).join('')}</ul>
    </details>
  `;
  return lesson.title;
}

/** @param {Item} item */
export function phraseRow(item) {
  return `<li class="phrase"><div class="phrase-text"><p class="vi" lang="vi">${esc(item.vi)}</p><p class="en">${esc(item.en)}</p>${
    item.note ? `<p class="small muted">${esc(item.note)}</p>` : ''
  }</div>${speakButton(item.vi)}</li>`;
}

/** Sentences from completed lessons (or, with nothing completed, none). */
function practiceItems(/** @type {Course} */ data) {
  return data.lessons.filter((l) => progress.isCompleted(l.id)).flatMap((l) => l.items);
}

/** @param {HTMLElement} root @param {Course} data */
export function renderPracticeIntro(root, data) {
  const items = practiceItems(data);
  const n = progress.completedCount();
  root.innerHTML = `
    <section class="panel center intro">
      <p class="practice-icon" aria-hidden="true">🏋️</p>
      <h2 class="intro-title">Practice</h2>
      ${
        items.length
          ? `<p class="muted">${PRACTICE_SIZE} random sentences from the ${n} ${n === 1 ? 'lesson' : 'lessons'} you have completed. Earns XP and keeps your streak.</p>
             <a class="btn btn-primary btn-block" href="#/practice/play">Start practice</a>`
          : `<p class="muted">Complete your first lesson, then come back here to review what you’ve learned.</p>
             <a class="btn btn-primary btn-block" href="#/">Go to the learning path</a>`
      }
    </section>`;
  return 'Practice';
}

/* ---------------------------------------------------------------- sessions */

/**
 * @typedef {Object} Session
 * @property {string} lessonId       '' for practice
 * @property {string} exitHash
 * @property {Lesson | null} next    lesson after this one (for the "next lesson" button)
 * @property {Item[]} pool
 * @property {Exercise[]} queue      queue[0] is the current exercise
 * @property {number} total
 * @property {number} done
 * @property {Map<Item, boolean>} firstTry  was the first answer to the sentence right?
 * @property {number} startedAt
 * @property {boolean} speakingOff   "can't speak now" pressed
 * @property {number[]} answer       tile ids in the answer row
 * @property {number} selected       choice: index of the selected option, -1 = none
 * @property {null | { ok: boolean, skipped?: boolean }} checked
 * @property {boolean} played        prompt already read aloud
 * @property {{ listening: boolean, heard: string, error: string, result: ReturnType<typeof checkSpoken> | null }} spoken
 */

/** @type {Session | null} */
let session = null;
/** @type {HTMLElement | null} */
let sessionRoot = null;

/** @param {HTMLElement} root @param {Course} data @param {RegExpMatchArray} match */
export function renderLesson(root, data, match) {
  const lesson = data.lessonById.get(decodeURIComponent(match[1]));
  if (!lesson || !progress.isUnlocked(lesson, data)) {
    location.replace(lesson ? `#/lesson/${encodeURIComponent(lesson.id)}` : '#/');
    return '';
  }
  start(root, {
    lessonId: lesson.id,
    exitHash: `#/lesson/${encodeURIComponent(lesson.id)}`,
    next: data.lessons[lesson.order + 1] || null,
    items: lesson.items,
    pool: lesson.unit.lessons.flatMap((l) => l.items),
  });
  return lesson.title;
}

/** @param {HTMLElement} root @param {Course} data */
export function renderPractice(root, data) {
  const pool = practiceItems(data);
  if (!pool.length) {
    location.replace('#/practice');
    return '';
  }
  start(root, { lessonId: '', exitHash: '#/practice', next: null, items: shuffle(pool).slice(0, PRACTICE_SIZE), pool });
  return 'Practice';
}

/**
 * @param {HTMLElement} root
 * @param {{ lessonId: string, exitHash: string, next: Lesson | null, items: Item[], pool: Item[] }} opts
 */
function start(root, { lessonId, exitHash, next, items, pool }) {
  const settings = progress.getSettings();
  const queue = buildExercises(items, pool, {
    listening: settings.listening && hasVoice(),
    speaking: settings.speaking && canListen(),
  });
  session = {
    lessonId,
    exitHash,
    next,
    pool,
    queue,
    total: queue.length,
    done: 0,
    firstTry: new Map(),
    startedAt: Date.now(),
    speakingOff: false,
    ...fresh(),
  };
  sessionRoot = root;
  draw();
}

const fresh = () => ({
  answer: /** @type {number[]} */ ([]),
  selected: -1,
  checked: null,
  played: false,
  spoken: { listening: false, heard: '', error: '', result: null },
});

/** Is the session still on screen? (The user may have navigated away.) */
const alive = () => !!session && !!sessionRoot && /\/play$/.test(location.hash);

function draw() {
  if (!session || !sessionRoot) return;
  const s = session;
  const ex = s.queue[0];
  if (!ex) return finish();
  const pct = Math.round((s.done / s.total) * 100);

  sessionRoot.innerHTML = `
    <div class="session">
      <div class="session-head">
        <a class="close" href="${s.exitHash}" aria-label="Quit lesson" title="Quit">✕</a>
        <div class="bar bar-thick bar-grow" role="progressbar" aria-label="Lesson progress" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.done}"><span style="width:${pct}%"></span></div>
      </div>
      <div class="exercise">${body(ex)}</div>
    </div>
    <div class="footer ${s.checked ? (s.checked.ok ? 'footer-ok' : 'footer-wrong') : ''}">
      <div class="footer-inner">${footer(ex)}</div>
    </div>`;
  wire(ex);

  if (!s.played) {
    s.played = true;
    const settings = progress.getSettings();
    if (ex.type === 'listen' || (ex.type === 'build-en' && settings.autoplay)) speak(ex.item.vi);
  }
}

/* ----- exercise bodies ----- */

const HEADINGS = {
  choice: 'Select the correct translation',
  'build-en': 'Translate this sentence',
  'build-vi': 'Translate this sentence',
  listen: 'Tap what you hear',
  speak: 'Read this aloud',
};

/** @param {Exercise} ex */
function body(ex) {
  const s = /** @type {Session} */ (session);
  const head = `<h2 class="ex-title">${HEADINGS[ex.type]}</h2>`;
  const item = ex.item;

  if (ex.type === 'choice') {
    const opts = /** @type {Item[]} */ (ex.options)
      .map((o, i) => {
        const cls = ['option'];
        if (s.selected === i) cls.push('selected');
        if (s.checked && o === item) cls.push('is-right');
        if (s.checked && s.selected === i && o !== item) cls.push('is-wrong');
        return `<li><button type="button" class="${cls.join(' ')}" data-option="${i}" aria-pressed="${s.selected === i}"${
          s.checked ? ' disabled' : ''
        }><span class="option-key" aria-hidden="true">${i + 1}</span><span lang="vi">${esc(o.vi)}</span></button></li>`;
      })
      .join('');
    return `${head}<p class="prompt-en">“${esc(item.en)}”</p><ul class="options">${opts}</ul>`;
  }

  if (ex.type === 'speak') {
    const r = s.spoken.result;
    const sentence = r
      ? r.parts.map((p) => (p.ok === null ? esc(p.text) : `<span class="${p.ok ? 'w-ok' : 'w-miss'}">${esc(p.text)}</span>`)).join('')
      : esc(item.vi);
    const sp = s.spoken;
    const status = sp.error
      ? `<p class="msg msg-error" role="status">${esc(sp.error)}</p>`
      : `<p class="heard muted" role="status">${sp.heard ? `You said: <span lang="vi">“${esc(sp.heard)}”</span>` : sp.listening ? '…' : ''}</p>`;
    return `${head}
      <div class="prompt-card">
        <div class="with-speak"><p class="speak-sentence" lang="vi">${sentence}</p>${speakButton(item.vi)}${speakButton(item.vi, 'Listen slowly', true)}</div>
        <p class="muted">${esc(item.en)}</p>
      </div>
      ${status}
      ${
        s.checked
          ? ''
          : `<button class="mic${sp.listening ? ' mic-on' : ''}" type="button" id="mic" aria-pressed="${sp.listening}">
              <span class="mic-icon">${MIC_ICON}</span>
              <span>${sp.listening ? 'Listening… tap when done' : r ? 'Try again' : 'Tap and speak'}</span>
            </button>`
      }`;
  }

  // Tile exercises
  const isVi = ex.type !== 'build-en';
  const prompt =
    ex.type === 'build-en'
      ? `<div class="prompt-card"><div class="with-speak"><p class="prompt-vi" lang="vi">${esc(item.vi)}</p>${speakButton(item.vi)}${speakButton(item.vi, 'Listen slowly', true)}</div></div>`
      : ex.type === 'build-vi'
        ? `<p class="prompt-en">“${esc(item.en)}”</p>`
        : `<div class="listen-btns">
             <button type="button" class="listen-big" data-speak="${esc(item.vi)}" aria-label="Play the sentence"><span aria-hidden="true">🔊</span></button>
             <button type="button" class="listen-slow" data-speak="${esc(item.vi)}" data-slow aria-label="Play slowly"><span aria-hidden="true">🐢</span></button>
           </div>`;
  const tiles = /** @type {import('../exercises.js').Tile[]} */ (ex.tiles);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const lang = isVi ? ' lang="vi"' : '';
  const dis = s.checked ? ' disabled' : '';
  const answerRow = s.answer
    .map((id) => `<button type="button" class="tile" data-out="${id}"${lang}${dis}>${esc(byId.get(id)?.text)}</button>`)
    .join('');
  const bank = tiles
    .map((t) =>
      s.answer.includes(t.id)
        ? `<span class="tile tile-ghost" aria-hidden="true">${esc(t.text)}</span>`
        : `<button type="button" class="tile" data-in="${t.id}"${lang}${dis}>${esc(t.text)}</button>`,
    )
    .join('');
  return `${head}${prompt}
    <div class="answer-row" aria-label="Your answer">${answerRow}</div>
    <div class="bank" aria-label="Word bank">${bank}</div>`;
}

/* ----- footer: check button or feedback ----- */

/** @param {Exercise} ex */
function footer(ex) {
  const s = /** @type {Session} */ (session);
  if (!s.checked) {
    if (ex.type === 'speak') {
      return `<button class="btn btn-ghost btn-block" type="button" id="skip">Can’t speak now</button>`;
    }
    const ready = ex.type === 'choice' ? s.selected >= 0 : s.answer.length > 0;
    return `<button class="btn btn-primary btn-block" type="button" id="check"${ready ? '' : ' disabled'}>Check</button>`;
  }
  const item = ex.item;
  const answerIsVi = ex.type !== 'build-en';
  const solution = answerIsVi ? item.vi : item.en;
  const title = s.checked.skipped
    ? 'Skipped – no problem'
    : s.checked.ok
      ? `✓ ${PRAISE[Math.floor(Math.random() * PRAISE.length)]}`
      : '✗ Correct solution:';
  return `<div class="feedback-text" role="status">
      <p class="feedback-title">${esc(title)}</p>
      ${
        !s.checked.ok
          ? `<div class="with-speak"><p class="feedback-solution"${answerIsVi ? ' lang="vi"' : ''}>${esc(solution)}</p>${speakButton(item.vi)}</div>`
          : `<div class="with-speak"><p class="feedback-meaning"><span lang="vi">${esc(item.vi)}</span> = ${esc(item.en)}</p>${speakButton(item.vi)}</div>`
      }
      ${item.note ? `<p class="small">${esc(item.note)}</p>` : ''}
    </div>
    <button class="btn btn-block ${s.checked.ok ? 'btn-ok' : 'btn-wrong'}" type="button" id="continue">Continue</button>`;
}

/* ----- events ----- */

/** @param {Exercise} ex */
function wire(ex) {
  const s = /** @type {Session} */ (session);
  const root = /** @type {HTMLElement} */ (sessionRoot);

  root.querySelectorAll('[data-option]').forEach((b) =>
    b.addEventListener('click', () => {
      s.selected = Number(b.getAttribute('data-option'));
      const o = /** @type {Item[]} */ (ex.options)[s.selected];
      if (progress.getSettings().autoplay) speak(o.vi);
      draw();
    }),
  );
  root.querySelectorAll('[data-in]').forEach((b) =>
    b.addEventListener('click', () => {
      s.answer.push(Number(b.getAttribute('data-in')));
      draw();
    }),
  );
  root.querySelectorAll('[data-out]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-out'));
      s.answer = s.answer.filter((x) => x !== id);
      draw();
    }),
  );
  root.querySelector('#check')?.addEventListener('click', check);
  root.querySelector('#continue')?.addEventListener('click', next);
  root.querySelector('#skip')?.addEventListener('click', () => {
    stopListening();
    s.speakingOff = true;
    // Remaining speaking exercises become translation exercises.
    s.queue = s.queue.map((e, i) => (i > 0 && e.type === 'speak' ? makeExercise('build-en', e.item, s.pool) : e));
    s.checked = { ok: true, skipped: true };
    draw();
  });
  root.querySelector('#mic')?.addEventListener('click', () => mic(ex));

  /** @type {HTMLElement | null} */ (root.querySelector('#continue, #check:not(:disabled)'))?.focus({ preventScroll: true });
}

function check() {
  const s = /** @type {Session} */ (session);
  const ex = s.queue[0];
  if (s.checked) return;
  let ok;
  if (ex.type === 'choice') {
    if (s.selected < 0) return;
    ok = /** @type {Item[]} */ (ex.options)[s.selected] === ex.item;
  } else {
    if (!s.answer.length) return;
    const tiles = /** @type {import('../exercises.js').Tile[]} */ (ex.tiles);
    const built = s.answer.map((id) => /** @type {any} */ (tiles.find((t) => t.id === id)).text);
    ok = isCorrect(built, accepted(ex));
  }
  answered(ok);
  if (ex.type !== 'build-en' || !ok) speak(ex.item.vi);
}

/** @param {boolean} ok */
function answered(ok) {
  const s = /** @type {Session} */ (session);
  const item = s.queue[0].item;
  if (!s.firstTry.has(item)) s.firstTry.set(item, ok);
  s.checked = { ok };
  draw();
}

function next() {
  const s = /** @type {Session} */ (session);
  const ex = /** @type {Exercise} */ (s.queue.shift());
  if (s.checked?.ok) s.done++;
  else s.queue.push(makeExercise(ex.type, ex.item, s.pool)); // wrong answers come back at the end
  Object.assign(s, fresh());
  draw();
}

/* ----- speaking ----- */

const LISTEN_ERRORS = {
  'no-speech': 'I didn’t hear anything. Tap the microphone and read the sentence aloud.',
  'not-allowed': 'Microphone access is blocked. Allow it in the browser settings, or tap “Can’t speak now”.',
  'service-not-allowed': 'Speech recognition is not available. On iPhone, turn on Siri & Dictation.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection.',
};

/** @param {Exercise} ex */
function mic(ex) {
  const s = /** @type {Session} */ (session);
  const sp = s.spoken;
  if (sp.listening) return stopListening();
  sp.listening = true;
  sp.error = '';
  sp.heard = '';
  draw();
  listen({
    onInterim: (text) => {
      if (!alive()) return;
      const el = sessionRoot?.querySelector('.heard');
      if (el) el.textContent = text ? `“${text}”` : '…';
    },
    onResult: (alternatives) => {
      if (!alive() || s !== session) return;
      sp.listening = false;
      const r = checkSpoken(ex.item.vi, alternatives);
      sp.result = r;
      sp.heard = r.heard;
      if (r.passed) answered(true);
      else {
        if (!s.firstTry.has(ex.item)) s.firstTry.set(ex.item, false);
        draw();
      }
    },
    onError: (code) => {
      if (code === 'aborted' || !alive() || s !== session) return;
      sp.listening = false;
      sp.error = LISTEN_ERRORS[code] || `Speech recognition failed (${code}). Try again or tap “Can’t speak now”.`;
      draw();
    },
  });
}

/* ----- end of session ----- */

function finish() {
  const s = /** @type {Session} */ (session);
  const root = /** @type {HTMLElement} */ (sessionRoot);
  const answers = [...s.firstTry.values()];
  const accuracy = answers.length ? Math.round((answers.filter(Boolean).length / answers.length) * 100) : 100;
  const xp = XP_LESSON + (accuracy === 100 ? XP_PERFECT_BONUS : 0);
  const before = progress.getStreak();
  progress.finishSession(s.lessonId, accuracy, xp);
  const streak = progress.getStreak();
  const secs = Math.round((Date.now() - s.startedAt) / 1000);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  session = null;

  const nextBtn = s.next
    ? `<a class="btn btn-primary btn-block" href="#/lesson/${encodeURIComponent(s.next.id)}/play">Next lesson · ${esc(s.next.title)}</a>`
    : '';
  root.innerHTML = `
    <section class="done">
      <p class="done-icon" aria-hidden="true">${accuracy === 100 ? '🏆' : '🎉'}</p>
      <h2 class="done-title">${s.lessonId ? 'Lesson complete!' : 'Practice complete!'}</h2>
      ${!before.practicedToday ? `<p class="streak"><span aria-hidden="true">🔥</span> <strong>${streak.count}-day streak!</strong></p>` : ''}
      <div class="stats">
        <div class="stat stat-xp"><span class="stat-num">+${xp}</span><span class="stat-label">XP</span></div>
        <div class="stat stat-acc"><span class="stat-num">${accuracy}%</span><span class="stat-label">accuracy</span></div>
        <div class="stat stat-time"><span class="stat-num">${time}</span><span class="stat-label">time</span></div>
      </div>
      ${s.lessonId ? nextBtn : '<button class="btn btn-primary btn-block" type="button" id="again">Practice again</button>'}
      <a class="btn btn-block" href="#/">Back to the learning path</a>
    </section>`;
  // Same URL as now, so re-run the router instead of navigating.
  root.querySelector('#again')?.addEventListener('click', () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  /** @type {HTMLElement | null} */ (root.querySelector('.btn'))?.focus({ preventScroll: true });
}

/* ----- keyboard: Enter = check / continue, 1–3 = pick an option ----- */

document.addEventListener('keydown', (e) => {
  if (!alive() || e.altKey || e.ctrlKey || e.metaKey) return;
  const root = /** @type {HTMLElement} */ (sessionRoot);
  if (e.key === 'Enter') {
    const btn = /** @type {HTMLButtonElement | null} */ (root.querySelector('#continue, #check'));
    if (btn && !btn.disabled && document.activeElement?.tagName !== 'A') {
      e.preventDefault();
      btn.click();
    }
  } else if (/^[1-9]$/.test(e.key)) {
    /** @type {HTMLButtonElement | null} */ (root.querySelector(`[data-option="${Number(e.key) - 1}"]`))?.click();
  }
});
