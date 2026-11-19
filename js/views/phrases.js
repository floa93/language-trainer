// @ts-check
// All sentences of the course, grouped by stage and lesson, with search (accents optional).
import { esc, fold } from '../util.js';
import { phraseRow } from './lesson.js';
import * as progress from '../progress.js';

let query = '';
let unitFilter = 'all';

/** @param {HTMLElement} root @param {import('../data.js').Course} data */
export function render(root, data) {
  root.innerHTML = `
    <div class="filters">
      <label class="filters-search"><span class="visually-hidden">Search</span>
        <input class="input" type="search" id="q" placeholder="Search (e.g. ca phe)" value="${esc(query)}" autocomplete="off"></label>
      <label><span class="visually-hidden">Stage</span>
        <select class="input" id="unit">
          <option value="all">All stages</option>
          ${data.units.map((u) => `<option value="${esc(u.id)}"${unitFilter === u.id ? ' selected' : ''}>Stage ${u.index + 1} · ${esc(u.title)}</option>`).join('')}
        </select></label>
    </div>
    <div id="results"></div>`;

  const results = /** @type {HTMLElement} */ (root.querySelector('#results'));
  const update = () => {
    const q = fold(query);
    let count = 0;
    const html = data.units
      .filter((u) => unitFilter === 'all' || u.id === unitFilter)
      .flatMap((u) =>
        u.lessons.map((l) => {
          const items = l.items.filter((it) => !q || fold(it.vi).includes(q) || fold(it.en).includes(q) || (it.alt || []).some((a) => fold(a).includes(q)));
          count += items.length;
          if (!items.length) return '';
          const done = progress.isCompleted(l.id) ? ' <span class="tick" aria-label="completed">✓</span>' : '';
          return `<section class="phrase-group">
            <h2 class="section-title">${esc(l.title)}${done} <span class="muted small">Stage ${u.index + 1}</span></h2>
            <ul class="phrase-list panel">${items.map(phraseRow).join('')}</ul>
          </section>`;
        }),
      )
      .join('');
    results.innerHTML = count ? html : '<p class="panel muted center">No sentences found.</p>';
  };

  const input = /** @type {HTMLInputElement} */ (root.querySelector('#q'));
  input.addEventListener('input', () => {
    query = input.value;
    update();
  });
  const select = /** @type {HTMLSelectElement} */ (root.querySelector('#unit'));
  select.addEventListener('change', () => {
    unitFilter = select.value;
    update();
  });
  update();
  return 'Phrases';
}
