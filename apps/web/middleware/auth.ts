import { defineHandler, useSession, redirect, getRequestURL } from 'nitro/h3';
import { createHash } from 'node:crypto';

function sealPassword(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export default defineHandler(async (event) => {
  const webPassword = process.env['WEB_PASSWORD']?.trim();
  if (!webPassword) return;

  const { pathname } = getRequestURL(event);

  if (pathname === '/login' || pathname.startsWith('/auth/')) return;

  const session = await useSession(event, {
    name: 'ffmpeg-web-session',
    password: sealPassword(webPassword),
    cookie: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax'
    }
  });

  if (session.data['authenticated']) return;

  return redirect('/login');
});
