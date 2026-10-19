/* Real shipping page in Chrome. The Safari API is simulated only in the
   second test; these tests do not establish a real AirPlay connection. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openLapka, findChrome } from './browser.mjs';

const skip = !findChrome() && 'no Chrome found';
const wait = `
  const until = async (name, fn) => {
    __step(name);
    for (let i = 0; i < 100; i++) { if (fn()) return; await __tick(); }
    throw Error('timed out: ' + name);
  };
`;

test('the shipping page boots in Chrome with AirPlay hidden', { skip }, async () => {
  const r = await openLapka('airplay-chrome', wait + `
    await until('boot', () => !document.querySelector('#empty').classList.contains('hide'));
    __report({ hidden: document.querySelector('#btnAirplay').hidden, errors: __errors });
  `, { budget: 8000 });
  assert.equal(r.fatal || r.stalled, undefined, JSON.stringify(r));
  assert.deepEqual(r.errors, []);
  assert.equal(r.hidden, true);
});

test('the shipping player prepares a stream and hands its LAN URL to the simulated Safari picker', { skip }, async () => {
  // PCM silence supplies real media metadata without an ffmpeg dependency.
  const media = Buffer.alloc(44 + 8000 * 180, 128);
  media.write('RIFF', 0); media.writeUInt32LE(media.length - 8, 4);
  media.write('WAVEfmt ', 8); media.writeUInt32LE(16, 16);
  media.writeUInt16LE(1, 20); media.writeUInt16LE(1, 22);
  media.writeUInt32LE(8000, 24); media.writeUInt32LE(8000, 28);
  media.writeUInt16LE(1, 32); media.writeUInt16LE(8, 34);
  media.write('data', 36); media.writeUInt32LE(media.length - 44, 40);
  const origin = http.createServer((req, res) => {
    if (req.url === '/movie.mp4') {
      res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': String(media.length) });
      return res.end(media);
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><head><title>AirPlay test — Episode 1</title></head><body><h1>AirPlay test — Episode 1</h1><video src="/movie.mp4"></video></body></html>');
  });
  await new Promise(r => origin.listen(0, '127.0.0.1', r));
  try {
    const r = await openLapka('airplay-safari-api', wait + `
      await until('boot', () => !document.querySelector('#empty').classList.contains('hide'));
      document.querySelector('#linkInput').value = site;
      document.querySelector('#linkForm').requestSubmit();
      const button = document.querySelector('#btnAirplay'), video = document.querySelector('#video');
      await until('prepared', () => !button.disabled && video.readyState >= 1);
      video.pause();
      video.currentTime = 42;
      button.click();
      const handedOff = video.src;
      await until('native position', () => video.readyState >= 1 && Math.abs(video.currentTime - 42) < 0.5);
      const nativeTime = video.currentTime, nativePaused = video.paused;
      video.webkitCurrentPlaybackTargetIsWireless = true;
      video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
      const active = button.getAttribute('aria-pressed');
      video.webkitCurrentPlaybackTargetIsWireless = false;
      video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
      await until('local return', () => video.src.includes('/api/stream/') && video.readyState >= 1 && Math.abs(video.currentTime - 42) < 0.5);
      __report({ hidden: button.hidden, picks: window.__picks, handedOff, nativeTime, nativePaused, active, localTime: video.currentTime, localPaused: video.paused, errors: __errors });
    `, {
      site: `http://127.0.0.1:${origin.address().port}/ep-1`, budget: 16000,
      airplay: { host: '127.0.0.1' },
      init: `window.__picks = 0; HTMLMediaElement.prototype.webkitShowPlaybackTargetPicker = function () { window.__picks++; };`,
    });
    assert.equal(r.fatal || r.stalled, undefined, JSON.stringify(r));
    assert.deepEqual(r.errors, []);
    assert.equal(r.hidden, false);
    assert.equal(r.picks, 1);
    assert.ok(Math.abs(r.nativeTime - 42) < 0.5);
    assert.ok(Math.abs(r.localTime - 42) < 0.5);
    assert.equal(r.nativePaused, true);
    assert.equal(r.localPaused, true);
    assert.equal(r.active, 'true');
    assert.match(r.handedOff, /^http:\/\/127\.0\.0\.1:\d+\/airplay\/[a-f0-9]{48}\/stream\.mp4$/);
  } finally { await new Promise(r => { origin.close(r); origin.closeAllConnections(); }); }
});
