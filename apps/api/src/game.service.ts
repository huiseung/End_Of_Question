import { Inject } from '@nestjs/common';
import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, GameSession, GameStatus } from '@prisma/client';
import { PublicCase, PublicGame } from '@eoq/shared';
import { PrismaService } from './prisma.service';
import { Judge } from './ai/judge';
import { storySchema } from './ai/story';

const gameInclude = { case: true, questions: { orderBy: { createdAt: 'asc' as const } }, submissions: { orderBy: { createdAt: 'asc' as const } } };
type LoadedGame = Prisma.GameSessionGetPayload<{ include: typeof gameInclude }>;
const ended = (status: GameStatus) => ['CLEARED', 'FAILED', 'GAVE_UP'].includes(status);

@Injectable()
export class GameService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(Judge) private readonly judge: Judge) {}
  async cases(anonymousId: string): Promise<PublicCase[]> {
    const cases = await this.db.case.findMany({
      select: {
        id: true, title: true, question: true, maxQuestionCount: true,
        progress: { where: { anonymousId }, select: { cleared: true, failed: true, revealed: true, bestQuestionCount: true, attemptCount: true } },
        sessions: { where: { anonymousId, status: { in: ['PLAYING', 'FINAL_ANSWER'] } }, orderBy: { startedAt: 'desc' }, take: 1, select: { id: true } },
      }, orderBy: { createdAt: 'asc' },
    });
    return cases.map(c => ({ id: c.id, title: c.title, question: c.question, maxQuestions: c.maxQuestionCount,
      progress: c.progress[0] ?? null, activeGameId: c.sessions[0]?.id ?? null }));
  }
  async caseDetail(anonymousId: string, caseId: string) {
    const found = (await this.cases(anonymousId)).find(c => c.id === caseId);
    if (!found) throw new NotFoundException('사건을 찾을 수 없습니다.');
    return found;
  }
  async start(anonymousId: string, caseId: string) {
    return this.db.$transaction(async tx => {
      const c = await tx.case.findUnique({ where: { id: caseId } });
      if (!c) throw new NotFoundException('사건을 찾을 수 없습니다.');
      storySchema.parse(c.story);
      const game = await tx.gameSession.create({ data: { anonymousId, caseId, maxQuestionCount: c.maxQuestionCount }, include: gameInclude });
      await tx.caseProgress.upsert({
        where: { anonymousId_caseId: { anonymousId, caseId } },
        create: { anonymousId, caseId, attemptCount: 1 },
        update: { attemptCount: { increment: 1 } },
      });
      return this.publicGame(game);
    });
  }
  async get(anonymousId: string, gameId: string) {
    const game = await this.db.gameSession.findFirst({ where: { id: gameId, anonymousId }, include: gameInclude });
    if (!game) throw new NotFoundException('게임을 찾을 수 없습니다.');
    return this.publicGame(game);
  }
  // Every mutation locks the same session row, including give-up.
  // Holding the lock through AI is a deliberate MVP tradeoff: history, budget and finality stay consistent.
  private async locked<T>(anonymousId: string, gameId: string, work: (tx: Prisma.TransactionClient, game: LoadedGame) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
        const rows = await tx.$queryRaw<GameSession[]> `
          SELECT * FROM "GameSession" WHERE id = ${gameId}::uuid AND "anonymousId" = ${anonymousId}::uuid FOR UPDATE
        `;
        if (!rows.length) throw new NotFoundException('게임을 찾을 수 없습니다.');
        const game = await tx.gameSession.findUniqueOrThrow({ where: { id: gameId }, include: gameInclude });
        return work(tx, game);
      }, { timeout: 40000, maxWait: 5000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          (['P2028', 'P2034'].includes(error.code) || (error.code === 'P2010' && error.meta?.code === '55P03')))
        throw new ServiceUnavailableException('다른 요청을 처리 중입니다. 같은 요청으로 다시 시도해 주세요.');
      throw error;
    }
  }
  private publicGame(game: LoadedGame): PublicGame {
    // Allowlist only. Never serialize a Prisma entity directly.
    return {
      gameId: game.id, caseId: game.caseId, title: game.case.title, question: game.case.question,
      questionCount: game.questionCount, maxQuestions: game.maxQuestionCount, status: game.status,
      finalSubmissionUsed: game.finalSubmissionUsed,
      questions: game.questions.map(q => ({ id: q.id, requestId: q.requestId, question: q.question, verdict: q.verdict, createdAt: q.createdAt.toISOString() })),
      submissions: game.submissions.map(s => ({ id: s.id, requestId: s.requestId, answer: s.answer,
        missingCount: s.missingCount, success: s.success, isFinal: s.isFinal, createdAt: s.createdAt.toISOString() })),
      ...(ended(game.status) ? { truth: storySchema.parse(game.case.story).truth } : {}),
    };
  }
  private async view(tx: Prisma.TransactionClient, id: string) {
    return this.publicGame(await tx.gameSession.findUniqueOrThrow({ where: { id }, include: gameInclude }));
  }
  async question(anonymousId: string, gameId: string, requestId: string, question: string) {
    return this.locked(anonymousId, gameId, async (tx, game) => {
      const previous = game.questions.find(q => q.requestId === requestId);
      if (previous) {
        if (previous.question !== question) throw new ConflictException('같은 requestId에 다른 질문을 사용할 수 없습니다.');
        return this.publicGame(game);
      }
      if (game.status !== 'PLAYING' || game.questionCount >= game.maxQuestionCount)
        throw new ConflictException('더 이상 질문할 수 없습니다.');
      const verdict = await this.judge.question(storySchema.parse(game.case.story), game.questions.map(q => ({ question: q.question, verdict: q.verdict })), question);
      const changed = await tx.$executeRaw`
        UPDATE "GameSession"
        SET "questionCount" = "questionCount" + 1,
            status = CASE WHEN "questionCount" + 1 >= "maxQuestionCount" THEN 'FINAL_ANSWER'::"GameStatus" ELSE status END
        WHERE id = ${gameId}::uuid AND status = 'PLAYING' AND "questionCount" < "maxQuestionCount"
      `;
      if (changed !== 1) throw new ConflictException('질문 기회를 모두 사용했습니다.');
      await tx.question.create({ data: { sessionId: gameId, requestId, question, verdict } });
      return this.view(tx, gameId);
    });
  }
  async submission(anonymousId: string, gameId: string, requestId: string, answer: string) {
    return this.locked(anonymousId, gameId, async (tx, game) => {
      const previous = game.submissions.find(s => s.requestId === requestId);
      if (previous) {
        if (previous.answer !== answer) throw new ConflictException('같은 requestId에 다른 답안을 사용할 수 없습니다.');
        return this.publicGame(game);
      }
      if (ended(game.status) || game.finalSubmissionUsed) throw new ConflictException('더 이상 답안을 제출할 수 없습니다.');
      const isFinal = game.status === 'FINAL_ANSWER';
      const score = await this.judge.submission(storySchema.parse(game.case.story), answer);
      const success = score.missingCount === 0;
      const count = success || isFinal ? game.questionCount : Math.min(game.questionCount + 5, game.maxQuestionCount);
      const status: GameStatus = success ? 'CLEARED' : isFinal ? 'FAILED' : count >= game.maxQuestionCount ? 'FINAL_ANSWER' : 'PLAYING';
      await tx.submission.create({ data: { sessionId: gameId, requestId, answer, ...score, success, isFinal } });
      await tx.gameSession.update({ where: { id: gameId }, data: { questionCount: count, status,
        finalSubmissionUsed: isFinal, completedAt: ended(status) ? new Date() : null } });
      if (ended(status)) await this.recordEnd(tx, game, status, count);
      return this.view(tx, gameId);
    });
  }
  async giveUp(anonymousId: string, gameId: string) {
    return this.locked(anonymousId, gameId, async (tx, game) => {
      if (game.status === 'GAVE_UP') return this.publicGame(game);
      if (ended(game.status)) throw new ConflictException('이미 종료된 게임입니다.');
      await tx.gameSession.update({ where: { id: gameId }, data: { status: 'GAVE_UP', completedAt: new Date() } });
      await this.recordEnd(tx, game, 'GAVE_UP', game.questionCount);
      return this.view(tx, gameId);
    });
  }
  private async recordEnd(tx: Prisma.TransactionClient, game: GameSession, status: GameStatus, count: number) {
    // One atomic UPDATE keeps cumulative flags/best score safe across simultaneous attempts.
    await tx.$executeRaw`
      UPDATE "CaseProgress" SET
        cleared = cleared OR ${status === 'CLEARED'},
        failed = failed OR ${status === 'FAILED'},
        revealed = true,
        "bestQuestionCount" = CASE WHEN ${status === 'CLEARED'}
          THEN LEAST(COALESCE("bestQuestionCount", ${count}), ${count}) ELSE "bestQuestionCount" END
      WHERE "anonymousId" = ${game.anonymousId}::uuid AND "caseId" = ${game.caseId}::uuid
    `;
  }
}
