const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const Legacy = require('../src/legacy-engine.js');
const action = (s, a) => E.command(s, { civId: s.playerId, ...a });
const rich = s => { Object.assign(s.civs[0], { food: 10000, wood: 10000, ore: 10000, wealth: 10000, insight: 10000, tech: 5, population: 500 }); return s; };

test('construction charges once, finishes over time, and has a measurable effect', () => {
  const s = E.createWorld(), c = s.civs[0], city = s.cities[0];
  const initial = c.wood;
  action(s, { type: 'build', cityId: city.id, building: 'granary' });
  assert.equal(c.wood, initial - E.BUILDINGS.granary.cost.wood);
  assert.equal(city.buildings.granary, undefined);
  E.tick(s, 7);
  assert.equal(city.buildings.granary, 1);
  assert.equal(city.queue.length, 0);
  assert.equal(E.bonuses(s, c).food, .06);
  assert.equal(E.bonuses(s, c).storage, .2);
});

test('unaffordable or locked building commands are atomic', () => {
  const s = E.createWorld(), cityId = s.cities[0].id;
  for (const building of ['academy', '__proto__', 'constructor', null]) {
    const before = JSON.stringify(s);
    assert.throws(() => action(s, { type: 'build', cityId, building }));
    assert.equal(JSON.stringify(s), before);
  }
  s.civs[0].wealth = 0;
  const before = JSON.stringify(s);
  assert.throws(() => action(s, { type: 'build', cityId, building: 'granary' }));
  assert.equal(JSON.stringify(s), before);
});

test('construction cancellation removes dependent upgrades and refunds only unused work', () => {
  const s = rich(E.createWorld()), city = s.cities[0];
  action(s, { type: 'build', cityId: city.id, building: 'granary' });
  action(s, { type: 'build', cityId: city.id, building: 'granary' });
  action(s, { type: 'build', cityId: city.id, building: 'lumbermill' });
  const first = city.queue[0], second = city.queue[1]; first.progress = first.work / 2;
  const wood = s.civs[0].wood;
  action(s, { type: 'cancelBuild', cityId: city.id, index: 0 });
  assert.equal(s.civs[0].wood, wood + Math.floor(first.cost.wood * .4) + Math.floor(second.cost.wood * .8));
  assert.deepEqual(city.queue.map(q => q.building), ['lumbermill']);
  action(s, { type: 'build', cityId: city.id, building: 'granary' });
  assert.equal(city.queue[1].level, 1);
});

test('research prerequisites, era gates and permanent bonuses work', () => {
  const s = E.createWorld(), c = s.civs[0];
  assert.throws(() => action(s, { type: 'research', research: 'astronomy' }));
  action(s, { type: 'research', research: 'writing' });
  assert.equal(c.insight, 5);
  assert.equal(E.bonuses(s, c).research, .15);
  assert.throws(() => action(s, { type: 'research', research: 'writing' }));
  c.insight = 1000;
  assert.throws(() => action(s, { type: 'research', research: 'astronomy' }));
  c.tech = 1;
  action(s, { type: 'research', research: 'astronomy' });
  assert.equal(E.bonuses(s, c).research, .35);
  assert.ok(E.buildingStatus(s, 0, s.cities[0].id, 'observatory').reason.includes('资源'));
});

test('world wonders have a single global reservation and cancellation releases it', () => {
  const s = rich(E.createWorld()); s.civs[0].research = ['writing','astronomy'];
  action(s, { type: 'build', cityId: s.cities[0].id, building: 'observatory' });
  s.civs[1].research = ['writing','astronomy']; Object.assign(s.civs[1], { wood: 1000, ore: 1000, wealth: 1000 });
  assert.equal(E.buildingStatus(s, 1, s.cities[1].id, 'observatory').available, false);
  action(s, { type: 'cancelBuild', cityId: s.cities[0].id, index: 0 });
  assert.equal(E.buildingStatus(s, 1, s.cities[1].id, 'observatory').available, true);
});

