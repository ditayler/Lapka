/* Build a relocatable .app. End users need neither Node nor npm. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NODE_VERSION = '24.13.0';
const run = (file, args) => exec(file, args, { maxBuffer: 4 * 1024 * 1024, timeout: 180000 });

export function parseArguments(args) {
  const options = { arch: process.arch, output: null, node: null, nodeLicense: null };
  for (const arg of args) {
    const m = /^--(arch|output|node|node-license)=(.+)$/.exec(arg);
    if (!m) throw Error('Unknown argument: ' + arg);
    options[{ 'node-license': 'nodeLicense' }[m[1]] || m[1]] = m[2];
  }
  if (!['arm64', 'x64'].includes(options.arch)) throw Error('Unsupported macOS architecture: ' + options.arch);
  options.output = path.resolve(options.output || path.join(ROOT, 'dist', 'macos-' + options.arch, 'Lapka.app'));
  if (path.extname(options.output) !== '.app') throw Error('Output must end in .app');
  return options;
}

export async function validateRuntime(file, arch) {
  let info;
  try {
    info = JSON.parse((await run(file, ['-p', 'JSON.stringify({version:process.version,arch:process.arch,platform:process.platform})'])).stdout);
  } catch { throw Error('The bundled runtime must be an executable Node.js binary'); }
  if (info.platform !== 'darwin' || Number(info.version.slice(1).split('.')[0]) < 22) throw Error('Node.js 22 or newer for macOS is required');
  if (info.arch !== arch) throw Error(`Node architecture ${info.arch} does not match ${arch}`);
  const { stdout } = await run('/usr/bin/otool', ['-L', file]);
  const dependencies = stdout.split('\n').slice(1).map(line => line.trim().split(' ')[0]).filter(Boolean);
  if (dependencies.some(d => !d.startsWith('/usr/lib/') && !d.startsWith('/System/Library/'))) throw Error('Node has non-system dylibs; use an official standalone Node.js binary');
  const build = (await run('/usr/bin/vtool', ['-show-build', file])).stdout;
  const minimum = /\bminos\s+(\d+(?:\.\d+){0,2})/.exec(build)?.[1];
  const versionNumber = value => value.split('.').reduce((n, part, i) => n + Number(part) * [10000, 100, 1][i], 0);
  if (!minimum || versionNumber(minimum) > versionNumber('13.5')) throw Error('Node requires a newer macOS version than the application minimum (13.5)');
  return info;
}

export async function copyApplication(destination) {
  await fsp.mkdir(destination, { recursive: true });
  for (const name of ['core', 'profiles', 'LICENSE', 'LICENSES', 'TRADEMARKS.md', 'TRADEMARKS.ru.md', 'package.json', 'package-lock.json']) {
    await fsp.cp(path.join(ROOT, name), path.join(destination, name), { recursive: true });
  }
  await fsp.mkdir(path.join(destination, 'web'), { recursive: true });
  for (const name of ['index.html', 'styles.css', 'app.js', 'i18n.js', 'airplay.js', 'assets']) {
    await fsp.cp(path.join(ROOT, 'web', name), path.join(destination, 'web', name), { recursive: true });
  }
  const lock = JSON.parse(await fsp.readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const [relative, pkg] of Object.entries(lock.packages)) {
    if (!relative.startsWith('node_modules/') || pkg.dev) continue;
    const source = path.join(ROOT, relative);
    if (pkg.optional && !await fsp.stat(source).catch(() => null)) continue;
    await fsp.cp(source, path.join(destination, relative), {
      recursive: true, dereference: true,
      filter: file => file === source || path.basename(file) !== 'node_modules',
    });
  }
}

async function downloadRuntime(arch) {
  const cache = path.join(ROOT, '.dev', 'build-cache');
  await fsp.mkdir(cache, { recursive: true });
  const name = `node-v${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const base = `https://nodejs.org/dist/v${NODE_VERSION}/`;
  const sums = await fetch(base + 'SHASUMS256.txt');
  if (!sums.ok) throw Error('Cannot download official Node checksums: ' + sums.status);
  const line = (await sums.text()).split('\n').find(l => l.trim().endsWith(' ' + name));
  const expected = line?.split(/\s+/)[0];
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Node archive missing from official checksums');
  let bytes = await fsp.readFile(path.join(cache, name)).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected) {
    const response = await fetch(base + name);
    if (!response.ok) throw Error('Cannot download Node runtime: ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('Node archive checksum mismatch');
    await fsp.writeFile(path.join(cache, name), bytes);
  }
  const extracted = await fsp.mkdtemp(path.join(cache, 'node-'));
  await run('/usr/bin/tar', ['-xzf', path.join(cache, name), '-C', extracted]);
  const folder = path.join(extracted, `node-v${NODE_VERSION}-darwin-${arch}`);
  return { file: path.join(folder, 'bin/node'), license: path.join(folder, 'LICENSE'), cleanup: extracted };
}

export async function assertOutputAvailable(output) {
  if (!await fsp.stat(output).catch(() => null)) return;
  const existing = await fsp.readFile(path.join(output, 'Contents/Resources/build.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (existing?.app !== 'Lapka') throw Error('Refusing to replace an unrecognized application at ' + output);
  let pids = '';
  try { pids = (await run('/usr/sbin/lsof', ['-t', path.join(output, 'Contents/MacOS/Lapka')])).stdout.trim(); }
  catch (e) { if (e.code !== 1 || e.stderr?.trim()) throw Error('Cannot check whether the output app is running: ' + (e.stderr || e.message)); }
  if (pids) throw Error('Quit Lapka before rebuilding this bundle: ' + output);
}

export async function build(options) {
  if (process.platform !== 'darwin') throw Error('Build the macOS application on macOS with Xcode Command Line Tools');
  await assertOutputAvailable(options.output);
  const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const runtime = options.node ? {
    file: path.resolve(options.node),
    license: path.resolve(options.nodeLicense || path.join(path.dirname(options.node), '..', 'LICENSE')),
  } : await downloadRuntime(options.arch);
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka-app-build-'));
  try {
    const info = await validateRuntime(runtime.file, options.arch);
    const app = path.join(work, 'Lapka.app'), contents = path.join(app, 'Contents'), resources = path.join(contents, 'Resources');
    await fsp.mkdir(path.join(contents, 'MacOS'), { recursive: true });
    await fsp.mkdir(path.join(resources, 'runtime/bin'), { recursive: true });
    await copyApplication(path.join(resources, 'app'));
    await fsp.copyFile(runtime.file, path.join(resources, 'runtime/bin/node'));
    await fsp.chmod(path.join(resources, 'runtime/bin/node'), 0o755);
    await fsp.copyFile(runtime.license, path.join(resources, 'runtime/LICENSE'));
    await fsp.cp(path.join(ROOT, 'desktop/macos'), path.join(resources, 'Sources/macos'), { recursive: true });
    const plist = (await fsp.readFile(path.join(ROOT, 'desktop/macos/Info.plist'), 'utf8')).replaceAll('__VERSION__', pkg.version);
    await fsp.writeFile(path.join(contents, 'Info.plist'), plist);
    await fsp.writeFile(path.join(resources, 'build.json'), JSON.stringify({ app: 'Lapka', version: pkg.version, node: info.version, arch: options.arch }, null, 2));
    const cache = path.join(ROOT, '.dev', 'build-cache', 'swift-' + options.arch);
    await fsp.mkdir(cache, { recursive: true });
    await run('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', `${options.arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macos13.5`, '-module-cache-path', cache,
      ...['ServerProcess.swift', 'WindowChrome.swift', 'AppDelegate.swift', 'main.swift'].map(f => path.join(ROOT, 'desktop/macos', f)), '-framework', 'AppKit', '-framework', 'WebKit', '-o', path.join(contents, 'MacOS/Lapka')]);
    const iconTool = path.join(work, 'icon-tool'), iconset = path.join(work, 'Lapka.iconset');
    await run('/usr/bin/xcrun', ['swiftc', path.join(ROOT, 'desktop/macos/Icon.swift'), '-module-cache-path', cache, '-framework', 'AppKit', '-o', iconTool]);
    await run(iconTool, [path.join(ROOT, 'web/index.html'), iconset]);
    await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'Lapka.icns')]);
    const identity = process.env.LAPKA_SIGN_IDENTITY || '-';
    await run('/usr/bin/codesign', ['--force', '--sign', identity, ...(identity === '-' ? [] : ['--options', 'runtime', '--timestamp', '--entitlements', path.join(ROOT, 'desktop/macos/Node.entitlements')]), path.join(resources, 'runtime/bin/node')]);
    await run('/usr/bin/codesign', ['--force', '--sign', identity, ...(identity === '-' ? [] : ['--options', 'runtime', '--timestamp']), app]);
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    if (await fsp.stat(options.output).catch(() => null)) {
      await assertOutputAvailable(options.output);
      await fsp.rm(options.output, { recursive: true });
    }
    await fsp.mkdir(path.dirname(options.output), { recursive: true });
    await fsp.cp(app, options.output, { recursive: true, preserveTimestamps: true });
    const zip = path.join(path.dirname(options.output), `Lapka-macos-${options.arch}.zip`);
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', options.output, zip]);
    return { app: options.output, zip };
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
    if (runtime.cleanup) await fsp.rm(runtime.cleanup, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await build(parseArguments(process.argv.slice(2))); console.log(`App: ${result.app}\nZip: ${result.zip}`); }
  catch (e) { console.error(e.stderr || e.message); process.exitCode = 1; }
}
