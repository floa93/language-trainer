// End-to-end tests of the whole app in a real browser.
import { test, expect, units, answer, playToEnd } from './helpers.js';

const lessonCount = units.reduce((n, u) => n + u.lessons.length, 0);

/** Mark the first lesson as done, as if it had been played. */
async function seedFirstLessonDone(page) {
  await page.goto('/');
  await page.evaluate(() => {
    const t = new Date();
    const day = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    localStorage.setItem('lt.progress.v1', JSON.stringify({ lessons: { 'u1-l01': { completed: 1, best: 100, last: day } }, xp: 15, daily: { [day]: 15 } }));
  });
  await page.reload();
}

test.describe('learning path', () => {
  test('shows every stage and lesson, only the first lesson open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.unit')).toHaveCount(units.length);
    await expect(page.locator('.node')).toHaveCount(lessonCount);
    await expect(page.locator('.node-current')).toHaveCount(1);
    await expect(page.locator('.node-current .node-title')).toHaveText(units[0].lessons[0].title);
    await expect(page.locator('.node-locked')).toHaveCount(lessonCount - 1);
    await expect(page.getByRole('link', { name: /Start learning/ })).toBeVisible();
  });

  test('a locked lesson cannot be played', async ({ page }) => {
    await page.goto('/#/lesson/u1-l03/play');
    await expect(page).toHaveURL(/#\/lesson\/u1-l03$/);
    await expect(page.getByText('Finish the previous lesson')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start lesson' })).toHaveCount(0);
  });

  test('lesson intro shows the tip and the sentences', async ({ page }) => {
    await page.goto('/');
    await page.locator('.node-current a').click();
    await expect(page.locator('.intro-title')).toHaveText(units[0].lessons[0].title);
    await expect(page.locator('.tip')).toContainText(units[0].lessons[0].tip.slice(0, 20));
    await page.getByText('Sentences in this lesson').click();
    await expect(page.locator('.preview .phrase')).toHaveCount(units[0].lessons[0].items.length);
  });
});

test.describe('lesson', () => {
  test('a perfect lesson gives 15 XP, starts the streak and unlocks the next lesson', async ({ page }) => {
    await page.goto('/#/lesson/u1-l01');
    await page.getByRole('link', { name: 'Start lesson' }).click();
    await expect(page.locator('.tabbar')).toBeHidden(); // full screen

    const log = await playToEnd(page);
    expect(log).toHaveLength(units[0].lessons[0].items.length);
    expect(log.every((a) => a.ok)).toBe(true);
    // With the fake voice and recognizer, every exercise type shows up.
    expect(new Set(log.map((a) => a.type))).toEqual(new Set(['choice', 'build-en', 'build-vi', 'listen', 'speak']));

    await expect(page.locator('.done-title')).toHaveText('Lesson complete!');
    await expect(page.locator('.stat-xp .stat-num')).toHaveText('+15');
    await expect(page.locator('.stat-acc .stat-num')).toHaveText('100%');
    await expect(page.getByText('1-day streak!')).toBeVisible();

    await page.getByRole('link', { name: 'Back to the learning path' }).click();
    await expect(page.locator('.node-done')).toHaveCount(1);
    await expect(page.locator('.node-current .node-title')).toHaveText(units[0].lessons[1].title);
    await expect(page.locator('#topbar-stats')).toContainText('15');
    await expect(page.locator('.goal-head')).toContainText('15 / 30 XP');
  });

  test('a wrong answer comes back at the end and lowers the accuracy', async ({ page }) => {
    await page.goto('/#/lesson/u1-l01/play');
    const log = await playToEnd(page, { wrongFirst: true });
    const n = units[0].lessons[0].items.length;
    expect(log[0].ok).toBe(false);
    // Choice and tile exercises are asked again; a failed speaking attempt is retried on the spot.
    expect(log.length).toBe(log[0].type === 'speak' ? n : n + 1);
    await expect(page.locator('.stat-xp .stat-num')).toHaveText('+10');
    await expect(page.locator('.stat-acc .stat-num')).toHaveText(`${Math.round(((n - 1) / n) * 100)}%`);
  });

  test('"Can’t speak now" turns speaking exercises off for the rest of the lesson', async ({ page }) => {
    await page.goto('/#/lesson/u1-l01/play');
    const log = [];
    let skipped = false;
    while (!(await page.locator('.done').isVisible())) {
      const isSpeak = await page.locator('#mic').isVisible();
      if (isSpeak) expect(skipped, 'no speaking exercise after skipping').toBe(false);
      const a = await answer(page, { skipSpeaking: true });
      if (a.type === 'speak') skipped = true;
      log.push(a);
    }
    expect(skipped).toBe(true);
    expect(log.filter((a) => a.type === 'speak')).toHaveLength(1);
  });

  test('the progress bar moves and the quit button leaves the lesson', async ({ page }) => {
    await page.goto('/#/lesson/u1-l01/play');
    const bar = page.locator('.session-head [role="progressbar"]');
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await answer(page);
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await page.getByRole('link', { name: 'Quit lesson' }).click();
    await expect(page).toHaveURL(/#\/lesson\/u1-l01$/);
    await expect(page.locator('.tabbar')).toBeVisible();
  });

  test('the Vietnamese sentence is read aloud', async ({ page }) => {
    await page.goto('/#/lesson/u1-l01/play');
    for (let i = 0; i < 10 && !(await page.locator('.listen-big').isVisible()); i++) await answer(page);
    const listen = page.locator('.listen-big');
    await expect(listen).toBeVisible();
    const sentence = await listen.getAttribute('data-speak');
    await expect.poll(() => page.evaluate(() => window.__spoken)).toContain(sentence);
  });

  test('Enter checks and continues on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard shortcut is for desktop');
    await page.goto('/#/lesson/u1-l01/play');
    // The first exercise is a multiple choice; pick with the number key, then Enter, Enter.
    await expect(page.locator('.options')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('[data-option="0"]')).toHaveClass(/selected/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#continue')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('.session-head [role="progressbar"]')).toHaveAttribute('aria-valuenow', /^[01]$/);
    await expect(page.locator('#continue')).toHaveCount(0);
  });
});

