import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, openLapka } from './browser.mjs';

const skip = !findChrome() && 'no Chrome found';
const inspect = `
  for (let i=0; i<100 && document.querySelector('#empty').classList.contains('hide'); i++) await __tick();
  document.querySelector('#stage').classList.remove('is-empty');
  const mode=document.querySelector('#btnPipMode'), pip=document.querySelector('#btnPip');
  const full=document.querySelector('#btnFull');
  mode.click();
  __report({ modeVisible:mode.getClientRects().length>0, modeDisabled:mode.disabled,
    menuOpen:document.querySelector('#pipMenu').classList.contains('open'),
    buttons:[...document.querySelectorAll('#pipSeg button')].filter(b=>b.getClientRects().length).length,
    width:pip.getBoundingClientRect().width, normalWidth:full.getBoundingClientRect().width, errors:__errors });
`;

test('macOS host presents one normal-sized PiP button without a mode selector', { skip }, async () => {
  const r = await openLapka('pip-native-button', inspect, {
    init: 'window.webkit={messageHandlers:{windowChrome:{}}};',
    seed: { 'lapka.pipMode': 'document' }, budget: 8000,
  });
  assert.equal(r.fatal || r.stalled, undefined, JSON.stringify(r));
  assert.deepEqual(r.errors, []);
  assert.equal(r.modeVisible, false);
  assert.equal(r.modeDisabled, true);
  assert.equal(r.menuOpen, false);
  assert.equal(r.buttons, 1);
  assert.equal(r.width, r.normalWidth);
});

test('the browser keeps its PiP mode selector and menu', { skip }, async () => {
  const r = await openLapka('pip-browser-selector', inspect, { budget: 8000 });
  assert.equal(r.fatal || r.stalled, undefined, JSON.stringify(r));
  assert.deepEqual(r.errors, []);
  assert.equal(r.modeVisible, true);
  assert.equal(r.modeDisabled, false);
  assert.equal(r.menuOpen, true);
  assert.equal(r.buttons, 4); // Main action, selector, two menu choices.
});
