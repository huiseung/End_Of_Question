// Run against an existing web dev server: node scripts/check-feedback.cjs [URL]
// All game API responses are fixtures; no DB changes or OpenAI calls.
const { chromium, expect } = require('@playwright/test');
const { VERDICT_LABELS } = require('../packages/shared/dist');
async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.playedSounds = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.playedSounds++;
        return start.apply(this, args);
      };
    });
    let verdict = 'TRUE';
    let success = false;
    let fail = false;
    const game = { gameId: 'feedback-test', caseId: 'test', title: 'Test', question: 'Mystery?',
      questionCount: 0, maxQuestions: 30, status: 'PLAYING', finalSubmissionUsed: false,
      questions: [], submissions: [] };
    await page.route('**/games/feedback-test**', async route => {
      if (!route.request().url().includes(':3001/')) return route.continue();
      if (route.request().method() === 'POST') {
        if (fail) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
        const body = route.request().postDataJSON();
        if (body.question) game.questions.push({ id: body.requestId, ...body, verdict, createdAt: new Date().toISOString() });
        else game.submissions.push({ id: body.requestId, ...body, success, missingCount: success ? 0 : 1, isFinal: false, createdAt: new Date().toISOString() });
      }
      return route.fulfill({ json: game });
    });
    await page.goto((process.argv[2] || 'http://localhost:3100') + '/games/feedback-test');
    const question = page.locator('#question');
    await expect(question).toHaveAttribute('placeholder', '질문을 입력하세요');
    await question.fill('a'.repeat(501));
    await expect(question).toHaveValue('a'.repeat(500));
    await expect(page.locator('#question-count')).toHaveText('500 / 500자');
    let sounds = 0;
    for (verdict of ['TRUE', 'FALSE', 'MIXED', 'UNKNOWN', 'INVALID']) {
      await question.fill('Question?');
      await page.locator('.question-panel button[type], .question-panel button').click();
      await expect(page.locator('.question-feedback')).toHaveText(VERDICT_LABELS[verdict]);
      await expect(question).toHaveValue('');
      if (verdict !== 'INVALID') sounds++;
      await expect.poll(() => page.evaluate(() => window.playedSounds)).toBe(sounds);
    }
    await expect(page.locator('.question-feedback')).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('.history li')).toHaveCount(5);
    for (success of [false, true]) {
      await page.locator('#answer').fill('Answer');
      await page.locator('.answer-panel form button').click();
      await expect(page.locator('#answer')).toHaveValue('');
      sounds++;
      await expect.poll(() => page.evaluate(() => window.playedSounds)).toBe(sounds);
    }
    fail = true;
    await question.fill('Failed question?');
    await page.locator('.question-panel button').click();
    await expect(page.locator('.notice.error')).toHaveText('Unavailable');
    expect(await page.evaluate(() => window.playedSounds)).toBe(sounds);
    await expect(page.locator('.question-feedback')).toHaveCount(0);
    await page.reload();
    await expect(question).toBeVisible();
    expect(await page.evaluate(() => window.playedSounds)).toBe(0);
    console.log('PASS: 500-character cap/counter, all verdicts, timed dismissal, six decoded/playable sounds, no playback on error or reload.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
