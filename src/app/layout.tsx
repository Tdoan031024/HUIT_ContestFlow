import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/notification-provider';
import './globals.css';
import './workspace.css';

export const metadata: Metadata = {
  title: 'HUIT ContestFlow | Quản lý cuộc thi',
  description: 'HUIT ContestFlow — nền tảng quản lý cuộc thi và chấm điểm trực tuyến.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#102f48',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body><NotificationProvider>{children}</NotificationProvider></body>
    </html>
  );
}
