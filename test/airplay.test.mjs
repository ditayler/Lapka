import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { start } from '../core/main.mjs';

// No ffmpeg or external site: exercise the real proxy with tiny HTTP fixtures.
async function fixture(fn, airplay = {}) {
  const origin = http.createServer((req, res) => {
    if (req.url === '/master.m3u8') return res.end('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="One",DEFAULT=YES,URI="one.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Two",DEFAULT=NO,URI="two.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO="a"\nvideo.m3u8\n');
    if (req.url.endsWith('.m3u8')) return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST\n');
    if (req.url === '/file.mp4') {
      res.writeHead(req.headers.range ? 206 : 200, { 'content-type': 'video/mp4', 'content-length': '4', ...(req.headers.range ? { 'content-range': 'bytes 0-3/4' } : {}) });
      return res.end('test');
    }
    res.end('piece');
  });
  await new Promise(r => origin.listen(0, '127.0.0.1', r));
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka-airplay-'));
  const lapka = await start({ port: 0, home, airplay: { host: '127.0.0.1', ...airplay } });
  const base = `http://127.0.0.1:${origin.address().port}`;
  const hls = lapka.delivery.register({ kind: 'hls', url: base + '/master.m3u8' });
  const mp4 = lapka.delivery.register({ kind: 'mp4', url: base + '/file.mp4' });
  const post = (q, headers = { 'x-lapka': '1' }) => fetch(lapka.base + q, { method: 'POST', headers });
  try { await fn({ lapka, hls, mp4, post }); }
  finally { await lapka.close(); await new Promise(r => origin.close(r)); await fsp.rm(home, { recursive: true, force: true }); }
}

test('AirPlay follows nested playlists, selected dub, keys and init segments through a scoped URL', () => fixture(async ({ hls, post }) => {
  const response = await post('/api/airplay?stream=' + hls + '&audio=1');
  assert.equal(response.status, 200);
  const { url } = await response.json();
  const master = await (await fetch(url)).text();
  assert.doesNotMatch(master, /NAME="One"/);
  assert.match(master, /NAME="Two"[^\n]*DEFAULT=YES/);
  assert.doesNotMatch(master, /\/api\/stream\//);
  const paths = [...master.matchAll(/URI="([^"]+)"|^(http[^\n]+)$/gm)].map(m => m[1] || m[2]);
  assert.equal(paths.length, 2);
  for (const playlist of paths) {
    const text = await (await fetch(playlist)).text();
    const pieces = [...text.matchAll(/URI="([^"]+)"|^(http[^\n]+)$/gm)].map(m => m[1] || m[2]);
    assert.equal(pieces.length, 3);
    for (const piece of pieces) assert.equal(await (await fetch(piece)).text(), 'piece');
  }
}));

test('AirPlay cannot access settings, arbitrary URLs, another stream, or revoked tokens', () => fixture(async ({ hls, mp4, post, lapka }) => {
  assert.equal((await post('/api/airplay?stream=' + hls, {})).status, 403);
  assert.equal((await post('/api/airplay?stream=' + hls, { 'x-lapka': '1', origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/api/airplay?stream=unknown')).status, 404);
  const { url, token } = await (await post('/api/airplay?stream=' + mp4)).json();
  const remote = new URL(url);
  for (const p of ['/api/state', '/api/home', '/api/quit', '/api/stream/' + hls + '.m3u8']) {
    assert.equal((await fetch(remote.origin + p)).status, 403);
  }
  assert.equal((await fetch(url.replace(token, 'bad'))).status, 403);
  assert.equal((await fetch(url, { method: 'POST' })).status, 403);
  const arbitrary = new URL('seg?u=' + encodeURIComponent('http://127.0.0.1/private'), url);
  assert.equal((await fetch(arbitrary)).status, 403);
  const foreignHost = await new Promise((resolve, reject) => {
    const req = http.get(lapka.base + '/api/state', { headers: { host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(foreignHost, 403);
  const range = await fetch(url, { headers: { range: 'bytes=0-3' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 0-3/4');
  assert.equal(await range.text(), 'test');
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  await post('/api/airplay/stop?token=' + token);
  assert.equal((await fetch(url)).status, 403);
}));

test('AirPlay links expire while the local player stays available', async () => {
  let now = 1000;
  await fixture(async ({ mp4, post, lapka }) => {
    const { url } = await (await post('/api/airplay?stream=' + mp4)).json();
    assert.equal((await fetch(url)).status, 200);
    now += 24 * 60 * 60 * 1000 + 1;
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(lapka.base + '/api/stream/' + mp4 + '.mp4')).status, 200);
  }, { now: () => now });
});
