/* Native acceptance against the shipping application classes and bundled runtime. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform !== 'darwin') throw Error('Native acceptance requires macOS');
const bundle = path.resolve(process.argv[2] || path.join(root, 'dist', 'macos-' + process.arch, 'Lapka.app'));
const resources = path.join(bundle, 'Contents/Resources');
await fsp.access(path.join(resources, 'runtime/bin/node')).catch(() => { throw Error('Build Lapka.app with npm run build:macos first'); });
const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka-native space-'));
let media;
const origin = http.createServer((req, res) => {
  if (req.url === '/media.mp4') { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': media.length }); return res.end(media); }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<html><head><title>Native test — Episode 1</title></head><body><h1>Native test — Episode 1</h1><video src="/media.mp4"></video></body></html>');
});
await new Promise(r => origin.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${origin.address().port}/ep-1`;
try {
  const executable = path.join(work, 'NativeSmoke');
  const cache = path.join(root, '.dev', 'build-cache', 'swift-' + process.arch);
  await fsp.mkdir(cache, { recursive: true });
  await exec('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', '-module-cache-path', cache,
    ...['Smoke.swift', 'Media.swift'].map(f => path.join(root, 'test/macos', f)), ...['ServerProcess.swift', 'WindowChrome.swift', 'AppDelegate.swift'].map(f => path.join(root, 'desktop/macos', f)),
    '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'AVFoundation', '-o', executable], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  const clip = path.join(work, 'video.mp4');
  await exec(executable, ['--generate-video', clip], { timeout: 30000 });
  media = await fsp.readFile(clip);
  for (const mode of (process.env.LAPKA_NATIVE_TEST_MODE ? [process.env.LAPKA_NATIVE_TEST_MODE] : ['media', 'pip', 'autohide', 'updates', 'quit', 'parent-exit'])) {
    const child = spawn(executable, [resources, path.join(work, 'data-' + mode), site, mode], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', b => { output += b; process.stdout.write(b); });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
    const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    clearTimeout(timeout);
    if (status !== 0) throw Error('Native acceptance failed (' + mode + '): ' + status);
    if (mode !== 'parent-exit' && !output.includes('PASS:')) throw Error('Native acceptance exited before its assertions (' + mode + ')');
    if (mode === 'parent-exit') {
      const record = output.split('\n').find(line => line.startsWith('PARENT_EXIT '));
      if (!record) throw Error('Parent did not report its server');
      const { url } = JSON.parse(record.slice('PARENT_EXIT '.length));
      let alive = true;
      for (let i = 0; i < 40; i++) {
        alive = await fetch(url + '/api/ping').then(() => true, () => false);
        if (!alive) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (alive) throw Error('Server survived parent exit');
      console.log('PASS: parent exit shuts down the orphan server');
    }
  }
} finally {
  await new Promise(r => { origin.close(r); origin.closeAllConnections(); });
  await fsp.rm(work, { recursive: true, force: true });
}
