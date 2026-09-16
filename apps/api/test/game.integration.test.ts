import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { GameService } from '../src/game.service';
import { Judge } from '../src/ai/judge';
import { GameController } from '../src/controller';
import { configure } from '../src/bootstrap';

const db = new PrismaService();
const fakeJudge = { question: vi.fn(), submission: vi.fn() };
const service = new GameService(db, fakeJudge);
const caseId = randomUUID();
const owner = randomUUID();
const truth = 'INTEGRATION_SECRET_조난당한_남자의_진상';
let gameId: string;
let app: INestApplication;
let base: string;
@Module({ controllers: [GameController], providers: [
  { provide: PrismaService, useValue: db }, GameService, { provide: Judge, useValue: fakeJudge },
] })
class TestModule {}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Integration tests need DATABASE_URL pointing to a local PostgreSQL database.');
  await db.$connect();
  await db.case.create({ data: { id: caseId, title: '통합 테스트 사건', question: '왜 그랬을까요?', story: {
    truth, facts: ['조난당했다.'], requiredFacts: [{ code: 'SHIPWRECK', description: '조난당했다.' }],
  } } });
  app = await NestFactory.create(TestModule, { logger: false, bodyParser: false });
  configure(app);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
}, 30000);
beforeEach(async () => {
  vi.resetAllMocks();
  fakeJudge.question.mockResolvedValue('TRUE');
  fakeJudge.submission.mockResolvedValue({ matchedCount: 0, missingCount: 1 });
  gameId = (await service.start(owner, caseId)).gameId;
});
afterAll(async () => {
  if (app) await app.close();
  // Only delete rows owned by this test's randomly generated case.
  await db.gameSession.deleteMany({ where: { caseId } });
  await db.caseProgress.deleteMany({ where: { caseId } });
  await db.case.deleteMany({ where: { id: caseId } });
  await db.$disconnect();
});
async function setCount(count: number) {
  await db.gameSession.update({ where: { id: gameId }, data: { questionCount: count, status: count === 30 ? 'FINAL_ANSWER' : 'PLAYING' } });
}
const ask = (id = randomUUID(), text = '조난당했나요?') => service.question(owner, gameId, id, text);
const submit = (id = randomUUID(), text = '나의 추리') => service.submission(owner, gameId, id, text);

