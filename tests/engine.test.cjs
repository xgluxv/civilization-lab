const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function checkInvariants(s) {
  assert.equal(s.tiles.length, E.WIDTH * E.HEIGHT);
  assert.equal(s.civs.length, 6);
  for (const t of s.tiles) {
    assert.ok(t.owner >= -1 && t.owner < 6);
    if (t.owner >= 0) { assert.ok(E.isLand(t)); assert.ok(s.civs[t.owner].alive); }
  }
  const cityTiles = new Set();
  for (const city of s.cities) {
    assert.ok(!cityTiles.has(city.tile)); cityTiles.add(city.tile);
    assert.ok(s.civs[city.civId].alive);
    assert.equal(s.tiles[city.tile].owner, city.civId);
  }
  for (const c of s.civs) {
    for (const key of ['population', 'food', 'wood', 'ore', 'wealth', 'science', 'military', 'happiness']) {
      assert.ok(Number.isFinite(c[key]), `${c.name}.${key} is finite`);
      assert.ok(c[key] >= 0, `${c.name}.${key} is nonnegative`);
    }
    assert.equal(c.territory, s.tiles.filter(t => t.owner === c.id).length);
    assert.ok(c.happiness <= 100);
    assert.ok(c.tech >= 0 && c.tech < E.TECHS.length);
    if (c.alive) assert.ok(s.cities.some(city => city.civId === c.id));
  }
  assert.ok(s.events.length <= 260);
  assert.ok(s.history.length <= 601);
}

test('all scenarios and varied seeds have six valid, distinct starting capitals', () => {
  for (const scenario of Object.keys(E.SCENARIOS)) for (let i = 0; i < 15; i++) {
    const s = E.createWorld({ seed: `test-${i}`, scenario });
    checkInvariants(s);
    assert.equal(s.cities.length, 6);
    assert.equal(new Set(s.cities.map(c => c.tile)).size, 6);
  }
});

test('the same seed and commands produce byte-identical state', () => {
  const a = E.createWorld({ seed: '重复实验', scenario: 'frontier' });
  const b = E.createWorld({ seed: '重复实验', scenario: 'frontier' });
  for (const s of [a, b]) {
    E.tick(s, 25); E.command(s, { type: 'policy', civId: 2, policy: 'conquest' });
    E.tick(s, 20); E.command(s, { type: 'aid', civId: 0 });
    E.command(s, { type: 'config', fertility: 0.6, aggression: 0.9 });
    E.tick(s, 70); E.command(s, { type: 'rain' }); E.tick(s, 10);
  }
  assert.deepEqual(a, b);
});

test('replay and portable saves reproduce the full state including same-year commands', () => {
  const s = E.createWorld({ seed: '存档验证' });
  E.command(s, { type: 'aid', civId: 0 });
  E.command(s, { type: 'config', aggression: 0.8 });
  E.tick(s, 34); E.command(s, { type: 'rain' });
  E.tick(s, 88); E.command(s, { type: 'peace' });
  assert.deepEqual(E.replay(s), s);
  assert.deepEqual(E.deserialize(E.serialize(s)), s);
  const past = E.replay(s, 10);
  assert.equal(past.year, 10);
  assert.equal(past.commands.length, 2);
});

test('long runs preserve ownership, finite resources, and city invariants', () => {
  for (const scenario of Object.keys(E.SCENARIOS)) {
    const s = E.createWorld({ seed: 'long-run', scenario });
    for (let i = 0; i < 10; i++) { E.tick(s, 100); checkInvariants(s); }
  }
});

test('extreme settings remain stable over 300 years', () => {
  for (const fertility of [0.4, 1.8]) {
    const s = E.createWorld({ seed: 'extreme', scenario: 'frontier' });
    E.command(s, { type: 'config', fertility, aggression: 1, disasters: 1 });
    for (const c of s.civs) E.command(s, { type: 'policy', civId: c.id, policy: 'conquest' });
    E.tick(s, 300); checkInvariants(s);
  }
});

test('aid, weather and policy commands have explicit effects', () => {
  const s = E.createWorld(); const c = s.civs[0];
  const before = { food: c.food, wood: c.wood, wealth: c.wealth };
  E.command(s, { type: 'aid', civId: 0 });
  assert.equal(c.food, before.food + 80); assert.equal(c.wood, before.wood + 35); assert.equal(c.wealth, before.wealth + 50);
  E.command(s, { type: 'rain' }); assert.equal(s.climate.bumper, 5);
  E.command(s, { type: 'policy', civId: 0, policy: 'scholar' }); assert.equal(c.policy, 'scholar');
  const relation = s.relations['0:1']; relation.war = true;
  E.command(s, { type: 'peace' }); assert.equal(relation.war, false); assert.equal(relation.cooldown, 35);
});

test('invalid and malicious-looking imports are rejected without trusting arbitrary state', () => {
  for (const raw of ['null', '{}', '[]', 'not JSON', '{"__proto__":{"polluted":true}}']) assert.throws(() => E.deserialize(raw));
  const save = JSON.parse(E.serialize(E.createWorld()));
  for (const year of [-1, 1.1, 50001, '5']) assert.throws(() => E.deserialize(JSON.stringify({ ...save, year })));
  assert.throws(() => E.deserialize(JSON.stringify({ ...save, scenario: '__proto__' })));
  assert.throws(() => E.deserialize(JSON.stringify({ ...save, commands: [{ year: 0, action: { type: 'config', fertility: 1e20 } }] })));
  assert.throws(() => E.deserialize(JSON.stringify({ ...save, commands: [{ year: 1, action: { type: 'rain' } }] })));
  assert.throws(() => E.deserialize(JSON.stringify({ ...save, commands: [{ year: -1, action: { type: 'rain' } }] })));
  assert.equal({}.polluted, undefined);
});

test('invalid commands fail before changing configuration', () => {
  const s = E.createWorld(); const before = JSON.stringify(s);
  assert.throws(() => E.command(s, { type: 'config', fertility: 1.2, aggression: 8 }));
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => E.command(s, { type: 'policy', civId: 0, policy: '__proto__' }));
  assert.throws(() => E.tick(s, -1)); assert.throws(() => E.tick(s, 1.5));
});

test('capturing the last city eliminates its former owner and closes its wars', () => {
  const s = E.createWorld();
  for (const t of s.tiles) t.owner = -1;
  s.cities = s.cities.slice(0, 2);
  for (let i = 0; i < 2; i++) {
    const tile = 400 + i;
    s.cities[i].tile = tile;
    s.tiles[tile].type = 'plain'; s.tiles[tile].owner = i;
  }
  for (let i = 2; i < 6; i++) { s.civs[i].alive = false; s.civs[i].population = 0; s.civs[i].military = 0; }
  s.civs[0].military = 1000; s.civs[0].population = 300; s.civs[0].wealth = 10000;
  s.civs[1].military = 0; s.civs[1].ore = 0; s.civs[1].wealth = 0;
  s.relations['0:1'].war = true;
  E.tick(s, 3);
  assert.equal(s.civs[1].alive, false);
  assert.equal(s.civs[1].population, 0);
  assert.equal(s.cities[1].civId, 0);
  assert.equal(s.relations['0:1'].war, false);
  assert.ok(s.events.some(e => e.text.includes('失去最后一座城市')));
  checkInvariants(s);
});
