const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const errors = [];
const consoleBridge = new VirtualConsole();
consoleBridge.on('jsdomError', error => errors.push(error.message));
consoleBridge.on('error', error => errors.push(String(error)));
let frames = [], nextObjectUrl = 0;
const objectUrls = new Map();
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'http://localhost:8765', pretendToBeVisual: true, virtualConsole: consoleBridge,
  beforeParse(window) {
    window.requestAnimationFrame = cb => { frames.push(cb); return frames.length; };
    window.cancelAnimationFrame = () => {};
    window.ResizeObserver = class { observe() {} disconnect() {} };
    window.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: text => ({ width: String(text).length * 8 }) }, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
    window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: this.id === 'world-map' ? 500 : 230, width: 800, height: this.id === 'world-map' ? 500 : 230 }; };
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    window.URL.createObjectURL = blob => { const url = 'blob:mock-' + nextObjectUrl++; objectUrls.set(url, blob); return url; };
    window.URL.revokeObjectURL = url => objectUrls.delete(url);
    window.Blob = class { constructor(parts) { this.source = parts.join(''); } };
    window.Worker = class {
      constructor(url) { this.source = objectUrls.get(url).source; this.terminated = false; }
      postMessage(data) {
        const self = { postMessage: payload => { if (!this.terminated) this.onmessage?.({ data: JSON.parse(JSON.stringify(payload)) }); } };
        const context = { self }; vm.createContext(context);
        try { vm.runInContext(this.source, context); self.onmessage({ data: JSON.parse(JSON.stringify(data)) }); } catch (error) { this.onerror?.(error); }
      }
      terminate() { this.terminated = true; }
    };
  }
});
const window = dom.window, document = window.document;
const $ = id => document.getElementById(id);
const click = selector => { const el = document.querySelector(selector); assert.ok(el, `missing ${selector}`); assert.ok(!el.disabled, `disabled ${selector}: ${el.textContent}`); el.click(); };
const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new window.Event('change', { bubbles: true })); };
const save = () => { click('#save'); return JSON.parse(window.localStorage.getItem('civilization-lab-v2')); };
const check = label => { assert.deepEqual(errors, [], label); console.log('PASS', label); };

assert.equal($('year').textContent, '0000');
assert.equal(document.querySelectorAll('.building-card').length, 10);
assert.equal(document.querySelectorAll('.decision-choice').length, 3);
click('#play'); assert.equal($('play').getAttribute('aria-pressed'), 'false');
click('#campaign-settings'); change('player-choice', '0'); change('goal-choice', 'knowledge'); click('#begin-reign');
click('[data-choice="build"]');
assert.equal($('decision-banner').hidden, true);
click('#tab-research'); assert.equal(document.querySelectorAll('.research-node').length, 12);
click('[data-research="writing"]');
click('#tab-cities'); click('[data-build="library"]');
assert.ok($('command-body').textContent.includes('图书馆 Lv.1'));
click('#advance'); assert.equal($('year').textContent, '0010');
assert.equal(document.querySelector('.build-queue').textContent.trim(), '选择一项工程，让城市开始生长。');
assert.ok(document.querySelector('[data-build="library"]').textContent.includes('升级'));
check('onboarding, decision, research, construction and 10-year advancement');

click('#tab-explore'); assert.equal(document.querySelectorAll('.site-card').length, 20);
const possible = [...document.querySelectorAll('[data-explore]')].find(el => !el.disabled); assert.ok(possible); possible.click();
assert.ok(document.querySelector('.expedition-status'));
click('#advance'); assert.equal($('year').textContent, '0018');
assert.equal($('decision-banner').hidden, false);
const choice = [...document.querySelectorAll('[data-choice]')].find(el => !el.disabled); choice.click();
click('#tab-diplomacy'); assert.equal(document.querySelectorAll('.diplomacy-row').length, 5);
const envoy = [...document.querySelectorAll('[data-diplomacy="envoy"]')].find(el => !el.disabled); assert.ok(envoy); const envoyTarget = envoy.dataset.target; envoy.click();
assert.equal(document.querySelector(`[data-diplomacy="envoy"][data-target="${envoyTarget}"]`).disabled, true);
click('#tab-goals'); assert.equal(document.querySelectorAll('.objective').length, 4);
check('expedition, decision auto-pause, diplomacy and goal panels');

const saved = save();
click('#advance'); const after = Number($('year').textContent); assert.ok(after > saved.year);
click('#load'); assert.equal(Number($('year').textContent), saved.year);
assert.equal($('busy').hidden, true);
const restored = save(); assert.deepEqual(restored, saved);
$('replay-year').value = '5'; click('#replay'); assert.equal($('year').textContent, '0005');
click('#recover'); assert.equal(Number($('year').textContent), saved.year);
click('#recover'); assert.equal($('year').textContent, '0005');
check('actual bundled worker code restores and replays saves');

click('#zoom-in'); click('#zoom-out'); click('#zoom-reset');
click('#tab-cities');
$('world-map').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
$('world-map').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
assert.ok($('tile-info').textContent.includes('草原'));
click('#help-button'); assert.equal($('help-dialog').open, true); click('#close-help');
click('#generate'); assert.equal($('campaign-dialog').open, true);
change('player-choice', '4'); change('goal-choice', 'alliance'); click('#begin-reign');
assert.equal($('reign-name').textContent, '星辉学邦');
click('[data-choice="store"]');
click('#tab-research'); click('[data-research="agronomy"]');
assert.equal(save().commands.find(c => c.action.type === 'research').action.civId, 4);
check('map controls, help, new campaign and nondefault player');

click('#play');
assert.equal($('play').getAttribute('aria-pressed'), 'true');
for (let i = 0; i < 6; i++) { const pending = frames; frames = []; pending.forEach(cb => cb(1000 + i * 250)); }
assert.ok(Number($('year').textContent) > 0);
click('#play'); assert.equal($('play').getAttribute('aria-pressed'), 'false');
check('animation time advancement and pause');

const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
assert.equal(ids.length, new Set(ids).size);
assert.ok(!html.includes('/*__APP__*/') && !html.includes('/*__CONTENT__*/'));
console.log('PASS unique DOM IDs and complete single-file build');
window.close();