test('decisions apply a single choice and timed buffs expire', () => {
  const s = E.createWorld(), c = s.civs[0], id = c.decision.id;
  action(s, { type: 'choice', decisionId: id, choice: 'build' });
  assert.equal(c.decision, null); assert.equal(c.food, 80); assert.equal(c.wood, 82);
  assert.equal(E.bonuses(s, c).construction, .35);
  assert.throws(() => action(s, { type: 'choice', decisionId: id, choice: 'build' }));
  E.tick(s, 12);
  assert.equal(E.bonuses(s, c).construction, 0);
});

test('expeditions reserve a site, arrive, and resolve deterministically', () => {
  const s = E.createWorld({ seed: 'expedition' });
  const site = s.sites.find(site => E.explorationStatus(s, 0, site.id).available);
  assert.ok(site);
  const status = E.explorationStatus(s, 0, site.id), food = s.civs[0].food;
  action(s, { type: 'explore', siteId: site.id });
  assert.equal(s.civs[0].food, food - 30); assert.equal(site.explorerId, 0);
  assert.throws(() => action(s, { type: 'explore', siteId: site.id }));
  const second = E.deserialize(E.serialize(s));
  E.tick(s, status.duration); E.tick(second, status.duration);
  assert.deepEqual(s, second);
  assert.equal(site.explorerId, -1);
  assert.ok(site.claimedBy === 0 || site.cooldown > s.year);
});

test('envoys cost resources, cannot be spammed, and replay identically', () => {
  const s = E.createWorld(); const initial = s.relations['0:1'].value;
  action(s, { type: 'diplomacy', targetId: 1, action: 'envoy' });
  assert.equal(s.relations['0:1'].value, initial + 22);
  assert.equal(s.civs[0].wealth, 45);
  assert.throws(() => action(s, { type: 'diplomacy', targetId: 1, action: 'envoy' }));
  assert.throws(() => action(s, { type: 'diplomacy', targetId: 1, action: 'declare' }));
  assert.deepEqual(E.deserialize(E.serialize(s)), s);
});

test('player cities require deliberate founding and settlement validates ownership and distance', () => {
  const s = rich(E.createWorld()), c = s.civs[0];
  const capital = s.cities[0].tile;
  assert.equal(E.settlementStatus(s, 0, capital).available, false);
  const tile = s.tiles.find(t => E.isLand(t) && t.type !== 'mountain' && t.owner === -1 && s.cities.every(city => E.distance(s, t.index, city.tile) >= 4));
  tile.owner = 0;
  const count = s.cities.length;
  assert.equal(E.settlementStatus(s, 0, tile.index).available, true);
  action(s, { type: 'settle', tile: tile.index });
  assert.equal(s.cities.length, count + 1); assert.equal(s.cities.at(-1).capital, false);
  assert.equal(s.cities.at(-1).civId, c.id);
});

test('version one saves retain exact resources and land before new play begins', () => {
  const old = Legacy.createWorld({ seed: 'migration' });
  Legacy.tick(old, 75); Legacy.command(old, { type: 'aid', civId: 0 });
  const modern = E.deserialize(Legacy.serialize(old));
  assert.equal(modern.version, 2); assert.equal(modern.year, old.year);
  assert.deepEqual(modern.tiles, old.tiles);
  for (const c of old.civs) for (const key of ['population','food','wood','wealth','ore','tech','military','science']) assert.equal(modern.civs[c.id][key], c[key]);
  action(modern, { type: 'choice', decisionId: modern.civs[0].decision.id, choice: 'store' });
  action(modern, { type: 'research', research: 'tools' });
  E.tick(modern, 30);
  assert.deepEqual(E.deserialize(E.serialize(modern)), modern);
  assert.throws(() => E.replay(modern, 74));
});

