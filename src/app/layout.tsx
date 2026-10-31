import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PedalBook — 내 사운드의 자리',
  description: '실제 규격으로 페달보드를 배치하고, 중고 매물을 찾아 나만의 예산을 계획하세요.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
