/* middleware.ts - password gate for the hosted copy (woodshed-plan.md §14.1).
 *
 * Vercel runs this before every request: the app, alphaTab's fonts and sounds, and the
 * /api/songsterr function. Without the password nothing loads and the Songsterr import
 * can't be used by anyone else.
 *
 * Copied from the JAPN trainer's gate, which is in daily use. The prompt is an in-page
 * form, not HTTP Basic's browser dialog: phone browsers and in-app webviews often never
 * show that dialog. POST /login with the right password sets an HttpOnly cookie (salted
 * SHA-256 of the password) for 30 days. A Basic header with the right password is still
 * accepted for scripts. Returning nothing lets the request through.
 */

// Vercel's Edge runtime provides process.env; this project has no @types/node to say so.
declare const process: { env: Record<string, string | undefined> };

const COOKIE = 'ws_auth';
const SALT = 'woodshed-gate-v1|';
const MAX_AGE = 60 * 60 * 24 * 30;
const NO_STORE = { 'Cache-Control': 'no-store' };

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* Compare through SHA-256 so the length of the secret never leaks via an early exit. */
async function samePassword(given: string, expected: string): Promise<boolean> {
  return sameBytes(await digest(given), await digest(expected));
}

/* The password half of "Basic base64(user:password)", or null if absent/malformed. */
function suppliedPassword(header: string | null): string | null {
  const m = /^Basic\s+(\S+)$/i.exec(header || '');
  if (!m) return null;
  try {
    const bin = atob(m[1]);
    const text = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    const colon = text.indexOf(':');
    return colon < 0 ? null : text.slice(colon + 1);
  } catch {
    return null;
  }
}

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/* Only same-site absolute paths; "//evil.test" and "/\evil.test" would leave the site. */
function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/';
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function loginPage(next: string, failed: boolean): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Woodshed</title>
<style>
:root{--bg:#f3eee4;--surface:#fbf8f1;--ink:#241f1a;--ink-3:#7b7064;--line:#d6ccbb;--accent:#a4460f}
@media(prefers-color-scheme:dark){:root{--bg:#161310;--surface:#201c18;--ink:#f0e8dc;--ink-3:#9a8e80;--line:#3b342d;--accent:#f0a05a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;
  padding:16px;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif}
form{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px 20px}
h1{margin:0 0 4px;font:italic 600 28px/1.1 'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif}
p{margin:0 0 16px;color:var(--ink-3);font-size:14px}
label{display:block;font-size:14px;margin-bottom:6px}
input[type=password],input[type=text]{width:100%;font:inherit;font-size:16px;padding:12px;border-radius:10px;
  border:1px solid var(--line);background:var(--bg);color:var(--ink)}
label.show{display:flex;align-items:center;gap:8px;margin:12px 0 0;min-height:44px}
.show input{width:20px;height:20px}
button{width:100%;margin-top:8px;min-height:48px;font:inherit;font-weight:600;border:0;border-radius:10px;
  background:var(--accent);color:var(--bg);cursor:pointer}
.err{color:var(--accent);font-weight:600;margin:0 0 12px}
</style></head><body>
<form method="post" action="/login">
<h1>Woodshed</h1>
<p>Enter the password to continue.</p>
${failed ? '<p class="err" role="alert">Wrong password. Try again.</p>' : ''}
<input type="hidden" name="next" value="${esc(next)}">
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
<label class="show"><input type="checkbox" id="show"> Show password</label>
<button type="submit">Unlock</button>
</form>
<script>document.getElementById('show').addEventListener('change',function(e){document.getElementById('pw').type=e.target.checked?'text':'password'})</script>
</body></html>`;
  return new Response(html, {
    status: 401,
    headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    // Fail closed: a deploy made before the password is set exposes nothing.
    return new Response('Site password not configured.\n', { status: 503, headers: NO_STORE });
  }
  const token = hex(await digest(SALT + expected));
  const url = new URL(request.url);

  // Login submission.
  if (request.method === 'POST' && url.pathname === '/login') {
    let given = '', next = '/';
    try {
      const form = new URLSearchParams(await request.text());
      given = form.get('password') || '';
      next = safeNext(form.get('next'));
    } catch { /* treated as a wrong password */ }
    if (given !== '' && await samePassword(given, expected)) {
      return new Response(null, {
        status: 303,
        headers: {
          ...NO_STORE,
          Location: next,
          'Set-Cookie': `${COOKIE}=${token}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }
    return loginPage(next, true);
  }

  // Already unlocked: cookie, or (scripts) a Basic header with the password.
  const cookie = cookieValue(request.headers.get('cookie'), COOKIE);
  if (cookie !== null && await samePassword(cookie, token)) return undefined;
  const basic = suppliedPassword(request.headers.get('authorization'));
  if (basic !== null && await samePassword(basic, expected)) return undefined;

  // Page navigations get the form; everything else (data files, fetches) a bare 401.
  const wantsPage = (request.method === 'GET' || request.method === 'HEAD')
    && (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) return loginPage(safeNext(url.pathname + url.search), false);
  return new Response('Password required.\n', { status: 401, headers: NO_STORE });
}
