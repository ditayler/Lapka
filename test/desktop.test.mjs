import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function launch(data, port = 0) {
  const child = spawn(process.execPath, [path.join(root, 'core/desktop.mjs')], {
    cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, LAPKA_DATA_DIR: data, LAPKA_DESKTOP_PORT: String(port), LAPKA_CONFIG: '', LAPKA_HOME: '' },
  });
  let out = '', err = '';
  child.stdout.on('data', b => { out += b; });
  child.stderr.on('data', b => { err += b; });
  const exited = once(child, 'exit');
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('desktop not ready: ' + err + out)), 8000);
    child.stdout.on('data', () => {
      for (const line of out.split('\n')) {
        try { const event = JSON.parse(line); if (event.type === 'lapka-ready') { clearTimeout(timeout); resolve(event); } } catch {}
      }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(Error('desktop exited ' + code + ': ' + err)); });
  });
  return { child, ready, exited, error: () => err };
}
async function using(fn) {
  const data = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka-desktop space-'));
  const children = [];
  try { await fn(data, async port => { const app = await launch(data, port); children.push(app); return app; }); }
  finally {
    for (const app of children) { app.child.kill('SIGKILL'); app.child.stdin.destroy(); }
    await fsp.rm(data, { force: true, recursive: true });
  }
}

test('desktop uses durable data outside the app, preserves chosen library and closes on EOF', () => using(async (data, launch) => {
  const app = await launch();
  const ready = await app.ready;
  assert.match(ready.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(ready.pid, app.child.pid);
  const ping = await (await fetch(ready.url + '/api/ping')).json();
  assert.equal(ping.home, path.join(data, 'home'));
  const folder = path.join(data, 'chosen library');
  const home = await fetch(ready.url + '/api/home?path=' + encodeURIComponent(folder), { method: 'POST', headers: { 'x-lapka': '1' } });
  assert.equal(home.status, 200);
  await fetch(ready.url + '/api/state/position?series=show&episode=1&dub=original&t=42', { method: 'POST', headers: { 'x-lapka': '1' } });
  app.child.stdin.end();
  assert.equal((await app.exited)[0], 0);
  await assert.rejects(fetch(ready.url + '/api/ping'));
  const config = JSON.parse(await fsp.readFile(path.join(data, 'config.json'), 'utf8'));
  assert.equal(config.home, folder);
  const second = await launch();
  const next = await second.ready;
  assert.equal((await (await fetch(next.url + '/api/ping')).json()).home, folder);
  const state = await (await fetch(next.url + '/api/state')).json();
  assert.equal(state.positions['show/1/original'].t, 42);
  second.child.stdin.end();
  assert.equal((await second.exited)[0], 0);
}));

for (const stop of ['SIGTERM', 'SIGINT', 'quit']) test('desktop shuts down its listener on ' + stop, () => using(async (_, launch) => {
  const app = await launch();
  const { url } = await app.ready;
  if (stop === 'quit') assert.equal((await fetch(url + '/api/quit', { method: 'POST', headers: { 'x-lapka': '1' } })).status, 200);
  else app.child.kill(stop);
  assert.equal((await app.exited)[0], 0);
  await assert.rejects(fetch(url + '/api/ping'));
}));

test('an occupied port reports failure without terminating the other service', () => using(async (_, launch) => {
  const other = http.createServer((_, res) => res.end('unrelated'));
  await new Promise(r => other.listen(0, '127.0.0.1', r));
  try {
    const port = other.address().port;
    const app = await launch(port);
    await assert.rejects(app.ready, /EADDRINUSE/);
    assert.equal((await app.exited)[0], 1);
    assert.equal(await (await fetch('http://127.0.0.1:' + port)).text(), 'unrelated');
  } finally { await new Promise(r => other.close(r)); }
}));
