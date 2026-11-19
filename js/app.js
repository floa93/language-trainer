// @ts-check
// Entry point: loads the course and routes between screens using the URL hash.
// Hash routing works on GitHub Pages without any server configuration.
//
//   #/                     learning path (stages and lessons)
//   #/lesson/<id>          lesson intro
//   #/lesson/<id>/play     lesson session (full screen)
//   #/practice             practice intro
//   #/practice/play        practice session (full screen)
//   #/phrases              all sentences, searchable
//   #/settings             settings, backup, reset

import { loadData } from './data.js';
import { initSpeech } from './speech.js';
import { esc } from './util.js';
import * as progress from './progress.js';
import * as learn from './views/learn.js';
import * as lesson from './views/lesson.js';
import * as phrases from './views/phrases.js';
import * as settings from './views/settings.js';

/** @typedef {(root: HTMLElement, data: import('./data.js').Course, match: RegExpMatchArray) => string} Render */

/** @type {[RegExp, Render, string, boolean?][]} [pattern, render, tab, fullscreen] */
const routes = [
  [/^#?\/?$/, learn.render, 'learn'],
  [/^#\/lesson\/([^/]+)$/, lesson.renderIntro, 'learn'],
  [/^#\/lesson\/([^/]+)\/play$/, lesson.renderLesson, 'learn', true],
  [/^#\/practice$/, lesson.renderPracticeIntro, 'practice'],
  [/^#\/practice\/play$/, lesson.renderPractice, 'practice', true],
  [/^#\/phrases$/, phrases.render, 'phrases'],
  [/^#\/settings$/, settings.render, 'settings'],
];

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const titleEl = /** @type {HTMLElement} */ (document.getElementById('page-title'));
const statsEl = /** @type {HTMLElement} */ (document.getElementById('topbar-stats'));
const settingsLink = /** @type {HTMLAnchorElement} */ (document.querySelector('.topbar-action'));
/** Last non-settings screen, so the settings button can toggle back to it. */
let lastHash = '#/';
/** Increases with every navigation, so a slower earlier route() can't render over a later one. */
let routeId = 0;

/** Streak and XP in the top bar. */
export function updateTopbar() {
  const streak = progress.getStreak();
  statsEl.innerHTML = `<span title="Day streak" class="${streak.practicedToday ? 'lit' : ''}"><span aria-hidden="true">🔥</span> ${streak.count}<span class="visually-hidden"> day streak</span></span>
    <span title="Total XP"><span aria-hidden="true">⚡</span> ${progress.totalXp()}<span class="visually-hidden"> XP</span></span>`;
}

async function route() {
  const id = ++routeId;
  let data;
  try {
    data = await loadData();
  } catch (err) {
    if (id !== routeId) return;
    root.innerHTML = `<div class="panel center"><p><strong>Could not load the course.</strong></p>
      <p class="muted">${esc(err instanceof Error ? err.message : err)}</p>
      <button class="btn" type="button" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  if (id !== routeId) return; // the user navigated again while the course was loading

  const hash = location.hash || '#/';
  const found = routes.find(([re]) => re.test(hash));
  if (!found) {
    location.replace('#/');
    return;
  }
  const [re, render, tab, fullscreen] = found;
  const match = /** @type {RegExpMatchArray} */ (hash.match(re));

  document.querySelectorAll('.tabbar a, .topbar-action').forEach((a) => {
    const active = a.getAttribute('data-tab') === tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // Lessons run full screen, like in Duolingo: no top bar or tab bar.
  document.body.classList.toggle('fullscreen', !!fullscreen);

  // The settings button toggles: on the settings screen it leads back to where you came from.
  if (tab !== 'settings') lastHash = hash;
  settingsLink.setAttribute('href', tab === 'settings' ? lastHash : '#/settings');

  updateTopbar();
  const title = render(root, data, match);
  titleEl.textContent = title;
  document.title = `${title} · Language Trainer`;
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});
initSpeech();
route();
