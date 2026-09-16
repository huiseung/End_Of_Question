import { expect, test } from '@playwright/test';
test('real API: cookie, separate inputs, failure without debit, reload, give-up and replay record', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '바다거북 수프' })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '사건 열기' }).click();
  await expect(page).toHaveURL(/\/games\//);
  await expect(page.locator('#question')).toBeVisible();
  await expect(page.locator('#answer')).toBeVisible();
  expect((await context.cookies('http://localhost:3001')).find(c => c.name === 'eoq_anonymous')?.httpOnly).toBe(true);
  await expect(page.getByRole('heading', { name: '사건의 진상', exact: true })).toHaveCount(0);
  await page.locator('#question').fill('남자는 조난당했나요?');
  await page.getByRole('button', { name: '질문 제출', exact: true }).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('OpenAI API 키');
  await expect(page.locator('progress')).toHaveAttribute('value', '0');
  await page.reload();
  await expect(page.locator('#question')).toHaveValue('남자는 조난당했나요?');
  await page.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '포기하고 진상 보기', exact: true }).click();
  await page.getByRole('button', { name: '포기하고 진상 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '사건의 진상', exact: true })).toBeVisible();
  await expect(page.locator('#question')).toBeDisabled();
  await expect(page.locator('#answer')).toBeDisabled();
  await page.getByRole('link', { name: '사건 목록으로' }).click();
  await expect(page.getByText('진상 확인한 사건')).toBeVisible();
});
test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '사건 열기' }).click();
  await expect(page.locator('#answer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
});
for (const success of [true, false]) {
  test('final answer UI: ' + (success ? 'CLEARED' : 'FAILED'), async ({ page }) => {
    const gameId = '20000000-0000-4000-8000-000000000001';
    let game: Record<string, unknown> = { gameId, caseId: 'test', title: '최종 기회 테스트', question: '무슨 일이 있었을까요?',
      questionCount: 30, maxQuestions: 30, status: 'FINAL_ANSWER', finalSubmissionUsed: false, questions: [], submissions: [] };
    let submits = 0;
    await page.route('http://localhost:3001/games/' + gameId + '**', async route => {
      if (route.request().method() === 'POST') {
        submits++;
        game = { ...game, status: success ? 'CLEARED' : 'FAILED', finalSubmissionUsed: true, truth: '종료 후에만 공개되는 테스트 진상',
          submissions: [{ id: '1', requestId: '1', answer: '추리', missingCount: success ? 0 : 2, success, isFinal: true, createdAt: new Date().toISOString() }] };
      }
      await route.fulfill({ json: game });
    });
    await page.goto('/games/' + gameId);
    await expect(page.locator('#question')).toBeDisabled();
    await expect(page.getByRole('button', { name: '질문 제출' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: '최종 답안', exact: true })).toBeVisible();
    await page.locator('#answer').fill('나의 마지막 추리');
    await page.getByRole('button', { name: '최종 답안 제출' }).click();
    await expect(page.getByRole('heading', { name: success ? '추리에 성공했습니다!' : '추리에 실패했습니다.' })).toBeVisible();
    await expect(page.getByText('종료 후에만 공개되는 테스트 진상')).toBeVisible();
    await expect(page.locator('#answer')).toBeDisabled();
    expect(submits).toBe(1);
  });
}
