import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.HCF_QA_BUILD === '1' ? { distDir: '.next-qa' } : {}),
  allowedDevOrigins: ['192.168.1.116'],
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ];
    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
