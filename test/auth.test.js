const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

let child, base, temp;
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(e => e ? reject(e) : resolve(p));
    });
  });
}
function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}
async function request(route, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  return fetch(base + route, { ...options, headers });
}
async function json(res) { return res.json(); }

before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tgc-trade-test-'));
  const port = await freePort();
  base = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(temp, 'data.json'), UPLOADS_DIR: path.join(temp, 'uploads') },
    stdio: 'ignore'
  });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) throw new Error('Server exited before tests started');
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Server did not become ready');
});

after(() => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
});

test('authentication, per-account data, ownership, image/video upload and logout', async () => {
  let res = await request('/api/listings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Unauthorized card' })
  });
  assert.equal(res.status, 401, 'listing creation must require login');

  res = await request('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Collector One', email: 'one@example.com', password: 'correct horse battery staple', location: 'Manila' })
  });
  assert.equal(res.status, 201);
  const oneCookie = cookieFrom(res);
  assert.match(oneCookie, /^tgc_session=/);
  assert.equal((await json(await request('/api/me', {}, oneCookie))).user.name, 'Collector One');

  const png = Buffer.from([137,80,78,71,13,10,26,10]);
  res = await request('/api/listings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test PNG', mode: 'Both', image: { name: 'card.png', type: 'image/png', data: png.toString('base64') } })
  }, oneCookie);
  assert.equal(res.status, 201, 'valid PNG upload should create a listing');
  const imageListing = (await json(res)).listing;
  assert.equal(imageListing.mediaType, 'image');
  assert.match(imageListing.photo, /^\/uploads\//);
  res = await request(imageListing.photo);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 8).toString('hex'), png.toString('hex'));

  const mp4 = Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,2,0]);
  res = await request('/api/listings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test MP4', mode: 'Trade', image: { name: 'clip.mp4', type: 'video/mp4', data: mp4.toString('base64') } })
  }, oneCookie);
  assert.equal(res.status, 201, 'valid MP4 upload should create a listing');
  const videoListing = (await json(res)).listing;
  assert.equal(videoListing.mediaType, 'video');
  res = await request(videoListing.photo);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(4, 8).toString('ascii'), 'ftyp');

  res = await request('/api/wants', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ want: 'Umbreon' })
  }, oneCookie);
  assert.equal(res.status, 201);
  assert.deepEqual((await json(await request('/api/wants', {}, oneCookie))).wants, ['Umbreon']);

  res = await request('/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Collector Two', email: 'two@example.com', password: 'another correct horse battery', location: 'Cebu' })
  });
  assert.equal(res.status, 201);
  const twoCookie = cookieFrom(res);
  assert.deepEqual((await json(await request('/api/wants', {}, twoCookie))).wants, [], 'wants must be isolated by account');
  res = await request('/api/listings/' + imageListing.id, { method: 'DELETE' }, twoCookie);
  assert.equal(res.status, 403, 'a different user cannot delete another user listing');

  res = await request('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'one@example.com', password: 'correct horse battery staple' })
  });
  assert.equal(res.status, 200, 'registered user can log in');
  const loginCookie = cookieFrom(res);
  res = await request('/api/logout', { method: 'POST' }, loginCookie);
  assert.equal(res.status, 200);
  assert.equal((await request('/api/me', {}, loginCookie)).status, 401, 'logout invalidates session');
});
