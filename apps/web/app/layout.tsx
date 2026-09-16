import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: '질문의 끝 · End of Question', description: '서른 번의 질문, 하나의 진실. AI와 함께하는 상황추리 게임.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><header className="site-header"><Link href="/" className="brand"><span className="brand-mark">?</span> 질문의 끝<span className="brand-en">END OF QUESTION</span></Link><span className="header-note">당신의 질문이 진실에 닿을 때</span></header>{children}<footer>END OF QUESTION <span>질문으로 풀어가는 미스터리</span></footer></body></html>;
}
