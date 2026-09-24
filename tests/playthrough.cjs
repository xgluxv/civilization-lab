const E = require('../src/engine');
const summaries = [];
for (const goal of Object.keys(E.GOALS)) {
  const s = E.createWorld({ seed: '远方来信', scenario: 'frontier' });
  E.command(s, { type: 'reign', civId: 0, goal });
  E.command(s, { type: 'policy', civId: 0, policy: goal === 'knowledge' ? 'scholar' : goal === 'alliance' ? 'merchant' : 'expansion' });
  const c = s.civs[0];
  const researchOrder = goal === 'knowledge' ? ['writing','astronomy','agronomy','tools','coinage','sailing','masonry','medicine','printing','engineering','governance','charter'] : ['agronomy','tools','writing','coinage','medicine','masonry','sailing','astronomy','governance','engineering','printing','charter'];
  for (let i = 0; i < 700 && c.alive && !s.victory; i++) {
    if (c.decision) {
      const options = E.DECISIONS[c.decision.kind].options;
      const choice = options.find(o => o.id === (goal === 'knowledge' ? 'study' : 'build') && E.afford(c, o.cost)) || options.find(o => E.afford(c, o.cost));
      E.command(s, { type: 'choice', civId: 0, decisionId: c.decision.id, choice: choice.id });
    }
    const next = researchOrder.find(id => E.researchStatus(s, 0, id).available);
    if (next) E.command(s, { type: 'research', civId: 0, research: next });
    if (s.year % 3 === 0) {
      for (const city of s.cities.filter(c => c.civId === 0 && c.queue.length < 1)) {
        const priorities = goal === 'knowledge' ? ['observatory','library','granary','lumbermill','farm','academy','market','hospital'] : ['granary','lumbermill','farm','market','library','hospital','workshop'];
        const id = priorities.find(id => E.buildingStatus(s, 0, city.id, id).available);
        if (id) E.command(s, { type: 'build', civId: 0, cityId: city.id, building: id });
      }
      if (s.cities.filter(c => c.civId === 0).length < 5) {
        const tile = s.tiles.filter(t => E.settlementStatus(s, 0, t.index).available).sort((a, b) => E.TERRAIN[b.type].food - E.TERRAIN[a.type].food)[0];
        if (tile) E.command(s, { type: 'settle', civId: 0, tile: tile.index });
      }
      if (goal === 'knowledge' && c.relics < 3) {
        const site = s.sites.find(t => E.explorationStatus(s, 0, t.id).available);
        if (site) E.command(s, { type: 'explore', civId: 0, siteId: site.id });
      }
      if (goal === 'alliance') for (const other of s.civs.filter(c => c.id !== 0 && c.alive)) {
        if (!s.relations[E.pairKey(0, other.id)].treaty && E.diplomacyStatus(s, 0, other.id, 'envoy').available) E.command(s, { type: 'diplomacy', civId: 0, targetId: other.id, action: 'envoy' });
      }
    }
    E.tick(s);
  }
  const summary = { goal, year: s.year, victory: s.victory, progress: E.goalProgress(s), research: c.research, resources: { food: c.food, wood: c.wood, wealth: c.wealth }, sites: c.relics, commands: s.commands.length };
  summaries.push(summary);
  console.log(JSON.stringify(summary));
  if (!s.victory) process.exitCode = 1;
  if (s.victory?.assisted) throw Error('Playthrough unexpectedly used assistance');
  if (JSON.stringify(E.deserialize(E.serialize(s))) !== JSON.stringify(s)) throw Error('Winning world did not replay exactly');
}
