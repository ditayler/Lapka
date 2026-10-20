import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const builder = await import('../scripts/build-dmg.mjs').catch(() => ({}));

async function bundle(info, check) {
  const dir = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka dmg space-')));
  const app = path.join(dir, 'Lapka.app');
  try {
    await fsp.mkdir(path.join(app, 'Contents/Resources'), { recursive: true });
    await fsp.writeFile(path.join(app, 'Contents/Resources/build.json'), JSON.stringify(info));
    await check(app, dir);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}

test('DMG names and volume use the version and architecture of the packaged app', async () => {
  assert.equal(typeof builder.planDmg, 'function');
  await bundle({ app: 'Lapka', version: '2.3.4-beta.1', arch: 'x64' }, async (app, dir) => {
    const plan = await builder.planDmg({ app });
    assert.equal(plan.output, path.join(dir, 'Lapka-2.3.4-beta.1-macos-x64.dmg'));
    assert.equal(plan.volumeName, 'Lapka 2.3.4-beta.1');
    assert.equal((await builder.planDmg({ app, outputDir: path.join(dir, 'release') })).output,
      path.join(dir, 'release/Lapka-2.3.4-beta.1-macos-x64.dmg'));
  });
});

test('DMG packaging rejects missing bundles with an actionable build command', async () => {
  assert.equal(typeof builder.planDmg, 'function');
  await assert.rejects(builder.planDmg({ app: '/does-not-exist/Lapka.app' }), /build:macos/);
});

test('DMG packaging rejects unsafe metadata and output inside the source app', async () => {
  assert.equal(typeof builder.planDmg, 'function');
  for (const info of [
    { app: 'Other', version: '1.0.0', arch: 'arm64' },
    { app: 'Lapka', version: '../../escape', arch: 'arm64' },
    { app: 'Lapka', version: '1.0.0', arch: '../../escape' },
  ]) await bundle(info, async app => { await assert.rejects(builder.planDmg({ app }), /metadata/); });
  await bundle({ app: 'Lapka', version: '1.0.0', arch: 'arm64' }, async app => {
    await assert.rejects(builder.planDmg({ app, outputDir: path.join(app, 'Contents') }), /inside/);
    const alias = path.join(path.dirname(app), 'app-alias');
    await fsp.symlink(app, alias);
    await assert.rejects(builder.planDmg({ app, outputDir: path.join(alias, 'Contents/release') }), /inside/);
    const caseAlias = path.join(path.dirname(app), 'lapka.app');
    if (await fsp.stat(caseAlias).catch(() => null)) {
      await assert.rejects(builder.planDmg({ app, outputDir: path.join(caseAlias, 'Contents/release') }), /inside/);
    }
  });
});

test('DMG command accepts a custom app and destination directory and rejects unknown flags', () => {
  assert.equal(typeof builder.parseArguments, 'function');
  const options = builder.parseArguments(['--app=build/Lapka.app', '--output-dir=release']);
  assert.equal(options.app, path.resolve('build/Lapka.app'));
  assert.equal(options.outputDir, path.resolve('release'));
  assert.throws(() => builder.parseArguments(['--version=2.0.0']), /Unknown/);
  assert.throws(() => builder.parseArguments(['--app=not-an-app']), /\.app/);
});

// Opt in with a real signed bundle. Check the delivered image, not just settings.
test('styled DMG installs an intact app and records its Finder layout', {
  skip: process.platform !== 'darwin' || !process.env.LAPKA_DMG_TEST_APP,
  timeout: 240000,
}, async () => {
  const source = await fsp.realpath(process.env.LAPKA_DMG_TEST_APP);
  const original = await fsp.readFile(path.join(source, 'Contents/Resources/build.json'));
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lapka installer-'));
  const mount = path.join(dir, 'mounted');
  let mounted = false;
  try {
    const plan = await builder.build({ app: source, outputDir: dir });
    await fsp.mkdir(mount);
    await exec('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, plan.output]);
    mounted = true;
    assert.equal(await fsp.readlink(path.join(mount, 'Applications')), '/Applications');
    assert.ok((await fsp.stat(path.join(mount, '.DS_Store'))).size > 0);
    assert.ok((await fsp.stat(path.join(mount, '.background.tiff'))).size > 0);
    const { stdout: dimensions } = await exec('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight',
      path.join(mount, '.background.tiff')]);
    assert.ok(Number(/pixelWidth: (\d+)/.exec(dimensions)?.[1]) >= 3840, 'background covers enlarged 4K Finder windows');
    assert.ok(Number(/pixelHeight: (\d+)/.exec(dimensions)?.[1]) >= 2160, 'background covers enlarged 4K Finder windows');
    const python = path.resolve('.dev/build-cache/dmgbuild-1.6.5/bin/python3');
    await exec(python, ['-I', '-c', `
import sys
from ds_store import DSStore
with DSStore.open(sys.argv[1], 'r') as store:
    assert store['.']['icvl'] == (b'type', b'icnv')
    assert store['.']['icvp']['backgroundType'] == 2
    assert not store['.']['bwsp']['ShowToolbar']
    left, right = store['Lapka.app']['Iloc'], store['Applications']['Iloc']
    assert left[0] < right[0] and left[1] == right[1]
    for name in ('.background.tiff', '.VolumeIcon.icns'):
        assert store[name]['Iloc'][0] > 4096, 'support files stay outside the installer canvas'
`, path.join(mount, '.DS_Store')]);
    const installed = path.join(dir, 'Applications/Lapka.app');
    await fsp.mkdir(path.dirname(installed));
    await exec('/usr/bin/ditto', [path.join(mount, 'Lapka.app'), installed]);
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed]);
    assert.deepEqual(await fsp.readFile(path.join(installed, 'Contents/Resources/build.json')), original);
    assert.deepEqual(await fsp.readFile(path.join(source, 'Contents/Resources/build.json')), original);
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
  } finally {
    if (mounted) await exec('/usr/bin/hdiutil', ['detach', mount]);
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
