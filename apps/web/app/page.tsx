'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PublicCase, PublicGame } from '@eoq/shared';
import { api } from '../lib/api';
export default function Home() {
  const router = useRouter();
  const [cases, setCases] = useState<PublicCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  async function load() {
    setLoading(true); setError('');
    try { setCases(await api<PublicCase[]>('/cases')); }
    catch (e) { setError(e instanceof Error ? e.message : '사건을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function start(caseId: string) {
    if (starting.current) return;
    starting.current = true; setBusy(true); setError('');
    try { const game = await api<PublicGame>('/games', { caseId }); router.push('/games/' + game.gameId); }
    catch (e) { setError(e instanceof Error ? e.message : '게임을 시작하지 못했습니다.'); starting.current = false; setBusy(false); }
  }
  return <main className="home"><section className="hero"><p className="eyebrow">A LATERAL THINKING GAME</p><h1>모든 사건에는<br/><span>마지막 질문이 있다.</span></h1><p className="hero-copy">평범한 이야기 뒤에 숨겨진 뜻밖의 진실.<br/>예와 아니오를 따라, 당신의 추리를 완성하세요.</p><div className="hero-meta"><span>01 사건을 읽고</span><i/><span>02 질문을 던지고</span><i/><span>03 진실을 밝히세요</span></div></section>
    <section aria-labelledby="cases-title"><div className="section-heading"><div><p className="eyebrow">THE CASE FILES</p><h2 id="cases-title">어떤 진실을 찾으시겠어요?</h2></div><span className="muted">{cases.length}개의 사건</span></div>
    {error && <div role="alert" className="notice error">{error} <button className="text-button" onClick={load}>다시 불러오기</button></div>}
    {loading ? <p role="status" className="empty">사건 파일을 불러오는 중입니다…</p> : cases.length === 0 && !error ? <p className="empty">아직 등록된 사건이 없습니다.</p> : <div className="case-grid">{cases.map((c, i) => <article className="case-card" key={c.id}><div className="case-topline"><span>CASE {String(i + 1).padStart(3, '0')}</span><span>상황추리 · {c.maxQuestions}회</span></div><div className="case-symbol" aria-hidden="true">?</div><div className="badges">
      {!c.progress && <span className="badge">미도전</span>}
      {c.activeGameId && <span className="badge accent">플레이 중</span>}
      {c.progress?.cleared && <span className="badge accent">클리어</span>}
      {c.progress?.failed && <span className="badge">실패 기록</span>}
      {c.progress?.revealed && <span className="badge">진상 확인한 사건</span>}
    </div><h3>{c.title}</h3><p className="case-question">{c.question}</p><div className="case-bottom"><span className="muted">{c.progress ? c.progress.attemptCount + '회 도전' + (c.progress.bestQuestionCount !== null ? ' · 최고 ' + c.progress.bestQuestionCount + '회' : '') : '첫 번째 추리를 시작해 보세요'}</span>{c.activeGameId ? <div className="actions"><Link className="button primary" href={'/games/' + c.activeGameId}>이어하기 ↗</Link><button disabled={busy} className="text-button" onClick={() => start(c.id)}>새로 도전</button></div> : <button className="button primary" disabled={busy} onClick={() => start(c.id)}>{busy ? '시작하는 중…' : c.progress ? '다시 도전하기 ↗' : '사건 열기 ↗'}</button>}</div></article>)}</div>}
    </section><aside className="how-to"><span className="small-mark">i</span><div><h3>질문은 신중하게, 추리는 자유롭게.</h3><p>질문마다 기회가 1회 사용됩니다. 정답 제출에 실패하면 5회가 차감되며,<br className="desktop-break"/> 모든 질문을 사용한 뒤에도 마지막 답안을 한 번 제출할 수 있습니다.</p></div></aside></main>;
}