test('new commands survive mixed save and replay timelines', () => {
  const s = E.createWorld();
  action(s, { type: 'reign', goal: 'knowledge' });
  action(s, { type: 'choice', decisionId: s.civs[0].decision.id, choice: 'build' });
  action(s, { type: 'research', research: 'writing' });
  action(s, { type: 'build', cityId: s.cities[0].id, building: 'library' });
  E.tick(s, 12); action(s, { type: 'aid' });
  action(s, { type: 'build', cityId: s.cities[0].id, building: 'granary' });
  action(s, { type: 'cancelBuild', cityId: s.cities[0].id, index: 0 });
  E.tick(s, 30);
  assert.deepEqual(E.replay(s), s);
  assert.deepEqual(E.deserialize(E.serialize(s)), s);
  assert.equal(s.sandboxUse, 1);
});

test('victory requires all live conditions and records assistance without stopping simulation', () => {
  const s = rich(E.createWorld()); s.goal = 'alliance';
  s.civs[0].peaceYears = 40;
  s.cities[0].buildings = { granary: 3, lumbermill: 3, farm: 3, library: 1 };
  for (const r of Object.values(s.relations)) if (r.a === 0 || r.b === 0) r.treaty = true;
  assert.equal(E.goalProgress(s).every(g => g.complete), true);
  action(s, { type: 'aid' });
  assert.ok(s.victory); assert.equal(s.victory.assisted, true);
  E.tick(s, 2); assert.equal(s.year, 2);
});

test('captured cities transfer buildings and continue queued work under the new owner', () => {
  const s = rich(E.createWorld());
  s.cities[0].buildings = { granary: 1 }; action(s, { type: 'build', cityId: s.cities[0].id, building: 'lumbermill' });
  const city = s.cities[0]; city.civId = 1; s.tiles[city.tile].owner = 1;
  E.tick(s, 10);
  assert.equal(city.buildings.lumbermill, 1);
  assert.ok(E.bonuses(s, s.civs[1]).food > 0);
  assert.equal(E.buildingStatus(s, 0, city.id, 'granary').available, false);
});

test('each playable civilization has local exploration and preserves its command authority', () => {
  for (let civId = 0; civId < 6; civId++) {
    const s = E.createWorld();
    E.command(s, { type: 'reign', civId, goal: 'knowledge' });
    assert.equal(s.playerId, civId);
    assert.ok(s.sites.some(site => E.explorationStatus(s, civId, site.id).available));
    E.command(s, { type: 'research', civId, research: 'writing' });
    assert.throws(() => E.command(s, { type: 'research', civId: (civId + 1) % 6, research: 'writing' }));
    assert.deepEqual(E.deserialize(E.serialize(s)), s);
  }
});

test('five-year rain intervention affects five harvests', () => {
  const s = E.createWorld();
  E.command(s, { type: 'config', disasters: 0 });
  E.command(s, { type: 'rain' });
  for (let year = 1; year <= 5; year++) { E.tick(s); assert.equal(s.climate.bumper, 5 - year); }
});

test('construction, research and expeditions remain bounded in a 1000-year mature world', () => {
  const s = E.createWorld({ seed: 'mature-expansion', scenario: 'frontier' });
  E.tick(s, 1000);
  let wonders = 0;
  for (const city of s.cities) {
    assert.ok(city.queue.length <= 3);
    for (const [id, level] of Object.entries(city.buildings)) {
      assert.ok(level >= 1 && level <= E.BUILDINGS[id].max);
      if (id === 'observatory') wonders++;
    }
    for (const q of city.queue) {
      assert.ok(q.progress >= 0 && q.progress < q.work);
      if (q.building === 'observatory') wonders++;
    }
  }
  assert.ok(wonders <= 1);
  assert.equal(new Set(s.expeditions.map(e => e.civId)).size, s.expeditions.length);
  for (const c of s.civs) {
    assert.equal(new Set(c.research).size, c.research.length);
    assert.ok(c.insight >= 0 && Number.isFinite(c.insight));
    assert.ok(c.decisions.length <= 100);
  }
});
