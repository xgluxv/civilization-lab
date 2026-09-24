(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./content.js') : root.CivContent, typeof module === 'object' && module.exports ? require('./legacy-engine.js') : root.CivLabV1);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Content, Legacy) {
  'use strict';

  const VERSION = 2;
  const { BRANCHES, RESEARCH, BUILDINGS, SITES, DECISIONS, GOALS, RESOURCE_NAMES } = Content;
  const WIDTH = 64, HEIGHT = 40;
  const TERRAIN = {
    ocean: { name: '海洋', food: 0, wood: 0, ore: 0, capacity: 0 },
    coast: { name: '浅海', food: 0, wood: 0, ore: 0, capacity: 0 },
    plain: { name: '草原', food: 1.65, wood: 0.14, ore: 0.10, capacity: 34 },
    forest: { name: '森林', food: 0.9, wood: 1.2, ore: 0.12, capacity: 22 },
    hill: { name: '丘陵', food: 0.8, wood: 0.25, ore: 0.7, capacity: 24 },
    mountain: { name: '山地', food: 0.28, wood: 0.12, ore: 1.5, capacity: 10 },
    desert: { name: '荒漠', food: 0.36, wood: 0.06, ore: 0.45, capacity: 12 }
  };
  const CIVS = [
    { name: '晨曦联邦', short: '晨曦', color: '#e4b760', policy: 'balanced', capital: '曙光城', names: ['金穗港', '望日台', '新原', '长明', '日落湾'] },
    { name: '苍林议会', short: '苍林', color: '#66c5a1', policy: 'scholar', capital: '常青城', names: ['橡木谷', '雨歌', '青石', '森语', '溪岸'] },
    { name: '潮汐同盟', short: '潮汐', color: '#66b3e8', policy: 'merchant', capital: '海镜城', names: ['白帆港', '风鸣', '远汐', '银沙', '海岬'] },
    { name: '赤岩王国', short: '赤岩', color: '#e58279', policy: 'conquest', capital: '赤堡', names: ['铁门', '烽火台', '玄石', '红河', '铜山'] },
    { name: '星辉学邦', short: '星辉', color: '#b49bdf', policy: 'scholar', capital: '观星城', names: ['月井', '长夜', '银环', '星原', '天穹'] },
    { name: '琥珀公社', short: '琥珀', color: '#d6a27c', policy: 'expansion', capital: '麦田城', names: ['暖丘', '秋原', '蜜河', '丰谷', '琥珀湾'] }
  ];
  const POLICIES = {
    balanced: { name: '均衡发展', description: '兼顾粮食、贸易与科技。', farm: 0.43, craft: 0.27, research: 0.14, military: 0.16, trade: 1, expansion: 1 },
    scholar: { name: '学术优先', description: '增加研究投入，较少征兵。', farm: 0.39, craft: 0.23, research: 0.28, military: 0.10, trade: 1, expansion: 0.85 },
    merchant: { name: '通商优先', description: '贸易收益提高，工商业更活跃。', farm: 0.39, craft: 0.34, research: 0.16, military: 0.11, trade: 1.65, expansion: 0.9 },
    expansion: { name: '开拓优先', description: '重视粮食与新城建设。', farm: 0.49, craft: 0.26, research: 0.12, military: 0.13, trade: 0.95, expansion: 1.7 },
    conquest: { name: '军事优先', description: '增加兵员与军备，战争倾向提高。', farm: 0.40, craft: 0.23, research: 0.09, military: 0.28, trade: 0.75, expansion: 1.1 }
  };
  const TECHS = [
    { name: '定居时代', cost: 180 },
    { name: '灌溉技术', cost: 430 },
    { name: '青铜冶炼', cost: 760 },
    { name: '文字与学校', cost: 1200 },
    { name: '商路网络', cost: 1750 },
    { name: '机械工坊', cost: 2500 },
    { name: '科学方法', cost: 3400 },
    { name: '启蒙时代', cost: 4700 },
    { name: '工业时代', cost: 6400 },
    { name: '电气时代', cost: 8600 },
    { name: '信息时代', cost: 11500 },
    { name: '星际前夜', cost: Infinity }
  ];
  const SCENARIOS = {
    balanced: { name: '新世界', description: '六个文明从不同的河谷出发。', land: 0.51, fertility: 1, disasters: 0.35, aggression: 0.45 },
    islands: { name: '群岛纪元', description: '海洋分隔大陆，贸易连接彼此。', land: 0.58, fertility: 1.1, disasters: 0.25, aggression: 0.25 },
    frontier: { name: '丰饶大陆', description: '广阔陆地，适合观察城市扩张。', land: 0.44, fertility: 1.4, disasters: 0.15, aggression: 0.3 },
    scarcity: { name: '漫长旱季', description: '资源紧张，合作与冲突更加重要。', land: 0.49, fertility: 0.72, disasters: 0.7, aggression: 0.7 }
  };

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const round = n => Math.round(n * 1000) / 1000;
  const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rand = state => { state.rng = (state.rng + 0x6D2B79F5) >>> 0; let t = state.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const coordNoise = (x, y, seed) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = coordNoise(ix, iy, seed), b = coordNoise(ix + 1, iy, seed), c = coordNoise(ix, iy + 1, seed), d = coordNoise(ix + 1, iy + 1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  function neighbors(state, index) {
    const x = index % state.width, y = Math.floor(index / state.width), result = [];
    if (x > 0) result.push(index - 1);
    if (x + 1 < state.width) result.push(index + 1);
    if (y > 0) result.push(index - state.width);
    if (y + 1 < state.height) result.push(index + state.width);
    return result;
  }
  const isLand = tile => TERRAIN[tile.type].capacity > 0;
  const distance = (state, a, b) => Math.hypot(a % state.width - b % state.width, Math.floor(a / state.width) - Math.floor(b / state.width));
  const activeCivs = state => state.civs.filter(c => c.alive);
  const owned = (state, id) => state.tiles.filter(t => t.owner === id);
  function log(state, kind, text, civId = null) {
    state.events.push({ id: state.nextEvent++, year: state.year, kind, text, civId });
    if (state.events.length > 260) state.events.shift();
  }
  function cityName(civ) { const def = CIVS[civ.id]; return civ.founded === 0 ? def.capital : def.names[(civ.founded - 1) % def.names.length] + (civ.founded > def.names.length ? String(Math.floor((civ.founded - 1) / def.names.length) + 1) : ''); }
  function foundCity(state, civ, tileIndex, initial = false) {
    const city = { id: state.nextCity++, name: cityName(civ), civId: civ.id, tile: tileIndex, founded: state.year, capital: initial, buildings: {}, queue: [] };
    civ.founded++;
    state.cities.push(city);
    state.tiles[tileIndex].owner = civ.id;
    for (const n of neighbors(state, tileIndex)) if (isLand(state.tiles[n]) && state.tiles[n].owner === -1) state.tiles[n].owner = civ.id;
    if (!initial) { civ.wood -= 38; civ.wealth -= 45; civ.food -= 26; log(state, 'city', `${civ.name}建立了${city.name}。`, civ.id); }
    return city;
  }

  function createWorld(options = {}) {
    const scenario = Object.hasOwn(SCENARIOS, options.scenario) ? options.scenario : 'balanced';
    const settings = SCENARIOS[scenario];
    const seed = String(options.seed ?? '远方来信').slice(0, 100);
    const seedHash = hash(seed);
    const state = {
      version: VERSION, seed, scenario, width: WIDTH, height: HEIGHT, year: 0, rng: seedHash,
      config: { fertility: settings.fertility, disasters: settings.disasters, aggression: settings.aggression },
      tiles: [], civs: [], cities: [], relations: {}, events: [], history: [],
      nextCity: 1, nextEvent: 1, commands: [], climate: { drought: 0, bumper: 0 },
      stats: { battles: 0, trades: 0, disasters: 0 }
    };
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const edge = Math.min(x, WIDTH - 1 - x, y, HEIGHT - 1 - y);
      const elevation = noise(x / 13, y / 11, seedHash) * 0.58 + noise(x / 5, y / 5, seedHash ^ 8913) * 0.27 + noise(x / 2, y / 2, seedHash ^ 333) * 0.15 - Math.max(0, 4 - edge) * 0.105;
      const moisture = noise(x / 8, y / 8, seedHash ^ 938294);
      let type = elevation < settings.land - 0.09 ? 'ocean' : elevation < settings.land ? 'coast' : elevation > 0.77 ? 'mountain' : elevation > 0.67 ? 'hill' : moisture < 0.25 ? 'desert' : moisture > 0.56 ? 'forest' : 'plain';
      state.tiles.push({ index: y * WIDTH + x, type, elevation: round(elevation), moisture: round(moisture), owner: -1 });
    }
    // Stable fallback guarantees six viable starting positions even on extreme seeds.
    const anchors = [[10, 10], [30, 8], [51, 10], [12, 29], [33, 28], [53, 29]];
    const starts = [];
    for (let id = 0; id < CIVS.length; id++) {
      let best = -1, bestScore = -Infinity;
      for (const t of state.tiles) {
        if (!isLand(t) || t.type === 'mountain' || t.type === 'desert') continue;
        const nearest = starts.length ? Math.min(...starts.map(s => distance(state, s, t.index))) : 30;
        if (nearest < 12) continue;
        const fertile = neighbors(state, t.index).reduce((sum, n) => sum + TERRAIN[state.tiles[n].type].food, 0);
        const anchorDist = Math.hypot(t.index % WIDTH - anchors[id][0], Math.floor(t.index / WIDTH) - anchors[id][1]);
        const score = fertile + nearest * 0.06 - anchorDist * 0.16 + coordNoise(t.index, id, seedHash) * 0.3;
        if (score > bestScore) { best = t.index; bestScore = score; }
      }
      if (best < 0) {
        const candidates = state.tiles.filter(t => t.owner === -1 && t.index % WIDTH > 3 && t.index % WIDTH < WIDTH - 4 && Math.floor(t.index / WIDTH) > 3 && Math.floor(t.index / WIDTH) < HEIGHT - 4);
        candidates.sort((a, b) => Math.min(...starts.map(s => distance(state, s, b.index))) - Math.min(...starts.map(s => distance(state, s, a.index))));
        best = candidates[0].index;
        state.tiles[best].type = 'plain';
        for (const n of neighbors(state, best)) if (state.tiles[n].owner === -1) state.tiles[n].type = 'plain';
      }
      starts.push(best);
      const civ = { id, name: CIVS[id].name, policy: CIVS[id].policy, alive: true, population: 88 + Math.floor(rand(state) * 16), food: 105, wood: 52, ore: 18, wealth: 80, science: 0, tech: 0, military: 10, happiness: 72, founded: 0, lastCity: 0, lastExpansion: 0, foodDelta: 0, populationDelta: 0, tradeIncome: 0, shortage: false, territory: 0 };
      state.civs.push(civ);
      foundCity(state, civ, best, true);
      log(state, 'city', `${civ.name}在${CIVS[id].capital}点燃第一簇炉火。`, id);
    }
    for (let a = 0; a < CIVS.length; a++) for (let b = a + 1; b < CIVS.length; b++) state.relations[pairKey(a, b)] = { a, b, value: 10 + Math.floor(rand(state) * 26), war: false, treaty: false, since: 0, cooldown: 0, trade: 0 };
    initializeExpansion(state);
    updateCounts(state);
    recordHistory(state);
    return state;
  }

  function updateCounts(state) { for (const c of state.civs) c.territory = state.tiles.reduce((s, t) => s + (t.owner === c.id ? 1 : 0), 0); }
  function capacities(state, civ) {
    const tiles = owned(state, civ.id);
    const sums = tiles.reduce((s, t) => { const r = TERRAIN[t.type]; s.food += r.food; s.wood += r.wood; s.ore += r.ore; s.capacity += r.capacity; return s; }, { food: 0, wood: 0, ore: 0, capacity: 0 });
    const count = Math.max(1, tiles.length);
    return { food: sums.food / count, wood: sums.wood / count, ore: sums.ore / count, capacity: sums.capacity * (1 + civ.tech * 0.11) * (1 + bonuses(state, civ).capacity) };
  }
  function produce(state, civ) {
    const p = POLICIES[civ.policy], cap = capacities(state, civ), oldPopulation = civ.population, oldFood = civ.food, bonus = bonuses(state, civ);
    const productivity = (1 + civ.tech * 0.115) * (0.72 + civ.happiness / 250);
    const weather = (state.climate.drought ? 0.58 : 1) * (state.climate.bumper ? 1.25 : 1);
    const harvest = civ.population * p.farm * cap.food * 0.73 * productivity * state.config.fertility * weather * (1 + bonus.food);
    const consumption = civ.population * 0.33 + civ.military * 0.05;
    civ.food += harvest - consumption;
    civ.shortage = civ.food < 0;
    const starvation = civ.shortage ? Math.min(0.075, (-civ.food / Math.max(consumption, 1)) * 0.08) : 0;
    civ.food = clamp(civ.food, 0, Math.max(140, civ.population * 4) * (1 + bonus.storage));
    civ.wood = clamp(civ.wood + civ.population * p.craft * (0.05 + cap.wood * 0.24) * productivity * (1 + bonus.wood) - civ.population * 0.007, 0, 1e7);
    civ.ore = clamp(civ.ore + civ.population * p.craft * cap.ore * 0.18 * productivity * (1 + bonus.ore), 0, 1e7);
    const revenue = civ.population * 0.035 * (1 + civ.tech * 0.04) * (1 + bonus.revenue);
    civ.wealth = clamp(civ.wealth + revenue - civ.military * 0.13, 0, 1e7);
    const desiredMilitary = civ.population * p.military * 0.6;
    const recruitment = Math.min(Math.max(0, desiredMilitary - civ.military) * 0.2, civ.ore / 1.3, civ.wealth / 1.8);
    civ.military = Math.max(0, civ.military * (civ.shortage ? 0.96 : 0.985) + recruitment);
    civ.ore -= recruitment * 1.3; civ.wealth -= recruitment * 1.8;
    const researchOutput = civ.population * p.research * 0.19 * productivity * (civ.shortage ? 0.65 : 1) * (1 + bonus.research);
    civ.science += researchOutput * .8;
    civ.insight = Math.min(1e7, civ.insight + researchOutput * .38);
    civ.insightDelta = researchOutput * .38;
    if (civ.tech < TECHS.length - 1 && civ.science >= TECHS[civ.tech].cost) {
      civ.science -= TECHS[civ.tech].cost; civ.tech++;
      log(state, 'tech', `${civ.name}掌握了「${TECHS[civ.tech].name}」。`, civ.id);
    }
    const crowding = civ.population / Math.max(1, cap.capacity);
    const growth = 0.021 * (1 - crowding) * (civ.happiness / 80) - starvation;
    civ.population = Math.max(8, civ.population * (1 + clamp(growth, -0.1, 0.025)));
    const wars = Object.values(state.relations).filter(r => r.war && (r.a === civ.id || r.b === civ.id)).length;
    const targetHappiness = clamp(75 + Math.min(12, civ.food / civ.population * 4) + civ.tech * 1.3 + bonus.happiness - (civ.shortage ? 35 : 0) - wars * 10 - Math.max(0, crowding - 0.85) * 22, 15, 98);
    civ.happiness += (targetHappiness - civ.happiness) * 0.13;
    civ.populationDelta = civ.population - oldPopulation;
    civ.foodDelta = civ.food - oldFood;
    civ.tradeIncome = 0;
  }

  function expand(state, civ) {
    const p = POLICIES[civ.policy];
    if (state.year - civ.lastExpansion < Math.max(2, 7 / p.expansion) || civ.wood < 4 || civ.food < 8) return;
    const cities = state.cities.filter(c => c.civId === civ.id);
    if (!cities.length) return;
    const candidates = new Set();
    for (const t of owned(state, civ.id)) for (const n of neighbors(state, t.index)) {
      if (state.tiles[n].owner !== -1 || !isLand(state.tiles[n])) continue;
      if (Math.min(...cities.map(c => distance(state, c.tile, n))) <= 4.5 + civ.tech * 0.5) candidates.add(n);
    }
    // A mature civilization can establish a coastal bridgehead across water.
    if (!candidates.size && civ.tech >= 2 && civ.wood >= 28 && state.year % 6 === 0) {
      for (const t of state.tiles) if (t.owner === -1 && isLand(t) && neighbors(state, t.index).some(n => !isLand(state.tiles[n]))) {
        if (Math.min(...cities.map(c => distance(state, c.tile, t.index))) < 11 + civ.tech) candidates.add(t.index);
      }
    }
    if (!candidates.size) return;
    const ranked = [...candidates].map(n => {
      const terrain = TERRAIN[state.tiles[n].type];
      return { n, score: terrain.food * (civ.food < civ.population ? 2 : 1) + terrain.wood * (civ.wood < 40 ? 1.8 : 0.4) + terrain.ore * 0.6 - Math.min(...cities.map(c => distance(state, c.tile, n))) * 0.12 + rand(state) * 0.8 };
    }).sort((a, b) => b.score - a.score);
    state.tiles[ranked[0].n].owner = civ.id;
    civ.wood -= 4; civ.food -= 6; civ.lastExpansion = state.year;
  }

  function developCities(state, civ) {
    const cities = state.cities.filter(c => c.civId === civ.id);
    const p = POLICIES[civ.policy];
    if (cities.length >= 12 || civ.population < cities.length * 100 || civ.wood < 38 || civ.wealth < 45 || civ.food < 40 || state.year - civ.lastCity < 22 / p.expansion) return;
    const candidates = owned(state, civ.id).filter(t => t.type !== 'mountain' && Math.min(...cities.map(c => distance(state, c.tile, t.index))) >= 3.8);
    if (!candidates.length) return;
    const scored = candidates.map(t => ({ tile: t.index, score: TERRAIN[t.type].food + neighbors(state, t.index).filter(n => state.tiles[n].owner === -1 && isLand(state.tiles[n])).length * 0.8 + rand(state) }));
    scored.sort((a, b) => b.score - a.score);
    foundCity(state, civ, scored[0].tile); civ.lastCity = state.year;
  }

  function borders(state) {
    const result = new Map();
    for (const t of state.tiles) if (t.owner >= 0) for (const n of neighbors(state, t.index)) {
      const other = state.tiles[n];
      if (other.owner < 0 || other.owner === t.owner) continue;
      const key = pairKey(t.owner, other.owner);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push({ from: t.index, to: n, attacker: t.owner });
    }
    return result;
  }
  function eliminate(state, civ, victor) {
    civ.alive = false; civ.military = 0;
    civ.decision = null;
    victor.population += civ.population * 0.65;
    victor.food += civ.food * 0.5; victor.wood += civ.wood * 0.5; victor.wealth += civ.wealth * 0.5;
    civ.population = 0;
    for (const t of state.tiles) if (t.owner === civ.id) t.owner = victor.id;
    for (const r of Object.values(state.relations)) if (r.a === civ.id || r.b === civ.id) { r.war = false; r.treaty = false; r.trade = 0; }
    log(state, 'war', `${civ.name}失去最后一座城市，余民加入${victor.name}。`, victor.id);
  }
  function battle(state, relation, borderTiles) {
    if (!borderTiles.length || state.year % 3 !== 0) return;
    const a = state.civs[relation.a], b = state.civs[relation.b];
    const powerA = Math.max(0.1, a.military) * (1 + a.tech * 0.13) * (0.8 + rand(state) * 0.4);
    const powerB = Math.max(0.1, b.military) * (1 + b.tech * 0.13) * (0.8 + rand(state) * 0.4);
    const winner = powerA > powerB ? a : b, loser = winner === a ? b : a;
    const targets = borderTiles.filter(t => t.attacker === winner.id && state.tiles[t.to].owner === loser.id);
    if (!targets.length) return;
    const target = targets[Math.floor(rand(state) * targets.length)].to;
    const defenderCity = state.cities.find(c => c.tile === target);
    const defense = (state.tiles[target].type === 'mountain' ? 1.5 : 1) * (1 + (defenderCity?.buildings.walls || 0) * .35);
    if (defenderCity && Math.max(powerA, powerB) < Math.min(powerA, powerB) * 1.18 * defense) {
      a.military *= 0.96; b.military *= 0.96; return;
    }
    state.tiles[target].owner = winner.id;
    winner.military *= 0.95; loser.military *= 0.91;
    winner.happiness = clamp(winner.happiness - 1, 0, 100); loser.happiness = clamp(loser.happiness - 2, 0, 100);
    winner.population *= 0.997; loser.population *= 0.993;
    state.stats.battles++;
    if (defenderCity) {
      defenderCity.civId = winner.id; defenderCity.capital = false;
      const transfer = Math.min(loser.population * 0.2, 80);
      loser.population -= transfer; winner.population += transfer;
      log(state, 'war', `${winner.name}占领了${defenderCity.name}。`, winner.id);
      if (!state.cities.some(c => c.civId === loser.id)) eliminate(state, loser, winner);
    } else if (state.year % 12 === 0) log(state, 'war', `${winner.name}在与${loser.name}的边境冲突中推进了一格。`, winner.id);
  }
  function diplomacy(state) {
    const borderMap = borders(state);
    for (const r of Object.values(state.relations)) {
      const a = state.civs[r.a], b = state.civs[r.b];
      r.trade = 0;
      if (!a.alive || !b.alive) continue;
      const border = borderMap.get(pairKey(a.id, b.id)) || [];
      const aCities = state.cities.filter(c => c.civId === a.id), bCities = state.cities.filter(c => c.civId === b.id);
      const cityDistance = Math.min(...aCities.flatMap(ac => bCities.map(bc => distance(state, ac.tile, bc.tile))));
      const contact = border.length > 0 || cityDistance < 14 + Math.min(a.tech, b.tech) * 2.5;
      if (!contact) continue;
      const tension = border.length ? (state.config.aggression * 0.55 + (a.policy === 'conquest' || b.policy === 'conquest' ? 0.42 : 0) + (a.shortage || b.shortage ? 0.22 : 0)) : 0;
      if (!r.war) {
        r.value = clamp(r.value + 0.24 + (r.treaty ? 0.18 : 0) - tension + (rand(state) - 0.5) * 0.7, -100, 100);
        if (r.value > 38 && !r.treaty) { r.treaty = true; log(state, 'trade', `${a.name}与${b.name}签署通商条约。`); }
        if (r.value < 5) r.treaty = false;
        if (r.value > -15) {
          const income = Math.min(a.population, b.population) * 0.016 * (r.treaty ? 1.6 : 0.65) * (1 + (a.tech + b.tech) * 0.06);
          const aIncome = income * POLICIES[a.policy].trade * (1 + bonuses(state, a).trade), bIncome = income * POLICIES[b.policy].trade * (1 + bonuses(state, b).trade);
          a.wealth = Math.min(1e7, a.wealth + aIncome); b.wealth = Math.min(1e7, b.wealth + bIncome); a.tradeIncome += aIncome; b.tradeIncome += bIncome;
          r.trade = income; state.stats.trades++;
          // Conservative food exchange: purchased food is deducted from the seller.
          for (const [buyer, seller] of [[a, b], [b, a]]) if (buyer.food < buyer.population * 0.55 && seller.food > seller.population * 1.15) {
            const amount = Math.min(seller.food - seller.population * 1.15, buyer.population * 0.08, buyer.wealth / 0.6);
            buyer.food += amount; seller.food -= amount; buyer.wealth -= amount * 0.6; seller.wealth += amount * 0.6;
          }
        }
        if (border.length && state.year >= r.cooldown && r.value < -8 && rand(state) < state.config.aggression * 0.045) {
          r.war = true; r.treaty = false; r.since = state.year;
          log(state, 'war', `${a.name}与${b.name}爆发战争。`);
        }
      } else {
        battle(state, r, border);
        if (!a.alive || !b.alive) continue;
        if (state.year - r.since > 32 || (state.year - r.since > 10 && (a.military < 2 || b.military < 2 || !border.length || rand(state) < 0.025))) {
          r.war = false; r.value = 8; r.cooldown = state.year + 25;
          log(state, 'peace', `${a.name}与${b.name}停战，边境进入休整期。`);
        }
      }
    }
  }
  function naturalEvents(state) {
    if (state.year % 5 !== 0 || rand(state) >= state.config.disasters * 0.13) return;
    const alive = activeCivs(state); if (!alive.length) return;
    const civ = alive[Math.floor(rand(state) * alive.length)];
    const roll = rand(state);
    if (roll < 0.38 && !state.climate.drought) {
      state.climate.drought = 4 + Math.floor(rand(state) * 4); state.stats.disasters++;
      log(state, 'climate', `大地进入持续${state.climate.drought}年的旱季。`);
    } else if (roll < 0.7) {
      const loss = civ.population * (0.025 + rand(state) * 0.025) / (1 + civ.tech * 0.12) * (1 - Math.min(.8, bonuses(state, civ).health));
      civ.population -= loss; civ.happiness = Math.max(10, civ.happiness - 6); state.stats.disasters++;
      log(state, 'climate', `${civ.name}遭遇疫病，约${Math.round(loss)}人逝去。`, civ.id);
    } else { state.climate.bumper = 4; log(state, 'climate', '温和的风雨带来丰收，粮食产出暂时提高。'); }
  }
  function recordHistory(state) {
    const living = activeCivs(state);
    state.history.push({ year: state.year, population: round(living.reduce((s, c) => s + c.population, 0)), wars: Object.values(state.relations).filter(r => r.war).length, civs: state.civs.map(c => ({ population: round(c.population), territory: c.territory, tech: c.tech, wealth: round(c.wealth) })) });
    if (state.history.length > 601) state.history.shift();
  }
  function tick(state, years = 1) {
    if (!Number.isSafeInteger(years) || years < 0 || years > 10000) throw new Error('推进年数必须是 0 到 10000 的整数。');
    for (let i = 0; i < years; i++) {
      state.year++;
      naturalEvents(state);
      for (const c of state.civs) if (c.alive) { produce(state, c); expand(state, c); if (c.id !== state.playerId) developCities(state, c); }
      diplomacy(state); updateCounts(state); advanceExpansion(state); recordHistory(state);
      if (state.climate.drought > 0 && --state.climate.drought === 0) log(state, 'climate', '旱季结束，雨水重新浸润大地。');
      if (state.climate.bumper > 0) state.climate.bumper--;
    }
    return state;
  }

  function command(state, action, record = true) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('无效的干预指令。');
    if (record && state.commands.length >= 10000) throw new Error('单个世界最多记录10,000次干预。请生成新世界继续实验。');
    const civ = state.civs[action.civId];
    let normalized;
    if (action.type === 'policy') {
      if (!civ?.alive || !Object.hasOwn(POLICIES, action.policy)) throw new Error('无法改变该文明的政策。');
      civ.policy = action.policy;
      log(state, 'intervention', `${civ.name}转向「${POLICIES[action.policy].name}」。`, civ.id);
      normalized = { type: 'policy', civId: civ.id, policy: action.policy };
    } else if (action.type === 'aid') {
      if (!civ?.alive) throw new Error('该文明已经退出历史。');
      civ.food += 80; civ.wood += 35; civ.wealth += 50;
      log(state, 'intervention', `${civ.name}获得援助：粮食 +80，木材 +35，财富 +50。`, civ.id);
      normalized = { type: 'aid', civId: civ.id };
    } else if (action.type === 'peace') {
      let count = 0;
      for (const r of Object.values(state.relations)) if (r.war) { r.war = false; r.value = 20; r.cooldown = state.year + 35; count++; }
      log(state, 'intervention', count ? `调停生效，${count}场战争结束，停战保护持续35年。` : '和平倡议发布，各文明维持当前关系。');
      normalized = { type: 'peace' };
    } else if (action.type === 'rain') {
      state.climate.drought = 0; state.climate.bumper = 5;
      log(state, 'intervention', '降雨干预生效，接下来5年进入丰收期。'); normalized = { type: 'rain' };
    } else if (action.type === 'config') {
      const config = {};
      for (const key of ['fertility', 'disasters', 'aggression']) if (Object.hasOwn(action, key)) {
        const value = action[key], min = key === 'fertility' ? 0.4 : 0, max = key === 'fertility' ? 1.8 : 1;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('环境参数超出允许范围。');
        config[key] = value;
      }
      if (!Object.keys(config).length) throw new Error('缺少环境参数。');
      Object.assign(state.config, config); normalized = { type: 'config', ...config };
      log(state, 'intervention', '世界环境参数已调整。');
    } else normalized = expansionCommand(state, action);
    if (['aid', 'rain', 'peace', 'config'].includes(action.type) || (action.type === 'policy' && action.civId !== state.playerId)) state.sandboxUse++;
    if (record) state.commands.push({ year: state.year, action: normalized });
    updateVictory(state);
    return state;
  }
  function replay(state, targetYear = state.year) {
    if (!Number.isSafeInteger(targetYear) || targetYear < 0 || targetYear > 50000) throw new Error('回放年份超出范围。');
    const startYear = state.origin?.year || 0;
    if (targetYear < startYear) throw new Error(`这个升级存档从第${startYear}年开始，请用经典版读取更早的历史。`);
    const result = state.origin ? upgradeLegacy(Legacy.deserialize(JSON.stringify(state.origin)), state.origin) : createWorld({ seed: state.seed, scenario: state.scenario });
    let cursor = 0;
    for (let year = startYear; year <= targetYear; year++) {
      while (cursor < state.commands.length && state.commands[cursor].year === year) command(result, state.commands[cursor++].action);
      if (year < targetYear) tick(result);
    }
    return result;
  }
  // Store the seed and ordered actions. Rebuilding validates all imported data;
  // no imported object is merged into live state or trusted as engine state.
  function serialize(state) { return JSON.stringify({ format: 'civilization-lab', version: VERSION, seed: state.seed, scenario: state.scenario, year: state.year, origin: state.origin || null, commands: state.commands }, null, 2); }
  function deserialize(json) {
    if (typeof json !== 'string' || json.length > 2e6) throw new Error('存档过大，或格式无效。');
    let data; try { data = JSON.parse(json); } catch { throw new Error('无法读取这个 JSON 存档。'); }
    if (data?.version === 1) return upgradeLegacy(Legacy.deserialize(json), data);
    if (!data || data.format !== 'civilization-lab' || data.version !== VERSION || typeof data.seed !== 'string' || data.seed.length > 100 || !Object.hasOwn(SCENARIOS, data.scenario) || !Number.isSafeInteger(data.year) || data.year < 0 || data.year > 50000 || !Array.isArray(data.commands) || data.commands.length > 10000) throw new Error('存档版本或内容不受支持。');
    if (data.origin && (data.origin.version !== 1 || data.origin.seed !== data.seed || data.origin.scenario !== data.scenario || !Number.isSafeInteger(data.origin.year) || data.origin.year > data.year || data.origin.year < 0)) throw new Error('升级存档的起点无效。');
    let prev = -1;
    for (const entry of data.commands) {
      if (!entry || !Number.isSafeInteger(entry.year) || entry.year < (data.origin?.year || 0) || entry.year < prev || entry.year > data.year || !entry.action) throw new Error('存档中的时间线无效。');
      prev = entry.year;
    }
    return replay(data, data.year);
  }
  function initializeExpansion(state) {
    state.origin = null;
    state.playerId = 0;
    state.goal = 'prosperity';
    state.victory = null;
    state.sandboxUse = 0;
    state.nextDecision = 1;
    state.sites = [];
    state.expeditions = [];
    for (const city of state.cities) { city.buildings = {}; city.queue = []; }
    for (const c of state.civs) {
      Object.assign(c, { insight: 40, insightDelta: 0, research: [], buffs: [], relics: 0, peaceYears: 0, decisions: [], nextCouncil: state.year + 18, decision: null });
    }
    const types = Object.keys(SITES), seedHash = hash(state.seed + ':ruins');
    // Spread sites locally first, so every capital has something to explore.
    for (let id = 0; id < state.civs.length; id++) {
      const capital = state.cities.find(c => c.civId === id);
      if (!capital) continue;
      const candidates = state.tiles.filter(t => isLand(t) && t.owner < 0 && distance(state, capital.tile, t.index) >= 3 && distance(state, capital.tile, t.index) <= 9 && !state.sites.some(s => distance(state, s.tile, t.index) < 3));
      candidates.sort((a, b) => coordNoise(a.index, id, seedHash) - coordNoise(b.index, id, seedHash));
      for (const t of candidates.slice(0, 2)) if (!state.sites.some(s => distance(state, s.tile, t.index) < 2)) state.sites.push({ id: state.sites.length, tile: t.index, type: types[state.sites.length % types.length], claimedBy: -1, explorerId: -1, cooldown: 0 });
    }
    const candidates = state.tiles.filter(t => isLand(t) && t.owner < 0).sort((a, b) => coordNoise(a.index, 8, seedHash) - coordNoise(b.index, 8, seedHash));
    for (const t of candidates) {
      if (state.sites.length >= 20) break;
      if (state.sites.some(s => distance(state, s.tile, t.index) < 5)) continue;
      state.sites.push({ id: state.sites.length, tile: t.index, type: types[state.sites.length % types.length], claimedBy: -1, explorerId: -1, cooldown: 0 });
    }
    for (const c of state.civs) if (c.alive) createDecision(state, c, 'harvest');
  }
  function upgradeLegacy(legacyState, origin) {
    const state = legacyState;
    initializeExpansion(state);
    state.version = VERSION;
    state.origin = JSON.parse(JSON.stringify(origin));
    state.commands = [];
    state.playerId = state.civs.find(c => c.alive).id;
    log(state, 'intervention', `世界在第${state.year}年进入执政者版本，旧历史保持原样。`);
    return state;
  }
  function bonuses(state, civ) {
    const result = { food: 0, wood: 0, ore: 0, storage: 0, research: 0, construction: 0, capacity: 0, happiness: 0, health: 0, trade: 0, revenue: 0, exploration: 0, travel: 0, diplomacy: 0 };
    const add = (effects, scale = 1) => { for (const [key, value] of Object.entries(effects)) result[key] += value * scale; };
    for (const id of civ.research || []) add(RESEARCH[id].effects);
    const cities = state.cities.filter(c => c.civId === civ.id);
    for (const city of cities) for (const [id, level] of Object.entries(city.buildings || {})) add(BUILDINGS[id].effects, level / (BUILDINGS[id].unique ? 1 : Math.max(1, cities.length)));
    for (const buff of civ.buffs || []) if (buff.until > state.year) result[buff.key] += buff.value;
    return result;
  }
  function afford(civ, cost = {}) { return Object.entries(cost).every(([key, amount]) => civ[key] >= amount); }
  function pay(civ, cost) { for (const [key, amount] of Object.entries(cost)) civ[key] = Math.max(0, civ[key] - amount); }
  function costText(cost = {}) { return Object.entries(cost).map(([key, amount]) => `${RESOURCE_NAMES[key]} ${Math.round(amount)}`).join(' · '); }
  function buildingStatus(state, civId, cityId, building) {
    const civ = state.civs[civId], city = state.cities.find(c => c.id === cityId), def = BUILDINGS[building];
    if (!civ?.alive || !city || city.civId !== civId || !Object.hasOwn(BUILDINGS, building)) return { available: false, reason: '城市或建筑无效', cost: {} };
    const level = (city.buildings[building] || 0) + city.queue.filter(q => q.building === building).length;
    const cost = Object.fromEntries(Object.entries(def.cost).map(([key, n]) => [key, Math.ceil(n * (1 + level * .7))]));
    let reason = '';
    if (level >= def.max) reason = '已达到最高等级';
    else if (def.requires && !civ.research.includes(def.requires)) reason = `需要研究「${RESEARCH[def.requires].name}」`;
    else if (city.queue.length >= 3) reason = '建设队列已满（3项）';
    else if (def.unique && state.cities.some(c => c.buildings[building] || c.queue.some(q => q.building === building))) reason = '奇观已建成或正在其他城市建造';
    else if (!afford(civ, cost)) reason = '资源不足';
    return { available: !reason, reason, cost, level: level + 1, work: Math.ceil(def.work * (1 + level * .4)) };
  }
  function queueBuilding(state, civId, cityId, building) {
    const status = buildingStatus(state, civId, cityId, building);
    if (!status.available) throw new Error(status.reason);
    const civ = state.civs[civId], city = state.cities.find(c => c.id === cityId);
    pay(civ, status.cost);
    city.queue.push({ building, level: status.level, progress: 0, work: status.work, cost: status.cost });
    log(state, 'build', `${city.name}开始建设${BUILDINGS[building].name}${status.level}级。`, civ.id);
  }
  function researchStatus(state, civId, id) {
    const civ = state.civs[civId];
    if (!civ?.alive || !Object.hasOwn(RESEARCH, id)) return { available: false, reason: '研究无效' };
    const def = RESEARCH[id];
    let reason = '';
    if (civ.research.includes(id)) reason = '已掌握';
    else if (def.requires.some(r => !civ.research.includes(r))) reason = `前置：${def.requires.map(r => RESEARCH[r].name).join('、')}`;
    else if (civ.tech < def.era) reason = `需要时代科技${def.era}级`;
    else if (civ.insight < def.cost) reason = `还需${Math.ceil(def.cost - civ.insight)}研究点`;
    return { available: !reason, reason };
  }
  function study(state, civId, id) {
    const status = researchStatus(state, civId, id);
    if (!status.available) throw new Error(status.reason);
    const civ = state.civs[civId]; civ.insight -= RESEARCH[id].cost; civ.research.push(id);
    log(state, 'tech', `${civ.name}完成专项研究「${RESEARCH[id].name}」。`, civId);
  }
  function explorationStatus(state, civId, siteId) {
    const civ = state.civs[civId], site = state.sites.find(s => s.id === siteId), cost = { food: 30, wealth: 25 };
    if (!civ?.alive || !site) return { available: false, reason: '远征目标无效', cost };
    const cities = state.cities.filter(c => c.civId === civId), bonus = bonuses(state, civ);
    const distanceTo = Math.min(...cities.map(c => distance(state, c.tile, site.tile)));
    const range = 11 + civ.tech * 1.5 + bonus.exploration;
    const duration = Math.max(3, Math.ceil(distanceTo / 1.8 * (1 - bonus.travel)));
    let reason = '';
    if (site.claimedBy >= 0) reason = `已由${CIVS[site.claimedBy].short}发掘`;
    else if (site.explorerId >= 0) reason = '已有远征队前往';
    else if (site.cooldown > state.year) reason = `修整至第${site.cooldown}年`;
    else if (state.expeditions.some(e => e.civId === civId)) reason = '已有一支远征队在外';
    else if (distanceTo > range) reason = `超出探索范围（${Math.floor(range)}格）`;
    else if (!afford(civ, cost)) reason = '资源不足';
    return { available: !reason, reason, cost, distance: distanceTo, duration, risk: SITES[site.type].risk, range };
  }
  function sendExpedition(state, civId, siteId) {
    const status = explorationStatus(state, civId, siteId); if (!status.available) throw new Error(status.reason);
    const civ = state.civs[civId], site = state.sites.find(s => s.id === siteId);
    const origin = [...state.cities].filter(c => c.civId === civId).sort((a, b) => distance(state, a.tile, site.tile) - distance(state, b.tile, site.tile))[0].tile;
    pay(civ, status.cost); site.explorerId = civId;
    state.expeditions.push({ civId, siteId, from: origin, started: state.year, arrives: state.year + status.duration });
    log(state, 'explore', `${civ.name}派出远征队探索${SITES[site.type].name}，预计${status.duration}年后归来。`, civId);
  }
  function effect(state, civ, values) {
    for (const [key, value] of Object.entries(values)) {
      if (key === 'relations') { for (const r of Object.values(state.relations)) if (r.a === civ.id || r.b === civ.id) r.value = clamp(r.value + value, -100, 100); }
      else civ[key] = clamp(civ[key] + value, 0, key === 'happiness' ? 100 : 1e7);
    }
  }
  function createDecision(state, civ, kind) {
    civ.decision = { id: state.nextDecision++, kind, created: state.year, expires: state.year + 12 };
  }
  function resolveDecision(state, civ, choiceId, automatic = false) {
    const decision = civ.decision;
    if (!decision) throw new Error('没有待处理的议事。');
    const def = DECISIONS[decision.kind], choice = def.options.find(o => o.id === choiceId);
    if (!choice || !afford(civ, choice.cost)) throw new Error('此选项无效或资源不足。');
    pay(civ, choice.cost || {}); effect(state, civ, choice.effect);
    if (choice.buff) civ.buffs.push({ ...choice.buff, until: state.year + choice.buff.duration, label: choice.name });
    civ.decisions.push({ id: decision.id, year: state.year, kind: decision.kind, choice: choiceId });
    if (civ.decisions.length > 100) civ.decisions.shift();
    civ.decision = null;
    log(state, 'council', `${civ.name}${automatic ? '的议会决定' : '决定'}：${choice.name}。`, civ.id);
  }
  function constructionRate(state, civId) { return (1 + state.civs[civId].tech * .14) * (1 + bonuses(state, state.civs[civId]).construction); }
  function advanceExpansion(state) {
    for (const city of state.cities) {
      if (!city.queue.length || !state.civs[city.civId].alive) continue;
      const project = city.queue[0];
      project.progress += constructionRate(state, city.civId);
      if (project.progress >= project.work) {
        city.buildings[project.building] = project.level; city.queue.shift();
        log(state, 'build', `${city.name}建成${BUILDINGS[project.building].name}${project.level}级。`, city.civId);
      }
    }
    for (const expedition of [...state.expeditions]) {
      const civ = state.civs[expedition.civId], site = state.sites.find(s => s.id === expedition.siteId);
      if (!civ.alive) { site.explorerId = -1; state.expeditions = state.expeditions.filter(e => e !== expedition); continue; }
      if (state.year < expedition.arrives) continue;
      site.explorerId = -1;
      if (rand(state) < SITES[site.type].risk) {
        site.cooldown = state.year + 8; civ.happiness = Math.max(0, civ.happiness - 2);
        log(state, 'explore', `${civ.name}的远征队遭遇险阻，未能发掘${SITES[site.type].name}，8年后可重试。`, civ.id);
      } else {
        site.claimedBy = civ.id; civ.relics++; effect(state, civ, SITES[site.type].reward);
        log(state, 'explore', `${civ.name}成功发掘${SITES[site.type].name}，带回${costText(SITES[site.type].reward)}。`, civ.id);
      }
      state.expeditions = state.expeditions.filter(e => e !== expedition);
    }
    for (const civ of state.civs) if (civ.alive) {
      civ.buffs = civ.buffs.filter(b => b.until > state.year);
      civ.peaceYears = Object.values(state.relations).some(r => r.war && (r.a === civ.id || r.b === civ.id)) ? 0 : civ.peaceYears + 1;
      if (civ.decision && (state.year >= civ.decision.expires || civ.id !== state.playerId)) {
        const choices = DECISIONS[civ.decision.kind].options.filter(o => afford(civ, o.cost));
        const chosen = choices[civ.id === state.playerId ? 0 : Math.floor(rand(state) * choices.length)];
        if (chosen) resolveDecision(state, civ, chosen.id, true);
      }
      if (!civ.decision && state.year >= civ.nextCouncil) {
        const keys = Object.keys(DECISIONS); createDecision(state, civ, keys[Math.floor(rand(state) * keys.length)]); civ.nextCouncil = state.year + 22;
      }
      if (civ.id === state.playerId || state.year % 8 !== civ.id) continue;
      const researchOrder = civ.policy === 'scholar' ? ['writing','astronomy','printing','agronomy','tools','medicine','coinage','sailing','masonry','governance','engineering','charter'] : civ.policy === 'merchant' ? ['coinage','sailing','charter','agronomy','writing','tools','medicine','masonry','astronomy','engineering','printing','governance'] : ['agronomy','tools','writing','coinage','medicine','masonry','sailing','astronomy','governance','engineering','printing','charter'];
      const next = researchOrder.find(id => researchStatus(state, civ.id, id).available);
      if (next) study(state, civ.id, next);
      for (const city of state.cities.filter(c => c.civId === civ.id && c.queue.length === 0)) {
        const priorities = civ.policy === 'scholar' ? ['library','granary','lumbermill','observatory','academy','farm','workshop','market','hospital','walls'] : ['granary','lumbermill','farm','market','workshop','library','walls','hospital','academy','observatory'];
        const build = priorities.find(id => {
          const status = buildingStatus(state, civ.id, city.id, id);
          return status.available && Object.entries(status.cost).every(([key, amount]) => civ[key] >= amount * 1.7);
        });
        if (build) queueBuilding(state, civ.id, city.id, build);
      }
      if (state.year > 25 && !state.expeditions.some(e => e.civId === civ.id)) {
        const target = state.sites.filter(s => explorationStatus(state, civ.id, s.id).available).sort((a, b) => explorationStatus(state, civ.id, a.id).distance - explorationStatus(state, civ.id, b.id).distance)[0];
        if (target) sendExpedition(state, civ.id, target.id);
      }
    }
    updateVictory(state);
  }
  function settlementStatus(state, civId, tileIndex) {
    const civ = state.civs[civId], tile = state.tiles[tileIndex], cost = { food: 80, wood: 90, wealth: 120 };
    let reason = '';
    if (!civ?.alive || !Number.isSafeInteger(tileIndex) || !tile || !isLand(tile)) reason = '需要选择陆地';
    else if (tile.owner >= 0 && tile.owner !== civId) reason = '不能在其他文明的领土上建城';
    else if (tile.type === 'mountain') reason = '山地无法建立城市';
    else if (state.cities.some(c => distance(state, c.tile, tileIndex) < 3.8)) reason = '与现有城市至少相隔4格';
    else if (tile.owner !== civId && !neighbors(state, tileIndex).some(n => state.tiles[n].owner === civId)) reason = '需要在本国领土或相邻陆地建立';
    else if (state.cities.filter(c => c.civId === civId).length >= 12) reason = '最多拥有12座城市';
    else if (civ.population < 160) reason = '需要至少160人口';
    else if (!afford(civ, cost)) reason = '资源不足';
    return { available: !reason, reason, cost };
  }
  function diplomacyStatus(state, civId, targetId, action) {
    const civ = state.civs[civId], target = state.civs[targetId], r = state.relations[pairKey(civId, targetId)];
    const cost = { wealth: action === 'ceasefire' ? 100 : action === 'declare' ? 40 : 35 };
    let reason = '';
    if (!civ?.alive || !target?.alive || !r || !['envoy','ceasefire','declare'].includes(action)) reason = '外交对象无效';
    else if (action === 'ceasefire' && !r.war) reason = '当前没有交战';
    else if (action !== 'ceasefire' && r.war) reason = '当前处于战争状态';
    else if (action === 'envoy' && (r.envoyUntil?.[civId] || 0) > state.year) reason = `使节第${r.envoyUntil[civId]}年后可再次出发`;
    else if (action === 'declare' && state.year < r.cooldown) reason = `停战协议持续至第${r.cooldown}年`;
    else if (action === 'declare' && !borders(state).has(pairKey(civId, targetId))) reason = '双方尚未接壤';
    else if (!afford(civ, cost)) reason = '财富不足';
    return { available: !reason, reason, cost };
  }
  function expansionCommand(state, action) {
    const civ = state.civs[action.civId];
    if (action.type === 'reign') {
      if (!civ?.alive || !Object.hasOwn(GOALS, action.goal)) throw new Error('执政文明或目标无效。');
    if (state.year !== (state.origin?.year || 0) || state.commands.some(c => ['build','research','choice','explore','diplomacy','settle'].includes(c.action.type))) throw new Error('只能在开始游戏时选择执政文明和目标。');
      state.playerId = civ.id; state.goal = action.goal; state.victory = null;
      return { type: 'reign', civId: civ.id, goal: action.goal };
    }
    if (!civ?.alive || civ.id !== state.playerId) throw new Error('请对你的执政文明执行此操作。');
    if (action.type === 'build') {
      queueBuilding(state, civ.id, action.cityId, action.building);
      return { type: 'build', civId: civ.id, cityId: action.cityId, building: action.building };
    }
    if (action.type === 'cancelBuild') {
      const city = state.cities.find(c => c.id === action.cityId);
      if (!city || city.civId !== civ.id || !Number.isSafeInteger(action.index) || !city.queue[action.index]) throw new Error('建设队列已变化。');
      // Removing dependent upgrades also removes subsequent levels of the same building.
      const project = city.queue[action.index], removing = city.queue.filter((q, i) => i >= action.index && q.building === project.building);
      for (const q of removing) { const fraction = .8 * (1 - Math.min(1, q.progress / q.work)); for (const [key, amount] of Object.entries(q.cost)) civ[key] += Math.floor(amount * fraction); }
      city.queue = city.queue.filter(q => !removing.includes(q));
      log(state, 'build', `${city.name}取消${BUILDINGS[project.building].name}工程，返还未施工部分80%的资源。`, civ.id);
      return { type: 'cancelBuild', civId: civ.id, cityId: city.id, index: action.index };
    }
    if (action.type === 'research') { study(state, civ.id, action.research); return { type: 'research', civId: civ.id, research: action.research }; }
    if (action.type === 'choice') {
      if (!civ.decision || civ.decision.id !== action.decisionId) throw new Error('这次议事已经结束。');
      resolveDecision(state, civ, action.choice);
      return { type: 'choice', civId: civ.id, decisionId: action.decisionId, choice: action.choice };
    }
    if (action.type === 'explore') { sendExpedition(state, civ.id, action.siteId); return { type: 'explore', civId: civ.id, siteId: action.siteId }; }
    if (action.type === 'settle') {
      const status = settlementStatus(state, civ.id, action.tile); if (!status.available) throw new Error(status.reason);
      pay(civ, status.cost); const city = foundCity(state, civ, action.tile, true); city.capital = false; civ.lastCity = state.year;
      updateCounts(state); log(state, 'city', `${civ.name}派出开拓者，建立${city.name}。`, civ.id);
      return { type: 'settle', civId: civ.id, tile: action.tile };
    }
    if (action.type === 'diplomacy') {
      const status = diplomacyStatus(state, civ.id, action.targetId, action.action); if (!status.available) throw new Error(status.reason);
      const r = state.relations[pairKey(civ.id, action.targetId)], target = state.civs[action.targetId]; pay(civ, status.cost);
      if (action.action === 'envoy') { r.value = clamp(r.value + 22 + bonuses(state, civ).diplomacy, -100, 100); r.envoyUntil ||= {}; r.envoyUntil[civ.id] = state.year + 12; if (r.value > 38) r.treaty = true; log(state, 'trade', `${civ.name}向${target.name}派出使节，双方关系改善。`, civ.id); }
      if (action.action === 'ceasefire') { r.war = false; r.value = 15; r.cooldown = state.year + 30; log(state, 'peace', `${civ.name}与${target.name}签署30年停战协议。`, civ.id); }
      if (action.action === 'declare') { r.war = true; r.treaty = false; r.trade = 0; r.since = state.year; r.value = -60; civ.peaceYears = 0; target.peaceYears = 0; log(state, 'war', `${civ.name}向${target.name}宣战。`, civ.id); }
      return { type: 'diplomacy', civId: civ.id, targetId: target.id, action: action.action };
    }
    throw new Error('未知的干预指令。');
  }
  function goalProgress(state) {
    const civ = state.civs[state.playerId], cities = state.cities.filter(c => c.civId === civ.id);
    const values = { population: civ.population, cities: cities.length, buildings: cities.reduce((sum, c) => sum + Object.values(c.buildings).reduce((a, b) => a + b, 0), 0), happiness: civ.happiness, research: civ.research.length, tech: civ.tech, relics: civ.relics, wonder: cities.some(c => c.buildings.observatory) ? 1 : 0, treaties: Object.values(state.relations).filter(r => r.treaty && (r.a === civ.id || r.b === civ.id)).length, wealth: civ.wealth, peaceYears: civ.peaceYears };
    return GOALS[state.goal].targets.map(([key, label, target]) => ({ key, label, target, value: values[key], progress: clamp(values[key] / target, 0, 1), complete: values[key] >= target }));
  }
  function updateVictory(state) {
    if (state.victory || !state.civs[state.playerId].alive) return;
    if (goalProgress(state).every(g => g.complete)) { state.victory = { year: state.year, civId: state.playerId, goal: state.goal, assisted: state.sandboxUse > 0 }; log(state, 'victory', `${state.civs[state.playerId].name}达成「${GOALS[state.goal].name}」！文明的故事仍将继续。`, state.playerId); }
  }
  function summary(state) {
    const alive = activeCivs(state);
    return { year: state.year, population: alive.reduce((s, c) => s + c.population, 0), cities: state.cities.length, civilizations: alive.length, wars: Object.values(state.relations).filter(r => r.war).length, treaties: Object.values(state.relations).filter(r => r.treaty).length, maxTech: Math.max(...alive.map(c => c.tech), 0), land: state.tiles.filter(isLand).length, claimed: state.tiles.filter(t => t.owner >= 0).length };
  }
  return { VERSION, WIDTH, HEIGHT, TERRAIN, CIVS, POLICIES, TECHS, SCENARIOS, BRANCHES, RESEARCH, BUILDINGS, SITES, DECISIONS, GOALS, RESOURCE_NAMES, createWorld, tick, command, replay, serialize, deserialize, summary, neighbors, distance, capacities, isLand, pairKey, bonuses, afford, costText, buildingStatus, researchStatus, explorationStatus, constructionRate, settlementStatus, diplomacyStatus, goalProgress };
});
