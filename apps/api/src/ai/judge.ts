import { Verdict } from '@eoq/shared';
import { Story } from './story';
export type History = { question: string; verdict: Verdict }[];
export type FactStatus = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_MENTIONED';
export abstract class Judge {
  abstract question(story: Story, history: History, question: string): Promise<Verdict>;
  abstract submission(story: Story, answer: string): Promise<{ matchedCount: number; missingCount: number }>;
}
