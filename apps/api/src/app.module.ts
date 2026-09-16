import { Module } from '@nestjs/common';
import { GameController } from './controller';
import { GameService } from './game.service';
import { PrismaService } from './prisma.service';
import { Judge } from './ai/judge';
import { OpenAIClient, OpenAIJudge, StructuredClient } from './ai/openai-judge';
@Module({
  controllers: [GameController],
  providers: [PrismaService, GameService, { provide: StructuredClient, useClass: OpenAIClient }, { provide: Judge, useClass: OpenAIJudge }],
})
export class AppModule {}
