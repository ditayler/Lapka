/* Package an existing signed .app without rebuilding or stopping it. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBuildProgress } from './build-progress.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const run = (file, args) => exec(file, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
const TOOLS = path.join(ROOT, '.dev/build-cache/dmgbuild-1.6.5');
const PYTHON = path.join(TOOLS, 'bin/python3');

async function prepareTools(log) {
  const requirements = path.join(ROOT, 'desktop/macos/dmg-requirements.txt');
  const expected = await fsp.readFile(requirements, 'utf8');
  const marker = path.join(TOOLS, 'requirements.txt');
  if (await fsp.readFile(marker, 'utf8').catch(() => null) === expected
      && await fsp.access(PYTHON).then(() => true, () => false)) {
    log('Using cached, pinned dmgbuild tools');
    return;
  }
  log('Installing hash-verified DMG build tools into .dev/build-cache (first build only)');
  await run('/usr/bin/python3', ['-m', 'venv', TOOLS]);
  await run(PYTHON, ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:',
    '--require-hashes', '-r', requirements]);
  await fsp.writeFile(marker, expected);
}

async function realDestination(directory) {
  try { return await fsp.realpath(directory); }
  catch (error) {
    const parent = path.dirname(directory);
    if (error.code !== 'ENOENT' || parent === directory) throw error;
    return path.join(await realDestination(parent), path.basename(directory));
  }
}

export function parseArguments(args) {
  const options = { app: path.join(ROOT, 'dist', 'macos-' + process.arch, 'Lapka.app'), outputDir: null };
  for (const arg of args) {
    const match = /^--(app|output-dir)=(.+)$/.exec(arg);
    if (!match) throw Error('Unknown argument: ' + arg);
    options[match[1] === 'app' ? 'app' : 'outputDir'] = path.resolve(match[2]);
  }
  if (path.extname(options.app) !== '.app') throw Error('The source must end in .app');
  return options;
}

export async function planDmg({ app, outputDir }) {
  app = path.resolve(app);
  const info = await fsp.readFile(path.join(app, 'Contents/Resources/build.json'), 'utf8').then(JSON.parse)
    .catch(() => { throw Error('Cannot read Lapka build metadata. Run npm run build:macos first, or pass --app=/path/Lapka.app'); });
  const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  if (info?.app !== 'Lapka' || typeof info.version !== 'string' || !versionPattern.test(info.version)
      || !['arm64', 'x64'].includes(info.arch)) throw Error('Invalid Lapka build metadata');
  app = await fsp.realpath(app);
  outputDir = await realDestination(path.resolve(outputDir || path.dirname(app)));
  const relative = path.relative(app, outputDir);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw Error('DMG output must not be inside the source application');
  }
  return { app, version: info.version, arch: info.arch, volumeName: 'Lapka ' + info.version,
    output: path.join(outputDir, `Lapka-${info.version}-macos-${info.arch}.dmg`) };
}

export async function build(options) {
  if (process.platform !== 'darwin') throw Error('Build the DMG on macOS');
  const { log, step } = createBuildProgress({ total: 9 });
  const plan = await step('Reading application metadata', () => planDmg(options));
  log(`Lapka ${plan.version} · macOS ${plan.arch} · DMG`);
  log('Source: ' + plan.app);
  log('Output: ' + plan.output);
  await step('Verifying application version and signature', async () => {
    const plist = path.join(plan.app, 'Contents/Info.plist');
    const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]);
    if (stdout.trim() !== plan.version) throw Error('App version does not match its build metadata; rebuild with npm run build:macos');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', plan.app]);
  });
  await step('Preparing Finder layout tools', () => prepareTools(log));
  await fsp.mkdir(path.dirname(plan.output), { recursive: true });
  // Keep temporary copies hidden, and stage on the destination filesystem so
  // publishing the verified image is atomic. A failed build preserves old DMGs.
  const work = await fsp.mkdtemp(path.join(path.dirname(plan.output), '.lapka-dmg-'));
  try {
    const payload = path.join(work, 'payload'), image = path.join(work, 'Lapka.dmg');
    const copied = path.join(payload, 'Lapka.app');
    await step('Preparing application copy', async () => {
      await fsp.mkdir(payload);
      await run('/usr/bin/ditto', [plan.app, copied]);
    });
    await step('Verifying copied application signature', () => run('/usr/bin/codesign', ['--verify', '--deep', '--strict', copied]));
    const icon = path.join(copied, 'Contents/Resources/Lapka.icns');
    await step('Rendering dark installer artwork (standard and Retina)', async () => {
      const artwork = path.join(work, 'artwork');
      const cache = path.join(ROOT, '.dev/build-cache/swift');
      await fsp.mkdir(cache, { recursive: true });
      await run('/usr/bin/xcrun', ['swiftc', path.join(ROOT, 'desktop/macos/DmgArtwork.swift'),
        '-module-cache-path', cache, '-framework', 'AppKit', '-o', artwork]);
      await run(artwork, [icon, plan.version, plan.arch, work]);
    });
    await step('Creating compressed DMG with Finder layout', async () => {
      const settings = {
        format: 'UDZO', filesystem: 'HFS+', compression_level: 9,
        files: [copied], symlinks: { Applications: '/Applications' },
        icon, background: path.join(work, 'background.png'),
        window_rect: [[160, 160], [720, 440]], default_view: 'icon-view',
        icon_locations: { 'Lapka.app': [200, 231], Applications: [520, 231],
          // Show Hidden Files is a user's global preference. Respect it, but
          // keep support files below the artwork, within the window's width.
          // Far-right icons create a horizontal scrollbar and can hide the app.
          '.background.tiff': [200, 2560], '.VolumeIcon.icns': [520, 2560] },
        scroll_position: [0, 0],
        sidebar_width: 0,
        // SetFile's hide-extension flag adds FinderInfo to the signed app.
        // Keep the bundle untouched so a copied installation still verifies.
        icon_size: 112, text_size: 14,
        show_status_bar: false, show_tab_view: false, show_toolbar: false,
        show_pathbar: false, show_sidebar: false,
      };
      const config = path.join(work, 'settings.json');
      await fsp.writeFile(config, JSON.stringify(settings));
      await run(PYTHON, ['-I', path.join(ROOT, 'desktop/macos/dmg.py'), config, image, plan.volumeName]);
    });
    await step('Verifying disk image integrity', () => run('/usr/bin/hdiutil', ['verify', image]));
    await step('Saving DMG', () => fsp.rename(image, plan.output));
    log(`DMG size: ${((await fsp.stat(plan.output)).size / 1024 / 1024).toFixed(1)} MiB`);
    return plan;
  } finally {
    log('Removing temporary disk image files');
    await fsp.rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await build(parseArguments(process.argv.slice(2)));
    console.log(`DMG: ${result.output}\nVersion: ${result.version}\nArchitecture: ${result.arch}`);
  } catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
}
