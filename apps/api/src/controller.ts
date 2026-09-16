import { Inject } from '@nestjs/common';
import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { GameService } from './game.service';
export type AnonymousRequest = Request & { anonymousId: string };
const uuid = z.string().uuid();
const startSchema = z.object({ caseId: uuid }).strict();
const questionSchema = z.object({ requestId: uuid, question: z.string().trim().min(1).max(500) }).strict();
const submissionSchema = z.object({ requestId: uuid, answer: z.string().trim().min(1).max(5000) }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException('요청 형식이나 입력 길이를 확인해 주세요.');
  return result.data;
}
@Controller()
export class GameController {
  constructor(@Inject(GameService) private readonly games: GameService) {}
  @Get('cases') cases(@Req() req: AnonymousRequest) { return this.games.cases(req.anonymousId); }
  @Get('cases/:caseId') case(@Req() req: AnonymousRequest, @Param('caseId') id: string) { return this.games.caseDetail(req.anonymousId, parse(uuid, id)); }
  @Post('games') start(@Req() req: AnonymousRequest, @Body() body: unknown) {
    return this.games.start(req.anonymousId, parse(startSchema, body).caseId);
  }
  @Get('games/:gameId') get(@Req() req: AnonymousRequest, @Param('gameId') id: string) { return this.games.get(req.anonymousId, parse(uuid, id)); }
  @Post('games/:gameId/questions') question(@Req() req: AnonymousRequest, @Param('gameId') id: string, @Body() body: unknown) {
    const data = parse(questionSchema, body);
    return this.games.question(req.anonymousId, parse(uuid, id), data.requestId, data.question);
  }
  @Post('games/:gameId/submissions') submission(@Req() req: AnonymousRequest, @Param('gameId') id: string, @Body() body: unknown) {
    const data = parse(submissionSchema, body);
    return this.games.submission(req.anonymousId, parse(uuid, id), data.requestId, data.answer);
  }
  @Post('games/:gameId/give-up') giveUp(@Req() req: AnonymousRequest, @Param('gameId') id: string) { return this.games.giveUp(req.anonymousId, parse(uuid, id)); }
}
