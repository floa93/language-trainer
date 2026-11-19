// @ts-check
// The learning path: every stage (unit) is a banner followed by its lessons as a winding path of nodes.
import * as progress from '../progress.js';
import { esc } from '../util.js';

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** Horizontal offsets (in node widths) that make the path wind left and right. */
const WAVE = [0, 0.55, 0.9, 0.55, 0, -0.55, -0.9, -0.55];

/** @param {HTMLElement} root @param {import('../data.js').Course} data */
export function render(root, data) {
  const current = progress.currentLesson(data);
  const goal = progress.getSettings().dailyGoal;
  const today = progress.xpToday();
  const pct = Math.min(100, Math.round((today / goal) * 100));

  const units = data.units
    .map((unit) => {
      const done = unit.lessons.filter((l) => progress.isCompleted(l.id)).length;
      const unitOpen = progress.isUnlocked(unit.lessons[0], data);
      const nodes = unit.lessons
        .map((l, i) => {
          const completed = progress.isCompleted(l.id);
          const open = progress.isUnlocked(l, data);
          const isCurrent = current?.id === l.id;
          const state = isCurrent ? 'current' : completed ? 'done' : open ? 'open' : 'locked';
          const icon = completed && !isCurrent ? CHECK : open ? STAR : LOCK;
          const offset = WAVE[i % WAVE.length];
          const label = `${l.title}${completed ? ' – completed' : open ? '' : ' – locked'}`;
          const inner = `<span class="node-btn" aria-hidden="true">${icon}</span><span class="node-title">${esc(l.title)}</span>`;
          return `<li class="node node-${state}" style="--x:${offset}">${
            open
              ? `<a href="#/lesson/${encodeURIComponent(l.id)}" aria-label="${esc(label)}"${isCurrent ? ' id="current"' : ''}>${isCurrent ? '<span class="node-start">Start</span>' : ''}${inner}</a>`
              : `<span role="img" aria-label="${esc(label)}">${inner}</span>`
          }</li>`;
        })
        .join('');
      return `<section class="unit${unitOpen ? '' : ' unit-locked'}" style="--unit: var(--unit-${unit.index % 5})">
        <header class="unit-banner">
          <p class="unit-kicker">Stage ${unit.index + 1} · ${done} / ${unit.lessons.length} lessons</p>
          <h2 class="unit-title">${esc(unit.title)}</h2>
          ${unit.description ? `<p class="unit-desc">${esc(unit.description)}</p>` : ''}
        </header>
        <ol class="path">${nodes}</ol>
      </section>`;
    })
    .join('');

  root.innerHTML = `
    <section class="goal panel" aria-label="Daily goal">
      <div class="goal-head"><strong>Daily goal</strong><span class="muted">${today} / ${goal} XP</span></div>
      <div class="bar bar-thick" role="progressbar" aria-label="Daily goal" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(today, goal)}"><span style="width:${pct}%"></span></div>
      ${
        current
          ? `<a class="btn btn-primary btn-block" href="#/lesson/${encodeURIComponent(current.id)}">${
              progress.completedCount() ? 'Continue' : 'Start learning'
            } · ${esc(current.title)}</a>`
          : `<p class="center"><strong>🎉 You finished every lesson!</strong></p><a class="btn btn-primary btn-block" href="#/practice">Practice</a>`
      }
    </section>
    ${units}
  `;

  return data.language;
}
