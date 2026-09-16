'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PublicGame, STATUS_LABELS, VERDICT_LABELS } from '@eoq/shared';
import { api } from '../lib/api';
import { useVerdictAudio, QUESTION_SOUNDS } from '../lib/verdict-audio';
const MAX_QUESTION_LENGTH = 500;
type Pending = { kind: 'questions' | 'submissions'; text: string; requestId: string };
export function Game({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<PublicGame | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; text: string; duration: number } | null>(null);
  const { prepareAudio, playAudio } = useVerdictAudio();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), feedback.duration);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const gate = useRef(false);
  const pending = useRef<Pending | null>(null);
  const storageKey = 'eoq-pending-' + gameId;
  async function load() {
    setError('');
    try { setGame(await api<PublicGame>('/games/' + gameId)); }
    catch (e) { setError(e instanceof Error ? e.message : '게임을 불러오지 못했습니다.'); }
  }
  useEffect(() => {
    void load();
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Pending | null;
      if (stored && ['questions', 'submissions'].includes(stored.kind) && typeof stored.text === 'string' && typeof stored.requestId === 'string') {
        pending.current = stored;
        if (stored.kind === 'questions') setQuestion(stored.text); else setAnswer(stored.text);
      }
    } catch { /* Private browsing may disable storage. */ }
    // Each route owns an independent game and retry key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
  async function submit(kind: Pending['kind']) {
    const text = (kind === 'questions' ? question : answer).trim();
    if (gate.current || !text || (kind === 'questions' && question.length > MAX_QUESTION_LENGTH)) return;
    prepareAudio();
    setFeedback(null);
    gate.current = true; setBusy(true); setError('');
    const old = pending.current;
    const request = old?.kind === kind && old.text === text ? old : { kind, text, requestId: crypto.randomUUID() };
    pending.current = request;
    try { sessionStorage.setItem(storageKey, JSON.stringify(request)); } catch {}
    try {
      const updated = await api<PublicGame>('/games/' + gameId + '/' + kind,
        kind === 'questions' ? { requestId: request.requestId, question: text } : { requestId: request.requestId, answer: text });
      setGame(updated);
      const judgedQuestion = updated.questions.find(q => q.requestId === request.requestId);
      const judgedAnswer = updated.submissions.find(s => s.requestId === request.requestId);
      if (kind === 'questions' && judgedQuestion) {
        const duration = await playAudio(QUESTION_SOUNDS[judgedQuestion.verdict]);
        setFeedback({ id: request.requestId, text: VERDICT_LABELS[judgedQuestion.verdict], duration });
      } else if (kind === 'submissions' && judgedAnswer) {
        await playAudio(judgedAnswer.success ? 'correct_voice.mp3' : 'incorrect_voice.mp3');
      }
      if (kind === 'questions') setQuestion(''); else setAnswer('');
      pending.current = null;
      try { sessionStorage.removeItem(storageKey); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결이 끊겼습니다. 같은 내용으로 다시 제출하면 중복 차감되지 않습니다.');
    } finally { gate.current = false; setBusy(false); }
  }
  async function giveUp() {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError('');
    try { setGame(await api<PublicGame>('/games/' + gameId + '/give-up', {})); setConfirmGiveUp(false); }
    catch (e) { setError(e instanceof Error ? e.message : '요청에 실패했습니다.'); }
    finally { gate.current = false; setBusy(false); }
  }
  if (!game) return <main className="game-shell"><Link href="/" className="back">← 사건 목록</Link>{error ? <div role="alert" className="notice error">{error} <button onClick={load} className="text-button">다시 시도</button></div> : <p role="status" className="empty">사건 파일을 여는 중입니다…</p>}</main>;
  const final = game.status === 'FINAL_ANSWER';
  const ended = ['CLEARED', 'FAILED', 'GAVE_UP'].includes(game.status);
  const latest = game.submissions.at(-1);
  return <main className="game-shell"><div className="game-navigation"><Link href="/" className="back">← 사건 목록</Link><span className="badge accent">{STATUS_LABELS[game.status]}</span></div><div className="game-layout"><div className="investigation"><section className="story-panel"><p className="eyebrow">THE MYSTERY</p><h1>{game.title}</h1><p className="story-question">{game.question}</p><div className="budget"><span>사용한 질문 <strong>{game.questionCount}<small> / {game.maxQuestions}</small></strong></span><span className="muted">{game.maxQuestions - game.questionCount}회 남음</span></div><progress value={game.questionCount} max={game.maxQuestions} aria-label="사용한 질문 횟수"/></section>
    {error && <div role="alert" className="notice error">{error}</div>}
    {final && <div className="notice" role="status"><strong>마지막 추리의 시간입니다.</strong><p>질문 기회를 모두 사용했습니다. 이제 사건의 진상을 한 번 제출할 수 있습니다.</p></div>}
    {ended && <section className="result-panel" aria-live="polite"><p className="eyebrow">CASE CLOSED</p><h2>{game.status === 'CLEARED' ? '추리에 성공했습니다!' : game.status === 'FAILED' ? '추리에 실패했습니다.' : '사건의 진상을 확인했습니다.'}</h2><p>{game.status === 'CLEARED' ? '질문 ' + game.questionCount + '회 (패널티 포함) 만에 진상을 밝혔습니다.' : game.status === 'FAILED' ? '놓친 핵심 사실: ' + latest?.missingCount + '개' : '새로운 사건에서 다시 추리해 보세요.'}</p><h3>사건의 진상</h3><p className="truth">{game.truth}</p><Link className="button primary" href="/">사건 목록으로 ↗</Link></section>}
    <section className="question-panel"><div className="section-heading"><h2>질문하기</h2><span className="step-tag">01 / QUESTION</span></div><p className="muted">예 또는 아니오로 대답할 수 있는 질문을 입력하세요.</p><div className="question-feedback-slot" aria-live="polite" aria-atomic="true">{feedback && <div key={feedback.id} className="question-feedback" style={{ animationDuration: feedback.duration + 'ms' }}>{feedback.text}</div>}</div><form autoComplete="off" onSubmit={e => { e.preventDefault(); void submit('questions'); }}><label className="sr-only" htmlFor="question">질문</label><div className="question-input"><input autoComplete="off" id="question" aria-describedby="question-count" maxLength={MAX_QUESTION_LENGTH} value={question} onChange={e => setQuestion(e.target.value)} disabled={busy || final || ended} placeholder={final ? '질문 기회를 모두 사용했습니다' : '질문을 입력하세요'}/><button className="button primary" disabled={busy || final || ended || !question.trim()}>{busy ? '처리 중…' : '질문 제출'}</button></div><span id="question-count" className="char-count">{question.length} / {MAX_QUESTION_LENGTH}자</span></form></section>
    <section className="history-panel"><div className="section-heading"><h2>추리 노트</h2><span className="muted">{game.questions.length}개의 질문</span></div>{!game.questions.length && <div className="empty"><span className="note-icon" aria-hidden="true">✎</span><p>아직 남겨진 질문이 없습니다.<br/>첫 번째 질문으로 사건의 실마리를 찾아보세요.</p></div>}<ol className="history">{game.questions.map((q, i) => <li key={q.id}><span className="question-number">{String(i + 1).padStart(2, '0')}</span><div><p>{q.question}</p><span className={'verdict ' + q.verdict.toLowerCase()}>{VERDICT_LABELS[q.verdict]}</span></div></li>)}</ol></section></div>
    <aside className={'answer-panel ' + (final ? 'final-answer' : '')}><p className="step-tag">02 / THE TRUTH</p><h2>{final ? '최종 답안' : '진상을 알아내셨나요?'}</h2><p className="muted">{final ? '마지막 기회입니다. 지금까지의 단서를 모아 사건의 진상을 작성하세요.' : '단서들을 연결해 당신의 추리를 완성하세요. 핵심 사실이 모두 담겨야 정답입니다.'}</p><form autoComplete="off" onSubmit={e => { e.preventDefault(); void submit('submissions'); }}><label htmlFor="answer">당신의 추리</label><textarea autoComplete="off" id="answer" rows={9} maxLength={5000} value={answer} onChange={e => setAnswer(e.target.value)} disabled={busy || ended} placeholder="사건의 진상을 자신의 문장으로 작성해 주세요."/><span className="char-count">{answer.length} / 5,000</span><button className="button primary full" disabled={busy || ended || !answer.trim()}>{busy ? '판정 중…' : final ? '최종 답안 제출' : '정답 제출'}</button></form>
    {!ended && <p className="penalty">{final ? '최종 답안이 틀리면 게임이 종료됩니다.' : '오답 제출 시 질문 기회가 5회 차감됩니다.'}</p>}
    {latest && !latest.success && !ended && <div className="notice" role="status">중요한 사실 {latest.missingCount}개가 빠져 있습니다.</div>}
    {game.submissions.length > 0 && <details className="submission-history"><summary>이전 답안 {game.submissions.length}개</summary>{game.submissions.map((s, i) => <div key={s.id}><strong>답안 {i + 1} · {s.success ? '정답' : '빠진 사실 ' + s.missingCount + '개'}</strong><p>{s.answer}</p></div>)}</details>}
    {!ended && <div className="give-up">{confirmGiveUp ? <div><p>진상을 확인하면 이번 게임이 종료됩니다.</p><div className="actions"><button className="button danger" disabled={busy} onClick={giveUp}>포기하고 진상 보기</button><button className="text-button" disabled={busy} onClick={() => setConfirmGiveUp(false)}>계속 추리</button></div></div> : <button className="text-button" disabled={busy} onClick={() => setConfirmGiveUp(true)}>포기하고 진상 보기</button>}</div>}
    </aside></div></main>;
}
