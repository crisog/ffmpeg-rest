import { defineHandler, clearSession, redirect } from 'nitro/h3';
import { createHash } from 'node:crypto';

function sealPassword(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export default defineHandler(async (event) => {
  const webPassword = process.env['WEB_PASSWORD']?.trim();
  if (webPassword) {
    await clearSession(event, {
      name: 'ffmpeg-web-session',
      password: sealPassword(webPassword)
    });
  }

  return redirect('/login');
});
