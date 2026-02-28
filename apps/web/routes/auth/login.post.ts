import { defineHandler, readBody, useSession, redirect } from 'nitro/h3';
import { createHash, timingSafeEqual } from 'node:crypto';

function sealPassword(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export default defineHandler(async (event) => {
  const webPassword = process.env['WEB_PASSWORD']?.trim();
  if (!webPassword) return redirect('/');

  const body = await readBody<{ password?: string }>(event);
  const submitted = body?.password ?? '';

  const expected = Buffer.from(webPassword, 'utf8');
  const actual = Buffer.from(submitted, 'utf8');

  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!valid) return redirect('/login?error=invalid');

  const session = await useSession(event, {
    name: 'ffmpeg-web-session',
    password: sealPassword(webPassword),
    cookie: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax'
    }
  });

  await session.update({ authenticated: true });

  return redirect('/');
});
