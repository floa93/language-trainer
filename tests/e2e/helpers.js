// Shared helpers for the end-to-end tests.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), 'utf8'));
export const units = read('course.json').units.map(read);
export const allItems = units.flatMap((u) => u.lessons.flatMap((l) => l.items));

/** Same tile split as js/exercises.js. */
export const words = (text) =>
  text
    .normalize('NFC')
    .split(/\s+/)
    .map((w) => w.replace(/^[“"‘'(¿¡]+|[.,!?;:…"”’')]+$/g, ''))
    .filter(Boolean);

/**
 * Browsers in CI have no Vietnamese voice and no microphone. These fakes stand in for
 * the Web Speech API so that listening and speaking exercises can be tested:
 * - text-to-speech: a "vi-VN" voice; spoken texts are collected in window.__spoken
 * - recognition: "hears" the sentence on screen, or gibberish when window.__mumble is true
 */
function fakeSpeech() {
  const voice = { name: 'Test Vietnamese', lang: 'vi-VN', localService: true, default: true, voiceURI: 'test-vi' };
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [voice],
    speak(u) {
      window.__spoken.push(u.text);
      setTimeout(() => u.onend?.(), 0);
    },
    cancel() {},
    resume() {},
    addEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });

  class FakeRecognition {
    start() {
      setTimeout(() => {
        const sentence = document.querySelector('.speak-sentence')?.textContent || '';
        const result = [{ transcript: window.__mumble ? 'ừm ừm' : sentence }];
        result.isFinal = true;
        this.onresult?.({ results: [result] });
        this.onend?.();
      }, 30);
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
}

/** Test fixture: fake speech APIs and fail on any JavaScript error in the page. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      // Web fonts may fail to load in CI; that's not an app error.
      if (msg.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR/.test(msg.text())) errors.push(msg.text());
    });
    await page.addInitScript(fakeSpeech);
    await use(page);
    expect(errors, 'JavaScript errors in the page').toEqual([]);
  },
});
export { expect };

/** Which exercise is on screen, and which sentence it is about. */
async function current(page) {
  return page.locator('.exercise').evaluate((ex) => {
    const q = (s) => ex.querySelector(s);
    const unquote = (s) => s.replace(/^“|”$/g, '');
    if (q('.options')) return { type: 'choice', en: unquote(q('.prompt-en').textContent) };
    if (q('.speak-sentence')) return { type: 'speak', vi: q('.speak-sentence').textContent };
    if (q('.listen-big')) return { type: 'listen', vi: q('.listen-big').getAttribute('data-speak') };
    if (q('.prompt-vi')) return { type: 'build-en', vi: q('.prompt-vi').textContent };
    return { type: 'build-vi', en: unquote(q('.prompt-en').textContent) };
  });
}

/** Tap word tiles in order. */
async function tapTiles(page, list) {
  for (const w of list) {
    await page.locator('.bank button[data-in]', { hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
  }
}

/**
 * Answer the exercise on screen and press Continue.
 * @param {import('@playwright/test').Page} page
 * @param {{ wrong?: boolean, skipSpeaking?: boolean }} [opts]
 * @returns {Promise<{ type: string, ok: boolean }>}
 */
export async function answer(page, { wrong = false, skipSpeaking = false } = {}) {
  const ex = await current(page);
  const item = allItems.find((i) => (ex.vi ? i.vi === ex.vi : i.en === ex.en));
  expect(item, `sentence for ${JSON.stringify(ex)} is in the data`).toBeTruthy();

  if (ex.type === 'choice') {
    const options = page.locator('[data-option]');
    const texts = (await options.allTextContents()).map((t) => t.replace(/^\d/, ''));
    const index = texts.findIndex((t) => (wrong ? t !== item.vi : t === item.vi));
    await options.nth(index).click();
    await page.locator('#check').click();
  } else if (ex.type === 'speak') {
    if (skipSpeaking) {
      await page.locator('#skip').click();
    } else {
      if (wrong) {
        await page.evaluate(() => (window.__mumble = true));
        await page.locator('#mic').click();
        await expect(page.locator('.w-miss').first()).toBeVisible();
        await page.evaluate(() => (window.__mumble = false));
      }
      await page.locator('#mic').click(); // the fake recognizer "hears" the sentence
    }
  } else {
    const target = words(ex.type === 'build-en' ? item.en : item.vi);
    if (wrong) {
      const first = (await page.locator('.bank button[data-in]').allTextContents()).find((t) => t !== target[0]);
      await tapTiles(page, [first]);
    } else {
      await tapTiles(page, target);
    }
    await page.locator('#check').click();
  }

  const footer = page.locator('.footer');
  await expect(footer).toHaveClass(/footer-(ok|wrong)/);
  const ok = (await footer.getAttribute('class')).includes('footer-ok');
  await page.locator('#continue').click();
  return { type: ex.type, ok };
}

/**
 * Play the session on screen to the end.
 * @param {import('@playwright/test').Page} page
 * @param {{ wrongFirst?: boolean, skipSpeaking?: boolean }} [opts]
 */
export async function playToEnd(page, { wrongFirst = false, skipSpeaking = false } = {}) {
  const log = [];
  for (let i = 0; i < 40 && !(await page.locator('.done').isVisible()); i++) {
    log.push(await answer(page, { wrong: wrongFirst && i === 0, skipSpeaking }));
  }
  await expect(page.locator('.done')).toBeVisible();
  return log;
}
