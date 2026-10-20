import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fsp from 'node:fs/promises';

const src = await fsp.readFile(new URL('../web/airplay.js', import.meta.url), 'utf8').catch(() => '');
function setup({ supported = true, post = async () => ({ url: 'http://lan/video.mp4', token: 'one' }) } = {}) {
  const window = {};
  vm.runInNewContext(src, { window, Date });
  assert.equal(typeof window.LapkaAirplay, 'function', 'AirPlay controller is available');
  const video = new EventTarget(), button = new EventTarget();
  const events = [];
  if (supported) video.webkitShowPlaybackTargetPicker = () => events.push('picker');
  video.webkitCurrentPlaybackTargetIsWireless = false;
  button.classList = { toggle: (_, value) => { button.active = value; } };
  button.setAttribute = (key, value) => { button[key] = value; };
  const control = new window.LapkaAirplay({ video, button, post,
    onNative: url => events.push(url), onLocal: () => events.push('local'), onError: () => events.push('error') });
  return { control, video, button, events };
}

test('AirPlay hides unsupported controls without creating network sessions', async () => {
  const { control, button } = setup({ supported: false, post: () => { throw Error('must not request'); } });
  await control.prepare({ id: 'first' });
  assert.equal(button.hidden, true);
});

test('AirPlay hands off a prepared URL and opens the picker within the click gesture', async () => {
  const { control, button, events, video } = setup();
  assert.equal(button.disabled, true);
  await control.prepare({ id: 'first', audio: { index: 1 } });
  assert.equal(button.disabled, false);
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(events, ['http://lan/video.mp4', 'picker']);
  video.webkitCurrentPlaybackTargetIsWireless = true;
  video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
  assert.equal(button.active, true);
  assert.equal(button['aria-pressed'], 'true');
  video.webkitCurrentPlaybackTargetIsWireless = false;
  video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
  assert.equal(control.native, false);
  assert.equal(events.at(-1), 'local');
});

test('a late AirPlay preparation cannot replace the next episode or survive stop', async () => {
  const pending = [], revoked = [];
  const { control, button } = setup({ post: path => path.includes('/stop?')
    ? (revoked.push(path), Promise.resolve({})) : new Promise(resolve => pending.push(resolve)) });
  const first = control.prepare({ id: 'first' });
  const second = control.prepare({ id: 'second' });
  pending[1]({ url: 'http://lan/second.mp4', token: 'second' });
  await second;
  pending[0]({ url: 'http://lan/first.mp4', token: 'first' });
  await first;
  assert.equal(control.session.token, 'second');
  assert.ok(revoked.some(p => p.includes('token=first')));
  control.clear();
  assert.equal(button.disabled, true);
  assert.equal(control.session, null);
  assert.ok(revoked.some(p => p.includes('token=second')));
});

test('preparation errors are shown on click and do not prevent a later source', async () => {
  let fail = true;
  const { control, button, events } = setup({ post: async () => {
    if (fail) throw Error('no network');
    return { url: 'http://lan/next.mp4', token: 'next' };
  } });
  await control.prepare({ id: 'first' });
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(events, ['error']);
  fail = false;
  await control.prepare({ id: 'next' });
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(events.slice(-2), ['http://lan/next.mp4', 'picker']);
});

test('an intentional stop is not undone by a delayed wireless disconnect event', async () => {
  const { control, video, events } = setup();
  await control.prepare({ id: 'first' });
  video.webkitCurrentPlaybackTargetIsWireless = true;
  video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
  control.clear();
  video.webkitCurrentPlaybackTargetIsWireless = false;
  video.dispatchEvent(new Event('webkitcurrentplaybacktargetiswirelesschanged'));
  assert.deepEqual(events, []);
});

const app = await fsp.readFile(new URL('../web/app.js', import.meta.url), 'utf8');
function appFlow() {
  const calls = [], posts = [];
  const state = { list: [], positions: {}, set: {} };
  const node = () => ({ classList: { add() {}, remove() {}, contains() { return false; } } });
  const video = new EventTarget();
  Object.assign(video, { src: '', currentTime: 12, paused: false, pause() {}, load() {}, play: async () => {},
    webkitShowPlaybackTargetPicker() { calls.push('picker'); }, getAttribute() { return this.src; }, removeAttribute() { this.src = ''; } });
  const button = new EventTarget();
  button.classList = { toggle() {} }; button.setAttribute = () => {};
  const context = { window: {}, Date, video, state, calls,
    playToken: 0, sourceGeneration: 0, hls: null, dubsInfo: null, skipNow: null, autoSwitch: false,
    loaded: null, restoredIdle: false,
    skipEl: {}, endCard: node(), emptyEl: node(), stage: node(), ghostName: {},
    cur: () => state.current, idxOf: it => state.list.indexOf(it),
    fadeOut: () => Promise.resolve(), fadeIn: () => () => {},
    posKey: () => 'position', loadSource: (it, src) => calls.push([it.name, src.play]),
  };
  for (const name of ['diary', 'markPos', 'hidePauseInfo', 'hideNotice', 'paintTitle', 'paintActive', 'syncAudioButton', 'syncStatus', 'mediaMeta', 'revealCurrent', 'deckShow', 'syncSubsButton', 'syncQualityButton', 'applySubs', 'prefetchNext', 'hideProgress', 'render']) context[name] = () => {};
  vm.createContext(context);
  vm.runInContext(src, context);
  const native = app.slice(app.indexOf('  onNative: url => {') + '  onNative: url => {'.length, app.indexOf('\n  onLocal:'));
  vm.runInContext('function onNative(url) {' + native.slice(0, native.lastIndexOf('},')) + '}', context);
  context.airplay = new context.window.LapkaAirplay({ video, button, post: async p => {
    posts.push(p); return { url: 'http://lan/old.mp4', token: 'old' };
  }, onNative: context.onNative, onLocal: () => calls.push('local'), onError: () => {} });
  for (const [start, end] of [
    ['async function playItem(', '/* Puts a source'],
    ['function stopPlayback()', '/* The overlay while'],
    ['function removeItem(', '/* ═══════════════ dragging'],
  ]) vm.runInContext(app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start))), context);
  return { context, calls, posts, state, video, button };
}

test('starting another episode disables the old AirPlay handoff while resolution is pending', async () => {
  const { context, state, button, calls } = appFlow();
  await context.airplay.prepare({ id: 'old' });
  let resolve;
  context.sourceFor = () => new Promise(r => { resolve = r; });
  const next = { name: 'Next', number: 2 };
  state.list = [next];
  const pending = context.playItem(next);
  // A real disabled button cannot be clicked, even while the next URL resolves.
  if (!button.disabled) button.dispatchEvent(new Event('click'));
  resolve({ play: '/api/stream/next.mp4' });
  await pending;
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'Next'), JSON.stringify(calls));
  assert.ok(!calls.includes('picker'));
});

test('removing the last playing row stops media and revokes its AirPlay URL', async () => {
  const { context, state, button, posts, video } = appFlow();
  const item = { name: 'Last' };
  state.list = [item]; state.current = item;
  video.src = 'http://lan/old.mp4';
  await context.airplay.prepare({ id: 'old' });
  context.removeItem(item);
  assert.equal(context.airplay.session, null);
  assert.equal(button.disabled, true);
  assert.equal(video.src, '');
  assert.ok(posts.some(p => p.includes('/stop?token=old')));
});
