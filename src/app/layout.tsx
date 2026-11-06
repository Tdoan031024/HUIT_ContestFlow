import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'HUIT ContestFlow | Quản lý cuộc thi',
  description: 'HUIT ContestFlow — nền tảng quản lý cuộc thi và chấm điểm trực tuyến.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