describe('PostgreSQL game rules', () => {
  it('starts without calling AI and never reveals private data in public DTOs', async () => {
    const game = await service.get(owner, gameId);
    expect(game.questionCount).toBe(0);
    expect(game.status).toBe('PLAYING');
    expect(fakeJudge.question).not.toHaveBeenCalled();
    for (const dto of [game, await service.cases(owner), await service.caseDetail(owner, caseId)]) {
      expect(JSON.stringify(dto)).not.toContain(truth);
      expect(JSON.stringify(dto)).not.toMatch(/requiredFacts|"facts"|"story"/);
    }
  });
  it.each(['TRUE', 'FALSE', 'UNKNOWN', 'MIXED', 'INVALID'])('increments for %s and includes complete Q&A context', async verdict => {
    fakeJudge.question.mockResolvedValue(verdict);
    expect((await ask()).questionCount).toBe(1);
    await ask();
    expect(fakeJudge.question.mock.calls[1][1]).toEqual([{ question: '조난당했나요?', verdict }]);
  });
  it.each(['timeout', '429', '500', 'invalid schema'])('does not consume a question on AI %s', async reason => {
    fakeJudge.question.mockRejectedValueOnce(new Error(reason));
    const id = randomUUID();
    await expect(ask(id)).rejects.toThrow(reason);
    expect((await service.get(owner, gameId)).questionCount).toBe(0);
    expect(await db.question.count({ where: { sessionId: gameId } })).toBe(0);
    expect((await ask(id)).questionCount).toBe(1);
  });
  it('deduplicates concurrent same requestId and rejects changed payload', async () => {
    const id = randomUUID();
    const games = await Promise.all([ask(id), ask(id)]);
    expect(games.map(g => g.questionCount)).toEqual([1, 1]);
    expect(fakeJudge.question).toHaveBeenCalledTimes(1);
    await expect(ask(id, '다른 질문')).rejects.toThrow();
  });
  it('serializes different requests and supplies updated history', async () => {
    await Promise.all([ask(), ask()]);
    expect((await service.get(owner, gameId)).questionCount).toBe(2);
    expect(fakeJudge.question.mock.calls[1][1]).toHaveLength(1);
  });
  it('allows only one concurrent question at 29 and transitions to FINAL_ANSWER', async () => {
    await setCount(29);
    const results = await Promise.allSettled([ask(), ask()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const game = await service.get(owner, gameId);
    expect(game.questionCount).toBe(30);
    expect(game.status).toBe('FINAL_ANSWER');
    expect(game).not.toHaveProperty('truth');
    await expect(ask()).rejects.toThrow();
  });
  it('penalizes early wrong answers +5 and deduplicates retries', async () => {
    await setCount(12);
    const id = randomUUID();
    expect((await submit(id)).questionCount).toBe(17);
    expect((await submit(id)).questionCount).toBe(17);
    expect(fakeJudge.submission).toHaveBeenCalledTimes(1);
    await expect(submit(id, '다른 답안')).rejects.toThrow();
  });
  it('caps penalty and still offers exactly one final attempt', async () => {
    await setCount(27);
    const game = await submit();
    expect(game.questionCount).toBe(30);
    expect(game.status).toBe('FINAL_ANSWER');
    expect(game.finalSubmissionUsed).toBe(false);
    expect((await submit()).status).toBe('FAILED');
  });
  it('AI failure does not consume final attempt or penalty', async () => {
    await setCount(30);
    fakeJudge.submission.mockRejectedValueOnce(new Error('timeout'));
    const id = randomUUID();
    await expect(submit(id)).rejects.toThrow('timeout');
    expect((await service.get(owner, gameId)).finalSubmissionUsed).toBe(false);
    expect((await submit(id)).status).toBe('FAILED');
  });
  it.each([true, false])('permits one final submission: success=%s, replay safe after terminal state', async success => {
    await setCount(30);
    fakeJudge.submission.mockResolvedValue({ matchedCount: success ? 1 : 0, missingCount: success ? 0 : 1 });
    const id = randomUUID();
    const game = await submit(id);
    expect(game.status).toBe(success ? 'CLEARED' : 'FAILED');
    expect(game.truth).toBe(truth);
    expect(game.questionCount).toBe(30);
    expect(game.finalSubmissionUsed).toBe(true);
    expect((await submit(id)).status).toBe(game.status);
    await expect(submit()).rejects.toThrow();
    await expect(ask()).rejects.toThrow();
  });
  it('blocks a concurrent second final submission at database transaction level', async () => {
    await setCount(30);
    const results = await Promise.allSettled([submit(), submit()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(fakeJudge.submission).toHaveBeenCalledTimes(1);
    expect(await db.submission.count({ where: { sessionId: gameId, isFinal: true } })).toBe(1);
  });
  it('clears early and records reveal and best question count', async () => {
    await setCount(2);
    fakeJudge.submission.mockResolvedValue({ matchedCount: 1, missingCount: 0 });
    expect((await submit()).status).toBe('CLEARED');
    const progress = await db.caseProgress.findUniqueOrThrow({ where: { anonymousId_caseId: { anonymousId: owner, caseId } } });
    expect(progress.cleared).toBe(true);
    expect(progress.revealed).toBe(true);
    expect(progress.bestQuestionCount).toBe(2);
  });
  it('give-up reveals truth and prevents future questions or answers', async () => {
    expect((await service.giveUp(owner, gameId)).truth).toBe(truth);
    expect((await service.giveUp(owner, gameId)).status).toBe('GAVE_UP');
    await expect(ask()).rejects.toThrow();
    await expect(submit()).rejects.toThrow();
    const replay = await service.start(owner, caseId);
    expect(replay.status).toBe('PLAYING');
    expect(replay).not.toHaveProperty('truth');
    expect((await service.caseDetail(owner, caseId)).progress?.revealed).toBe(true);
  });
  it('serializes give-up against an in-flight question', async () => {
    fakeJudge.question.mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 80)); return 'TRUE'; });
    const results = await Promise.allSettled([ask(), service.giveUp(owner, gameId)]);
    expect(results[1].status).toBe('fulfilled');
    expect((await service.get(owner, gameId)).status).toBe('GAVE_UP');
    await expect(ask()).rejects.toThrow();
  });
  it('rejects every session endpoint for another anonymous user', async () => {
    const stranger = randomUUID();
    await expect(service.get(stranger, gameId)).rejects.toThrow();
    await expect(service.question(stranger, gameId, randomUUID(), '질문')).rejects.toThrow();
    await expect(service.submission(stranger, gameId, randomUUID(), '답안')).rejects.toThrow();
    await expect(service.giveUp(stranger, gameId)).rejects.toThrow();
  });
  it('database prevents question budget overflow and duplicate final rows', async () => {
    await expect(db.gameSession.update({ where: { id: gameId }, data: { questionCount: 31 } })).rejects.toThrow();
    await setCount(30);
    await submit();
    await expect(db.submission.create({ data: { sessionId: gameId, requestId: randomUUID(), answer: '중복', matchedCount: 0, missingCount: 1, success: false, isFinal: true } })).rejects.toThrow();
  });
});
describe('HTTP boundary', () => {
  it('issues HttpOnly SameSite cookie, credentials CORS, and only public case fields', async () => {
    const res = await fetch(base + '/cases', { headers: { Origin: 'http://localhost:3000' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    expect(res.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toContain(truth);
  });
  it('rejects foreign origin, invalid UUID and anonymousId in body', async () => {
    const headers = { 'Content-Type': 'application/json', Cookie: 'eoq_anonymous=' + owner };
    expect((await fetch(base + '/games', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: JSON.stringify({ caseId }) })).status).toBe(403);
    expect((await fetch(base + '/games', { method: 'POST', headers, body: JSON.stringify({ caseId, anonymousId: owner }) })).status).toBe(400);
    expect((await fetch(base + '/games/not-uuid', { headers })).status).toBe(400);
    expect((await fetch(base + '/games/' + gameId, { headers: { Cookie: 'eoq_anonymous=' + randomUUID() } })).status).toBe(404);
  });
  it('runs cookie-authenticated HTTP game flow with separate question and submission requests', async () => {
    const headers = { 'Content-Type': 'application/json', Cookie: 'eoq_anonymous=' + owner };
    const question = await fetch(base + '/games/' + gameId + '/questions', { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), question: '조난당했나요?' }) });
    expect(question.status).toBe(201);
    expect((await question.json()).questionCount).toBe(1);
    const answer = await fetch(base + '/games/' + gameId + '/submissions', { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), answer: '추리' }) });
    expect(answer.status).toBe(201);
    expect((await answer.json()).questionCount).toBe(6);
  });
});
