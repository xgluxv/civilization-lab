(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivLabV1 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
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
    const city = { id: state.nextCity++, name: cityName(civ), civId: civ.id, tile: tileIndex, founded: state.year, capital: initial };
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
    updateCounts(state);
    recordHistory(state);
    return state;
  }

  function updateCounts(state) { for (const c of state.civs) c.territory = state.tiles.reduce((s, t) => s + (t.owner === c.id ? 1 : 0), 0); }
  function capacities(state, civ) {
    const tiles = owned(state, civ.id);
    const sums = tiles.reduce((s, t) => { const r = TERRAIN[t.type]; s.food += r.food; s.wood += r.wood; s.ore += r.ore; s.capacity += r.capacity; return s; }, { food: 0, wood: 0, ore: 0, capacity: 0 });
    const count = Math.max(1, tiles.length);
    return { food: sums.food / count, wood: sums.wood / count, ore: sums.ore / count, capacity: sums.capacity * (1 + civ.tech * 0.11) };
  }
  function produce(state, civ) {
    const p = POLICIES[civ.policy], cap = capacities(state, civ), oldPopulation = civ.population, oldFood = civ.food;
    const productivity = (1 + civ.tech * 0.115) * (0.72 + civ.happiness / 250);
    const weather = (state.climate.drought ? 0.58 : 1) * (state.climate.bumper ? 1.25 : 1);
    const harvest = civ.population * p.farm * cap.food * 0.73 * productivity * state.config.fertility * weather;
    const consumption = civ.population * 0.33 + civ.military * 0.05;
    civ.food += harvest - consumption;
    civ.shortage = civ.food < 0;
    const starvation = civ.shortage ? Math.min(0.075, (-civ.food / Math.max(consumption, 1)) * 0.08) : 0;
    civ.food = clamp(civ.food, 0, Math.max(140, civ.population * 4));
    civ.wood = clamp(civ.wood + civ.population * p.craft * (0.05 + cap.wood * 0.24) * productivity - civ.population * 0.007, 0, 1e7);
    civ.ore = clamp(civ.ore + civ.population * p.craft * cap.ore * 0.18 * productivity, 0, 1e7);
    const revenue = civ.population * 0.035 * (1 + civ.tech * 0.04);
    civ.wealth = clamp(civ.wealth + revenue - civ.military * 0.13, 0, 1e7);
    const desiredMilitary = civ.population * p.military * 0.6;
    const recruitment = Math.min(Math.max(0, desiredMilitary - civ.military) * 0.2, civ.ore / 1.3, civ.wealth / 1.8);
    civ.military = Math.max(0, civ.military * (civ.shortage ? 0.96 : 0.985) + recruitment);
    civ.ore -= recruitment * 1.3; civ.wealth -= recruitment * 1.8;
    civ.science += civ.population * p.research * 0.19 * productivity * (civ.shortage ? 0.65 : 1);
    if (civ.tech < TECHS.length - 1 && civ.science >= TECHS[civ.tech].cost) {
      civ.science -= TECHS[civ.tech].cost; civ.tech++;
      log(state, 'tech', `${civ.name}掌握了「${TECHS[civ.tech].name}」。`, civ.id);
    }
    const crowding = civ.population / Math.max(1, cap.capacity);
    const growth = 0.021 * (1 - crowding) * (civ.happiness / 80) - starvation;
    civ.population = Math.max(8, civ.population * (1 + clamp(growth, -0.1, 0.025)));
    const wars = Object.values(state.relations).filter(r => r.war && (r.a === civ.id || r.b === civ.id)).length;
    const targetHappiness = clamp(75 + Math.min(12, civ.food / civ.population * 4) + civ.tech * 1.3 - (civ.shortage ? 35 : 0) - wars * 10 - Math.max(0, crowding - 0.85) * 22, 15, 98);
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
    const defense = state.tiles[target].type === 'mountain' ? 1.5 : 1;
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
          const aIncome = income * POLICIES[a.policy].trade, bIncome = income * POLICIES[b.policy].trade;
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
    if (state.climate.drought > 0 && --state.climate.drought === 0) log(state, 'climate', '旱季结束，雨水重新浸润大地。');
    if (state.climate.bumper > 0) state.climate.bumper--;
    if (state.year % 5 !== 0 || rand(state) >= state.config.disasters * 0.13) return;
    const alive = activeCivs(state); if (!alive.length) return;
    const civ = alive[Math.floor(rand(state) * alive.length)];
    const roll = rand(state);
    if (roll < 0.38 && !state.climate.drought) {
      state.climate.drought = 4 + Math.floor(rand(state) * 4); state.stats.disasters++;
      log(state, 'climate', `大地进入持续${state.climate.drought}年的旱季。`);
    } else if (roll < 0.7) {
      const loss = civ.population * (0.025 + rand(state) * 0.025) / (1 + civ.tech * 0.12);
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
      for (const c of state.civs) if (c.alive) { produce(state, c); expand(state, c); developCities(state, c); }
      diplomacy(state); updateCounts(state); recordHistory(state);
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
    } else throw new Error('未知的干预指令。');
    if (record) state.commands.push({ year: state.year, action: normalized });
    return state;
  }
  function replay(state, targetYear = state.year) {
    if (!Number.isSafeInteger(targetYear) || targetYear < 0 || targetYear > 50000) throw new Error('回放年份超出范围。');
    const result = createWorld({ seed: state.seed, scenario: state.scenario });
    let cursor = 0;
    for (let year = 0; year <= targetYear; year++) {
      while (cursor < state.commands.length && state.commands[cursor].year === year) command(result, state.commands[cursor++].action);
      if (year < targetYear) tick(result);
    }
    return result;
  }
  // Store the seed and ordered actions. Rebuilding validates all imported data;
  // no imported object is merged into live state or trusted as engine state.
  function serialize(state) { return JSON.stringify({ format: 'civilization-lab', version: VERSION, seed: state.seed, scenario: state.scenario, year: state.year, commands: state.commands }, null, 2); }
  function deserialize(json) {
    if (typeof json !== 'string' || json.length > 2e6) throw new Error('存档过大，或格式无效。');
    let data; try { data = JSON.parse(json); } catch { throw new Error('无法读取这个 JSON 存档。'); }
    if (!data || data.format !== 'civilization-lab' || data.version !== VERSION || typeof data.seed !== 'string' || data.seed.length > 100 || !Object.hasOwn(SCENARIOS, data.scenario) || !Number.isSafeInteger(data.year) || data.year < 0 || data.year > 50000 || !Array.isArray(data.commands) || data.commands.length > 10000) throw new Error('存档版本或内容不受支持。');
    let prev = -1;
    for (const entry of data.commands) {
      if (!entry || !Number.isSafeInteger(entry.year) || entry.year < 0 || entry.year < prev || entry.year > data.year || !entry.action) throw new Error('存档中的时间线无效。');
      prev = entry.year;
    }
    return replay(data, data.year);
  }
  function summary(state) {
    const alive = activeCivs(state);
    return { year: state.year, population: alive.reduce((s, c) => s + c.population, 0), cities: state.cities.length, civilizations: alive.length, wars: Object.values(state.relations).filter(r => r.war).length, treaties: Object.values(state.relations).filter(r => r.treaty).length, maxTech: Math.max(...alive.map(c => c.tech), 0), land: state.tiles.filter(isLand).length, claimed: state.tiles.filter(t => t.owner >= 0).length };
  }
  return { VERSION, WIDTH, HEIGHT, TERRAIN, CIVS, POLICIES, TECHS, SCENARIOS, createWorld, tick, command, replay, serialize, deserialize, summary, neighbors, distance, capacities, isLand, pairKey };
});