test.describe('practice', () => {
  test('needs a completed lesson first', async ({ page }) => {
    await page.goto('/#/practice');
    await expect(page.getByText('Complete your first lesson')).toBeVisible();
    await page.goto('/#/practice/play');
    await expect(page).toHaveURL(/#\/practice$/);
  });

  test('plays 10 sentences from completed lessons and adds XP', async ({ page }) => {
    await seedFirstLessonDone(page);
    await page.goto('/#/practice');
    await page.getByRole('link', { name: 'Start practice' }).click();
    await playToEnd(page);
    await expect(page.locator('.done-title')).toHaveText('Practice complete!');
    await page.getByRole('link', { name: 'Back to the learning path' }).click();
    await expect(page.locator('#topbar-stats')).toContainText('30');
    await expect(page.locator('.node-done')).toHaveCount(1);
  });
});

test.describe('phrases', () => {
  test('search ignores accents and the stage filter works', async ({ page }) => {
    await page.goto('/#/phrases');
    const total = units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l.items.length, 0), 0);
    await expect(page.locator('.phrase')).toHaveCount(total);

    await page.getByPlaceholder(/Search/).fill('ca phe');
    const hits = page.locator('.phrase .vi');
    expect(await hits.count()).toBeGreaterThan(0);
    for (const t of await hits.allTextContents()) expect(t.toLowerCase()).toContain('cà phê');

    await page.getByPlaceholder(/Search/).fill('');
    await page.locator('#unit').selectOption(units[1].id);
    await expect(page.locator('.phrase-group')).toHaveCount(units[1].lessons.length);

    await page.getByPlaceholder(/Search/).fill('zzzz');
    await expect(page.getByText('No sentences found.')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('dark theme is remembered', async ({ page }) => {
    await page.goto('/#/settings');
    await page.locator('input[name="theme"][value="dark"]').check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('"Unlock all lessons" opens every lesson', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByText('Unlock all lessons').click();
    await page.goto('/');
    await expect(page.locator('.node-locked')).toHaveCount(0);
    await page.goto('/#/lesson/u3-l10/play');
    await expect(page.locator('.exercise')).toBeVisible();
  });

  test('progress can be exported, reset and imported again', async ({ page }) => {
    await seedFirstLessonDone(page);
    await page.goto('/#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export progress/ }).click()]);
    const file = await download.path();

    await page.getByRole('button', { name: /Reset all progress/ }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await expect(page.getByText('All progress has been reset.')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('.node-done')).toHaveCount(0);

    await page.goto('/#/settings');
    await page.locator('#import').setInputFiles(file);
    await page.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByText('Imported progress for 1 lesson.')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('.node-done')).toHaveCount(1);
  });
});

test.describe('layout', () => {
  for (const hash of ['/', '/#/lesson/u1-l01/play', '/#/phrases', '/#/settings']) {
    test(`no horizontal scrolling at 360 px: ${hash}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(hash);
      await expect(page.locator('main')).not.toHaveText('Loading…');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
