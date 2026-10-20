import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const builder = await import('../scripts/build-macos.mjs').catch(() => ({}));

test('macOS packaging copies runtime assets and dependencies without user data or development files', async () => {
  assert.equal(typeof builder.copyApplication, 'function');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka package space-'));
  try {
    await builder.copyApplication(dir);
    for (const f of ['core/desktop.mjs', 'web/index.html', 'web/airplay.js', 'profiles', 'LICENSE', 'LICENSES']) await fsp.access(path.join(dir, f));
    for (const f of ['.git', '.dev', 'test', 'docs/media', 'web/seal.html']) await assert.rejects(fsp.access(path.join(dir, f)));
    const require = createRequire(path.join(dir, 'package.json'));
    assert.equal(require('linkedom').parseHTML('<p>ready</p>').document.querySelector('p').textContent, 'ready');
    await fsp.access(require.resolve('hls.js/dist/hls.min.js'));
  } finally { await fsp.rm(dir, { force: true, recursive: true }); }
});

test('macOS packaging rejects invalid architectures before creating a bundle', () => {
  assert.equal(typeof builder.parseArguments, 'function');
  assert.throws(() => builder.parseArguments(['--arch=../../escape']), /architecture/);
});

test('macOS packaging verifies Node version, target architecture and standalone dylibs', { skip: process.platform !== 'darwin' }, async () => {
  assert.equal(typeof builder.validateRuntime, 'function');
  const info = await builder.validateRuntime(process.execPath, process.arch);
  assert.equal(info.arch, process.arch);
  assert.match(info.version, /^v(2[2-9]|[3-9]\d)\./);
  await assert.rejects(builder.validateRuntime(process.execPath, process.arch === 'arm64' ? 'x64' : 'arm64'), /architecture/);
  await assert.rejects(builder.validateRuntime('/usr/bin/true', process.arch), /Node/);
});

test('macOS packaging refuses to overwrite a running bundle', { skip: process.platform !== 'darwin' }, async () => {
  assert.equal(typeof builder.assertOutputAvailable, 'function');
  const { execFile, spawn } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { once } = await import('node:events');
  const exec = promisify(execFile);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka-live-bundle-'));
  let child;
  try {
    const app = path.join(dir, 'Lapka.app');
    await fsp.mkdir(path.join(app, 'Contents/Resources'), { recursive: true });
    await fsp.mkdir(path.join(app, 'Contents/MacOS'), { recursive: true });
    await fsp.writeFile(path.join(app, 'Contents/Resources/build.json'), '{"app":"Lapka"}');
    const source = path.join(dir, 'owner.c');
    const executable = path.join(app, 'Contents/MacOS/Lapka');
    await fsp.writeFile(source, '#include <stdio.h>\n#include <unistd.h>\nint main(){ puts("ready");fflush(stdout);sleep(30);return 0;}');
    await exec('/usr/bin/clang', [source, '-o', executable]);
    child = spawn(executable, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    await once(child.stdout, 'data');
    await assert.rejects(builder.assertOutputAvailable(app), /Quit Lapka/);
    const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended;
    await builder.assertOutputAvailable(app);
  } finally { child?.kill('SIGKILL'); await fsp.rm(dir, { recursive: true, force: true }); }
});
