import { Inject } from '@nestjs/common';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { VERDICTS } from '@eoq/shared';
import { readConfig } from '../config';
import { History, Judge } from './judge';
import { Story } from './story';
import { QUESTION_RULES } from './prompts/question-judge.prompt';
import { SUBMISSION_RULES } from './prompts/submission-judge.prompt';

export abstract class StructuredClient {
  abstract parse<T>(instructions: string, user: string, schema: z.ZodType<T>, name: string): Promise<T>;
}
@Injectable()
export class OpenAIClient extends StructuredClient {
  async parse<T>(instructions: string, user: string, schema: z.ZodType<T>, name: string): Promise<T> {
    const config = readConfig();
    if (!config.OPENAI_API_KEY) throw new ServiceUnavailableException('OpenAI API 키를 설정해 주세요.');
    try {
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 25000, maxRetries: 0 });
      const response = await client.responses.parse({
        model: config.OPENAI_MODEL, store: false,
        input: [{ role: 'developer', content: instructions }, { role: 'user', content: user }],
        text: { format: zodTextFormat(schema, name) },
      });
      if (response.status !== 'completed' || !response.output_parsed) throw new Error('Unusable model response');
      return schema.parse(response.output_parsed);
    } catch {
      // Never propagate SDK errors: they may contain upstream details.
      throw new ServiceUnavailableException('AI 판정을 완료하지 못했습니다. 횟수는 차감되지 않았습니다. 다시 시도해 주세요.');
    }
  }
}
@Injectable()
export class OpenAIJudge extends Judge {
  constructor(@Inject(StructuredClient) private readonly client: StructuredClient) { super(); }
  async question(story: Story, history: History, question: string) {
    const schema = z.object({ verdict: z.enum(VERDICTS) }).strict();
    const result = await this.client.parse(
      QUESTION_RULES + '\n사건 진상:\n' + story.truth + '\n사건 facts:\n' + JSON.stringify(story.facts),
      JSON.stringify({ history, question }), schema, 'question_verdict',
    );
    return schema.parse(result).verdict;
  }
  async submission(story: Story, answer: string) {
    const codes = story.requiredFacts.map(f => f.code) as [string, ...string[]];
    const schema = z.object({ facts: z.array(z.object({
      code: z.enum(codes), status: z.enum(['SUPPORTED', 'CONTRADICTED', 'NOT_MENTIONED']),
    }).strict()) }).strict();
    const result = schema.parse(await this.client.parse(
      SUBMISSION_RULES + '\n사건 진상:\n' + story.truth + '\n사건 facts:\n' + JSON.stringify(story.facts)
        + '\nrequiredFacts:\n' + JSON.stringify(story.requiredFacts),
      JSON.stringify({ answer }), schema, 'submission_facts',
    ));
    if (result.facts.length !== codes.length || new Set(result.facts.map(f => f.code)).size !== codes.length)
      throw new ServiceUnavailableException('AI 판정이 불완전합니다. 횟수는 차감되지 않았습니다.');
    const matchedCount = result.facts.filter(f => f.status === 'SUPPORTED').length;
    return { matchedCount, missingCount: codes.length - matchedCount };
  }
}
