/* Checks for the password gate in middleware.ts (woodshed-plan.md §14.3).
 * Run: npm run test:gate
 */
import middleware from '../middleware.ts';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
const basic = (user, pw) => 'Basic ' + Buffer.from(user + ':' + pw, 'utf8').toString('base64');
const req = (path, headers) => new Request('https://x.test' + path, headers ? { headers } : {});
const page = path => req(path, { accept: 'text/html,application/xhtml+xml' });
const login = (pw, next) => new Request('https://x.test/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ password: pw, ...(next ? { next } : {}) }).toString()
});

delete process.env.SITE_PASSWORD;
let r = await middleware(req('/'));
check('no SITE_PASSWORD: fails closed with 503', r && r.status === 503, r && r.status);
r = await middleware(req('/assets/index.js', { authorization: basic('a', '') }));
check('no SITE_PASSWORD: empty password does not get in', r && r.status === 503, r && r.status);
r = await middleware(login(''));
check('no SITE_PASSWORD: empty login does not get in', r && r.status === 503, r && r.status);

const PW = 'かな-pass:word';
process.env.SITE_PASSWORD = PW;

r = await middleware(page('/'));
const body = await r.text();
check('browser navigation: 401 with an in-page form',
  r.status === 401 && /<form method="post" action="\/login">/.test(body));
check('no native Basic challenge (the dialog phones drop)', !r.headers.get('www-authenticate'));
check('login page has a viewport meta', /name="viewport"/.test(body));
r = await middleware(req('/assets/index.js'));
check('a script file without credentials: bare 401, no form', r.status === 401 && !/<form/.test(await r.text()));

r = await middleware(login('wrong'));
check('wrong password: 401 form with error', r.status === 401 && /Wrong password/.test(await r.text()));
r = await middleware(login('かな-pass:wor'));
check('prefix of the password: 401', r.status === 401, r.status);
r = await middleware(login(''));
check('empty password: 401', r.status === 401, r.status);

r = await middleware(login(PW, '/?x=1'));
const setCookie = r.headers.get('set-cookie') || '';
check('right password: 303 back to next', r.status === 303 && r.headers.get('location') === '/?x=1', r.status);
check('cookie is HttpOnly, Secure, SameSite, and not the password',
  /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Lax/.test(setCookie)
  && !setCookie.includes(PW) && !setCookie.includes(encodeURIComponent(PW)));
r = await middleware(login(PW, '//evil.test'));
check('open redirect via //host refused', r.headers.get('location') === '/', r.headers.get('location'));
r = await middleware(login(PW, 'https://evil.test'));
check('open redirect via absolute URL refused', r.headers.get('location') === '/', r.headers.get('location'));

const cookie = setCookie.split(';')[0];
check('valid cookie passes through (page)',
  await middleware(req('/', { cookie, accept: 'text/html' })) === undefined);
check('valid cookie passes through (data file)',
  await middleware(req('/assets/index.js', { cookie: 'a=b; ' + cookie })) === undefined);
r = await middleware(req('/', { cookie: 'ws_auth=deadbeef', accept: 'text/html' }));
check('forged cookie: 401', r.status === 401, r.status);
process.env.SITE_PASSWORD = 'other';
r = await middleware(req('/', { cookie, accept: 'text/html' }));
check('cookie dies when the password changes', r.status === 401, r.status);
process.env.SITE_PASSWORD = PW;

r = await middleware(req('/', { authorization: basic('andrew', 'wrong') }));
check('wrong Basic password: 401', r.status === 401, r.status);
r = await middleware(req('/', { authorization: 'Basic !!!not-base64' }));
check('malformed header: 401', r.status === 401, r.status);
r = await middleware(req('/', { authorization: 'Bearer ' + Buffer.from('x:' + PW).toString('base64') }));
check('non-Basic scheme: 401', r.status === 401, r.status);
// Woodshed's own routes: the Songsterr function and alphaTab's sound file.
const post = (path, headers) => new Request('https://x.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"link":"x"}' });
r = await middleware(post('/api/songsterr'));
check('Songsterr function without credentials: bare 401', r.status === 401 && !/<form/.test(await r.text()), r.status);
check('Songsterr function with the cookie passes', await middleware(post('/api/songsterr', { cookie })) === undefined);
r = await middleware(req('/soundfont/sonivox.sf2'));
check('sound file without credentials: 401', r.status === 401, r.status);
delete process.env.SITE_PASSWORD;
r = await middleware(post('/api/songsterr', { cookie }));
check('no SITE_PASSWORD: even an old cookie gets 503', r.status === 503, r.status);
process.env.SITE_PASSWORD = PW;

check('right Basic password still passes (scripts)',
  await middleware(req('/assets/index.js', { authorization: basic('andrew', PW) })) === undefined);

console.log('\n' + (fail ? 'FAILURES: ' + fail : 'all ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);
