import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

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
