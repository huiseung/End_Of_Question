export const VERDICTS = ['TRUE', 'FALSE', 'UNKNOWN', 'MIXED', 'INVALID'] as const;
export type Verdict = typeof VERDICTS[number];
export const VERDICT_LABELS: Record<Verdict, string> = {
  TRUE: '맞습니다.', FALSE: '아닙니다.', UNKNOWN: '중요하지 않습니다.',
  MIXED: '그럴 수도 있습니다.', INVALID: '네 또는 아니오로 대답 가능한 질문을 주세요.',
};
export type GameStatus = 'PLAYING' | 'FINAL_ANSWER' | 'CLEARED' | 'FAILED' | 'GAVE_UP';
export const STATUS_LABELS: Record<GameStatus, string> = {
  PLAYING: '플레이 중', FINAL_ANSWER: '최종 답안 대기', CLEARED: '클리어', FAILED: '실패', GAVE_UP: '진상 확인 (포기)',
};
export interface Progress {
  cleared: boolean; failed: boolean; revealed: boolean; bestQuestionCount: number | null; attemptCount: number;
}
export interface PublicCase {
  id: string; title: string; question: string; maxQuestions: number;
  progress: Progress | null; activeGameId: string | null;
}
export interface PublicQuestion { id: string; requestId: string; question: string; verdict: Verdict; createdAt: string }
export interface PublicSubmission {
  id: string; requestId: string; answer: string; missingCount: number; success: boolean; isFinal: boolean; createdAt: string;
}
export interface PublicGame {
  gameId: string; caseId: string; title: string; question: string; questionCount: number; maxQuestions: number;
  status: GameStatus; finalSubmissionUsed: boolean; questions: PublicQuestion[]; submissions: PublicSubmission[];
  truth?: string;
}
