(function () {
  'use strict';
  const E = window.CivLab;
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
  const compact = n => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : fmt.format(Math.round(n));
  const escape = s => String(s).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const COLORS = {
    ocean: '#172d33', coast: '#23464c', plain: '#59775b', forest: '#355d49', hill: '#787958', mountain: '#929080', desert: '#9b8860'
  };
  const STORAGE = 'civilization-lab-v2';
  const MAX_YEAR = 50000;
  let state = E.createWorld(), selected = 0, layer = 'territory', running = false, lastFrame = 0, carry = 0;
  let toastTimer, work = null, hoverTile = -1, keyboardTile = state.cities[0].tile, chartMetric = 'population';
  let terrainCache = null, terrainCacheLayer = '', currentSeed = '', lastEvents = '', lastLegend = '', chartHover = null;
  let panel = 'cities', selectedCity = state.cities[0].id, selectedSite = null, selectedTile = null, lastCommand = '', lastDecision = '', lastVictory = '';
  let camera = { zoom: 1, x: .5, y: .5 }, drag = null, dragged = false;
  const map = $('world-map'), mapContext = map.getContext('2d'), chart = $('history-chart'), chartContext = chart.getContext('2d');

  function toast(message, error = false) {
    clearTimeout(toastTimer); const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, error ? 6500 : 3500);
  }
  function setRunning(value) {
    if (value && state.civs[state.playerId].decision) { toast('议事厅有待决定的事项，请先作出选择。'); value = false; }
    running = value && state.year < MAX_YEAR; carry = 0; lastFrame = 0;
    $('play-icon').textContent = running ? 'Ⅱ' : '▶'; $('play-label').textContent = running ? '暂停演化' : '开始演化';
    $('run-status').textContent = state.year >= MAX_YEAR ? '已到时间上限' : running ? '历史正在发生' : '时间已暂停';
    $('run-status').classList.toggle('running', running);
    $('play').setAttribute('aria-pressed', String(running));
  }
  function advance(years) {
    if (work) return;
    const amount = Math.min(years, MAX_YEAR - state.year);
    if (amount <= 0) { setRunning(false); toast('已到50,000年上限。可以回到过去继续实验。'); return; }
    if (state.civs[state.playerId].decision) { setRunning(false); toast('请先处理议事，再推进时间。'); return; }
    for (let i = 0; i < amount; i++) {
      E.tick(state, 1);
      if (state.civs[state.playerId].decision || state.victory?.year === state.year || !state.civs[state.playerId].alive) { setRunning(false); break; }
    }
    if (state.year >= MAX_YEAR) setRunning(false);
    render();
  }
  function selectCiv(id) {
    if (!Number.isInteger(id) || id < 0 || id >= state.civs.length) return;
    selected = id;
    const city = state.cities.find(c => c.civId === id); if (city) keyboardTile = city.tile;
    renderProfile(); renderLegend(); renderEvents(); drawMap(); drawChart();
  }
  function apply(action, message) {
    if (work) return;
    setRunning(false);
    try { E.command(state, action); render(); if (message) toast(message); } catch (err) { toast(err.message, true); }
  }
  function syncSettings() {
    $('scenario').value = state.scenario; $('seed').value = state.seed;
    for (const name of ['fertility', 'aggression', 'disasters']) { $(name).value = state.config[name]; updateSlider(name); }
  }
  function updateSlider(name) { const value = Number($(name).value); $(`${name}-value`).textContent = name === 'fertility' ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`; }
  function replaceWorld(next, message) {
    state = next; setRunning(false); terrainCache = null; lastEvents = ''; hoverTile = -1; chartHover = null;
    selected = state.playerId; selectedCity = state.cities.find(c => c.civId === state.playerId)?.id;
    selectedTile = null; selectedSite = null; lastCommand = ''; lastDecision = ''; lastVictory = ''; camera = { zoom: 1, x: .5, y: .5 };
    keyboardTile = state.cities.find(c => c.civId === selected)?.tile ?? 0;
    syncSettings(); render(); if (message) toast(message);
  }
  function rebuild(kind, payload, message) {
    if (work) return;
    setRunning(false); $('busy').hidden = false;
    $('busy-text').textContent = kind === 'import' ? '正在验证存档并重建每一次干预……' : `正在重建至世界历${payload.year}年……`;
    const engineSource = ['content-source','legacy-source','engine-source'].map(id => $(id).textContent).join('\n');
    const workerCode = engineSource + '\nself.onmessage = function (event) { try { const p = event.data; const result = p.kind === "import" ? CivLab.deserialize(p.payload) : CivLab.replay(p.payload.state, p.payload.year); self.postMessage({ ok: true, state: result }); } catch(error) { self.postMessage({ ok: false, message: error.message }); } };';
    let url;
    try {
      url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
      const worker = new Worker(url); work = { worker, url };
      worker.onmessage = event => {
        finishWork();
        if (event.data.ok) { safeguard(); replaceWorld(event.data.state, message); }
        else toast(event.data.message, true);
      };
      worker.onerror = () => { finishWork(); toast('无法在此浏览器中重建历史。请使用较新的 Chrome、Edge 或 Firefox。', true); };
      worker.postMessage({ kind, payload });
    } catch (err) { if (url) URL.revokeObjectURL(url); finishWork(); toast(`重建未开始：${err.message}`, true); }
  }
  function finishWork() { if (work) { work.worker.terminate(); URL.revokeObjectURL(work.url); work = null; } $('busy').hidden = true; }

  function renderLegend() {
    const signature = `${selected}:${state.civs.map(c => c.alive).join(',')}`;
    if (signature === lastLegend) return;
    lastLegend = signature;
    const fragment = document.createDocumentFragment();
    for (const c of state.civs) {
      const button = document.createElement('button'); button.className = `civ-chip${c.alive ? '' : ' is-gone'}`; button.type = 'button';
      button.setAttribute('aria-pressed', String(c.id === selected)); button.setAttribute('aria-label', `观察${c.name}${c.alive ? '' : '（已退出历史）'}`);
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = E.CIVS[c.id].color; swatch.setAttribute('aria-hidden', 'true');
      button.append(swatch, document.createTextNode(E.CIVS[c.id].short)); button.addEventListener('click', () => selectCiv(c.id)); fragment.append(button);
    }
    $('civ-legend').replaceChildren(fragment);
  }
  function renderProfile() {
    const c = state.civs[selected], cities = state.cities.filter(city => city.civId === selected), cap = E.capacities(state, c), tech = E.TECHS[c.tech];
    const progress = c.tech === E.TECHS.length - 1 ? 100 : Math.min(100, c.science / tech.cost * 100);
    const delta = c.populationDelta;
    const resource = (label, value, unit, detail = '') => `<div class="resource-cell"><span>${label}</span><div class="resource-value">${compact(value)}<small>${unit}</small></div><div class="resource-detail">${detail || '&nbsp;'}</div></div>`;
    $('profile').innerHTML = `<div class="profile-title"><div class="profile-name"><span class="swatch" style="background:${E.CIVS[c.id].color}"></span>${escape(E.CIVS[c.id].short)}</div><span class="profile-tag">${c.alive ? (c.shortage ? '粮食短缺' : '文明延续中') : '已退出历史'}</span></div><div class="profile-caption">${escape(c.name)} · ${cities.length}座城市 · ${c.territory}格领土</div><div class="resource-grid">${resource('人口', c.population, '人', `<span class="${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</span> / 年`)}${resource('粮食', c.food, '', `${c.foodDelta >= 0 ? '+' : ''}${c.foodDelta.toFixed(1)} / 年`)}${resource('木材', c.wood, '', `土地容量 ${compact(cap.capacity)}`)}${resource('财富', c.wealth, '', `贸易 +${c.tradeIncome.toFixed(1)} / 年`)}${resource('军事', c.military, '', `矿石 ${compact(c.ore)}`)}${resource('幸福度', c.happiness, '%', E.POLICIES[c.policy].name)}</div><div class="tech-line"><span>${escape(tech.name)}</span><span>Lv.${c.tech} / ${E.TECHS.length - 1}</span></div><div class="tech-track" role="progressbar" aria-label="下一项科技研究进度" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><div class="tech-fill" style="width:${progress}%"></div></div><div class="tech-caption">${c.tech === E.TECHS.length - 1 ? '已完成全部科技研究' : `下一时代：${escape(E.TECHS[c.tech + 1].name)} · ${Math.round(progress)}%`}</div>`;
    $('civ-number').textContent = `0${selected + 1} / 06`; $('policy').value = c.policy;
    $('policy').disabled = !c.alive || selected !== state.playerId; $('aid').disabled = !c.alive;
    $('policy-description').textContent = E.POLICIES[c.policy].description;
    const advice = !c.alive ? '这个文明已失去所有城市。可以生成新世界，尝试另一条道路。' : c.shortage ? '粮食告急。优先修建粮仓和农庄，或转向开拓政策。' : c.id !== state.playerId ? '正在观察其他文明。执政大厅始终管理你的文明。' : c.research.length === 0 ? '你有40点初始研究点。选择一项研究，开启新的建筑。' : !state.cities.some(city => city.civId === c.id && (city.queue.length || Object.keys(city.buildings).length)) ? '城市还没有工程。粮仓能改善粮食，伐木场能支持后续建设。' : c.population > 170 && cities.length < 4 ? '人口正在增长。点击本国边境的陆地，可以派遣开拓者建立新城。' : '拓展研究与建筑，派出使节建立商路。留意远征队的消息。';
    $('advisor').innerHTML = `<span class="eyebrow">顾问建议</span><p>${advice}</p>`;
    $('return-player').hidden = selected === state.playerId;
  }
  function renderEvents() {
    const filter = $('event-filter').value;
    const entries = state.events.filter(e => filter === 'all' || (filter === 'selected' ? e.civId === selected : filter === 'war' ? e.kind === 'war' || e.kind === 'peace' : e.kind === filter)).slice(-40).reverse();
    const signature = `${filter}:${selected}:${entries.map(e => e.id).join(',')}`;
    if (signature === lastEvents) return; lastEvents = signature;
    const marks = { city: '◇', tech: '✧', war: '×', peace: '≈', trade: '⇄', climate: '◌', intervention: '＋', build: '▣', explore: '⌖', council: '◇', victory: '★' };
    const fragment = document.createDocumentFragment();
    for (const e of entries) {
      const item = document.createElement('li'); item.className = `event ${e.kind}`;
      const year = document.createElement('span'); year.className = 'event-year'; year.textContent = `${e.year} 年`;
      const mark = document.createElement('span'); mark.className = 'event-mark'; mark.textContent = marks[e.kind] || '·'; mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.className = 'event-text'; text.textContent = e.text;
      item.append(year, mark, text); fragment.append(item);
    }
    $('events').replaceChildren(fragment); $('empty-events').hidden = entries.length > 0;
  }
  function render() {
    const sum = E.summary(state);
    $('year').textContent = String(state.year).padStart(4, '0'); $('era-label').textContent = E.TECHS[sum.maxTech].name;
    $('total-pop').textContent = compact(sum.population); $('total-cities').textContent = sum.cities;
    $('total-civs').textContent = sum.civilizations; $('total-treaties').textContent = sum.treaties; $('total-wars').textContent = sum.wars;
    $('total-land').textContent = Math.round(sum.claimed / Math.max(1, sum.land) * 100);
    $('world-name').textContent = E.SCENARIOS[state.scenario].name;
    $('weather').textContent = state.climate.drought ? `旱季 · 剩余${state.climate.drought}年` : state.climate.bumper ? `丰收期 · 剩余${state.climate.bumper}年` : '风调雨顺';
    $('replay-year').max = state.year;
    $('replay-year').min = state.origin?.year || 0;
    if (Number($('replay-year').value) < (state.origin?.year || 0)) $('replay-year').value = state.origin.year;
    if (Number($('replay-year').value) > state.year) $('replay-year').value = state.year;
    renderProfile(); renderLegend(); renderEvents(); renderCampaign(); renderCommands(); drawMap(); drawChart();
  }

  function player() { return state.civs[state.playerId]; }
  function button(label, data, disabled = false, primary = false) { return `<button class="button ${primary ? 'primary' : 'secondary'}" ${data} ${disabled ? 'disabled' : ''}>${label}</button>`; }
  function progressBar(value, label) { return `<div class="mini-track" role="progressbar" aria-label="${escape(label)}" aria-valuenow="${Math.round(value * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, value * 100))}%"></span></div>`; }
  function renderCampaign() {
    const c = player(), goals = E.goalProgress(state);
    $('reign-name').textContent = c.name; $('reign-name').style.color = E.CIVS[c.id].color;
    $('reign-goal').textContent = `${E.GOALS[state.goal].name}${state.sandboxUse ? ' · 辅助模式' : ''}`;
    $('goal-track').innerHTML = goals.map(g => `<div class="goal-pip ${g.complete ? 'complete' : ''}" title="${escape(g.label)}"><span>${g.complete ? '✓' : Math.round(g.progress * 100) + '%'}</span>${progressBar(g.progress, g.label)}</div>`).join('');
    $('campaign-settings').disabled = state.year !== (state.origin?.year || 0) || state.commands.some(e => ['build','research','choice','explore','diplomacy','settle'].includes(e.action.type));
    const decision = c.decision;
    const signature = decision ? `${decision.id}:${state.year}:${E.DECISIONS[decision.kind].options.map(o => E.afford(c, o.cost)).join()}` : 'none';
    if (signature !== lastDecision) {
      lastDecision = signature;
      $('decision-banner').hidden = !decision;
      if (decision) {
        const def = E.DECISIONS[decision.kind];
        $('decision-banner').innerHTML = `<div class="decision-intro"><span class="decision-symbol" aria-hidden="true">◇</span><div><span class="eyebrow">议事厅 · 等待你的决定</span><h2>${def.title}</h2><p>${def.text}</p></div></div><div class="decision-options">${def.options.map(o => `<button class="decision-choice" data-choice="${o.id}" ${!E.afford(c, o.cost) ? 'disabled' : ''}><strong>${o.name} <span>↗</span></strong><span>${o.detail}</span>${!E.afford(c, o.cost) ? '<small>资源不足</small>' : ''}</button>`).join('')}</div>`;
      }
    }
    const victorySignature = `${state.victory?.year ?? 'none'}:${c.alive}`;
    if (lastVictory !== victorySignature) {
      lastVictory = victorySignature;
      $('victory-banner').hidden = !state.victory && c.alive;
      if (state.victory) $('victory-banner').innerHTML = `<span class="victory-star">✦</span><div><span class="eyebrow">${state.victory.assisted ? '辅助通关' : '目标达成'} · 世界历${state.victory.year}年</span><h2>${c.name}，${E.GOALS[state.goal].name}的缔造者。</h2><p>你可以继续演化，或生成新世界挑战另一条路线。</p></div>`;
      else if (!c.alive) $('victory-banner').innerHTML = '<div><h2>你的文明已落幕。</h2><p>历史仍会继续。可以继续观察，或生成新世界再出发。</p></div>';
    }
  }
  function setPanel(next) {
    panel = next; lastCommand = ''; setRunning(false);
    document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.panel === panel)));
    $('command-body').setAttribute('aria-labelledby', `tab-${panel}`);
    renderCommands();
  }
  function renderCommands() {
    const c = player();
    $('command-resources').textContent = `木材 ${compact(c.wood)} · 矿石 ${compact(c.ore)} · 财富 ${compact(c.wealth)} · 研究 ${compact(c.insight)}`;
    const signature = `${panel}:${state.year}:${state.commands.length}:${selectedCity}:${selectedSite}:${selectedTile}:${c.alive}`;
    if (signature === lastCommand) return; lastCommand = signature;
    if (!c.alive) { $('command-body').innerHTML = '<p class="panel-note">你的文明已退出历史。生成新世界可以重新开始。</p>'; return; }
    let html = '';
    if (panel === 'cities') {
      const cities = state.cities.filter(city => city.civId === c.id);
      let city = cities.find(city => city.id === selectedCity) || cities[0]; selectedCity = city.id;
      const rate = E.constructionRate(state, c.id);
      html += `<div class="city-picker"><label for="city-picker">管理城市</label><select id="city-picker">${cities.map(city => `<option value="${city.id}" ${city.id === selectedCity ? 'selected' : ''}>${escape(city.name)}${city.capital ? ' · 首都' : ''}</option>`).join('')}</select><span>建设速度 ${rate.toFixed(1)} / 年</span></div>`;
      if (selectedTile !== null) {
        const status = E.settlementStatus(state, c.id, selectedTile);
        html += `<div class="settle-strip"><div><strong>开拓者 · 坐标 ${selectedTile % state.width + 1}, ${Math.floor(selectedTile / state.width) + 1}</strong><p>${status.available ? E.costText(status.cost) : status.reason}</p></div>${button('在此建城', 'data-action="settle"', !status.available)}</div>`;
      }
      html += `<div class="queue-heading"><h3>建设队列 <span>${city.queue.length} / 3</span></h3><span>取消返还未施工部分80%的资源</span></div><div class="build-queue">${city.queue.length ? city.queue.map((q, i) => `<div class="queue-item"><div><strong>${E.BUILDINGS[q.building].name} Lv.${q.level}</strong><span>${i === 0 ? '约' + Math.ceil((q.work - q.progress) / rate) + '年完成' : '等待施工'}</span>${progressBar(q.progress / q.work, E.BUILDINGS[q.building].name)}</div><button class="queue-cancel" data-cancel="${i}" aria-label="取消${E.BUILDINGS[q.building].name}工程">×</button></div>`).join('') : '<p class="queue-empty">选择一项工程，让城市开始生长。</p>'}</div>`;
      html += '<div class="building-grid">';
      for (const [id, def] of Object.entries(E.BUILDINGS)) {
        const status = E.buildingStatus(state, c.id, city.id, id), built = city.buildings[id] || 0;
        html += `<article class="building-card ${def.unique ? 'wonder-card' : ''}"><div class="building-top"><span class="building-mark">${def.mark}</span><div><h3>${def.name}</h3><span>${def.category} · ${built ? 'Lv.' + built : '尚未建造'}</span></div></div><p>${def.description}</p><div class="cost-label">${E.costText(status.cost)}</div>${button(status.available ? `${built ? '升级' : '建造'} · 约${Math.ceil(status.work / rate)}年` : status.reason, `data-build="${id}"`, !status.available)}</article>`;
      }
      html += '</div><p class="panel-note">普通建筑加成取本国各城平均；研究与奇观加成作用于整个文明。扩张领土会自动进行，新城市由你选址建立。</p>';
    } else if (panel === 'research') {
      html += `<div class="research-summary"><strong>${compact(c.insight)} <span>研究点</span></strong><span>每年 +${c.insightDelta.toFixed(1)} · 已掌握 ${c.research.length} / 12</span></div><div class="research-branches">`;
      for (const [branch, branchDef] of Object.entries(E.BRANCHES)) {
        html += `<section class="research-branch"><h3><span style="color:${branchDef.color}">${branchDef.mark}</span>${branchDef.name}</h3>`;
        for (const [id, def] of Object.entries(E.RESEARCH).filter(([, def]) => def.branch === branch)) {
          const status = E.researchStatus(state, c.id, id), complete = c.research.includes(id);
          html += `<article class="research-node ${complete ? 'complete' : ''}"><span class="research-tier">${complete ? '✓ 已掌握' : def.cost + ' 研究点'}</span><h4>${def.name}</h4><p>${def.description}</p>${button(complete ? '已掌握' : status.available ? '完成研究 ↗' : status.reason, `data-research="${id}"`, !status.available, status.available)}</article>`;
        }
        html += '</section>';
      }
      html += '</div><p class="panel-note">时代研究会自动进行。专项研究需要你选择；所有路线都可以学习，先后顺序决定早期优势。</p>';
    } else if (panel === 'explore') {
      const expedition = state.expeditions.find(e => e.civId === c.id);
      if (expedition) {
        const site = state.sites.find(s => s.id === expedition.siteId);
        html += `<div class="expedition-status"><strong>远征队正在前往${E.SITES[site.type].name}</strong><span>还有${expedition.arrives - state.year}年归来</span>${progressBar((state.year - expedition.started) / (expedition.arrives - expedition.started), '远征进度')}</div>`;
      }
      html += `<div class="explore-heading"><p>每次派遣消耗30粮食、25财富。每个文明同时可派出一支远征队。</p><span>已成功探索 ${c.relics} 处</span></div><div class="site-grid">`;
      const sites = [...state.sites].sort((a, b) => (a.id === selectedSite ? -1000 : E.explorationStatus(state, c.id, a.id).distance) - (b.id === selectedSite ? -1000 : E.explorationStatus(state, c.id, b.id).distance));
      for (const site of sites) {
        const def = E.SITES[site.type], status = E.explorationStatus(state, c.id, site.id);
        html += `<article class="site-card ${site.claimedBy >= 0 ? 'claimed' : ''} ${site.id === selectedSite ? 'selected-site' : ''}"><div class="site-card-heading"><span class="site-mark">${def.mark}</span><div><h3>${def.name} <small>#${site.id + 1}</small></h3><span>${Math.ceil(status.distance)}格外 · ${status.duration}年行程 · 失败率 ${Math.round(status.risk * 100)}%</span></div><button class="text-button" data-locate="${site.id}" aria-label="定位遗迹${site.id + 1}">⌖</button></div><p>${def.description}</p><div class="cost-label">回报：${E.costText(def.reward)}</div>${button(status.available ? '派遣远征队 ↗' : status.reason, `data-explore="${site.id}"`, !status.available)}</article>`;
      }
      html += '</div>';
    } else if (panel === 'diplomacy') {
      html += '<p class="panel-note">使节提高关系；关系超过38后签署通商条约。宣战需要接壤，战斗每3年在边境发生一次。</p><div class="diplomacy-list">';
      for (const other of state.civs.filter(o => o.id !== c.id)) {
        const r = state.relations[E.pairKey(c.id, other.id)], status = !other.alive ? '已退出历史' : r.war ? '战争中' : r.treaty ? '通商伙伴' : r.value < 0 ? '关系紧张' : '和平往来';
        html += `<article class="diplomacy-row"><div class="diplomacy-identity"><span class="swatch" style="background:${E.CIVS[other.id].color}"></span><strong>${other.name}</strong><span class="${r.war ? 'negative' : 'muted'}">${status}</span></div><div class="relation-details"><span>关系 ${Math.round(r.value)}</span><span>军事 ${compact(other.military)}</span><span>年贸易 ${r.trade.toFixed(1)}</span></div><div class="relation-actions">`;
        for (const [action, label] of [['envoy', '派遣使节'], [r.war ? 'ceasefire' : 'declare', r.war ? '谈判停战' : '宣战']]) {
          const available = E.diplomacyStatus(state, c.id, other.id, action);
          html += `<div>${button(`${label} · ${available.cost.wealth}财富`, `data-diplomacy="${action}" data-target="${other.id}"`, !available.available)}${available.reason ? `<small>${available.reason}</small>` : ''}</div>`;
        }
        html += '</div></article>';
      }
      html += '</div>';
    } else {
      const def = E.GOALS[state.goal];
      html += `<div class="goal-intro"><span class="eyebrow">${state.sandboxUse ? '辅助模式' : '自主执政'}</span><h3>${def.name}</h3><p>${def.description} 所有条件同时满足即可达成目标，之后仍可继续游玩。</p></div><div class="objective-grid">`;
      for (const g of E.goalProgress(state)) html += `<div class="objective ${g.complete ? 'complete' : ''}"><div><span>${g.complete ? '✓' : '○'} ${g.label}</span><strong>${compact(g.value)} / ${compact(g.target)}</strong></div>${progressBar(g.progress, g.label)}</div>`;
      html += `</div><p class="panel-note">${state.sandboxUse ? `已使用${state.sandboxUse}次沙盒干预，达成目标时会记录为辅助通关。` : '援助、天气和全局参数位于沙盒干预中；使用后会标记辅助通关。正常建设、研究和外交不受影响。'}</p>`;
    }
    $('command-body').innerHTML = html;
  }

  function setupCanvas(canvas, context) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const pixelsW = Math.round(width * dpr), pixelsH = Math.round(height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) { canvas.width = pixelsW; canvas.height = pixelsH; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, dpr };
  }
  function mix(a, b, ratio) {
    const ai = parseInt(a.slice(1), 16), bi = parseInt(b.slice(1), 16);
    const channel = shift => Math.round(((ai >> shift) & 255) * (1 - ratio) + ((bi >> shift) & 255) * ratio);
    return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
  }
  function buildTerrain(width, height, dpr) {
    const cache = document.createElement('canvas'); cache.width = Math.round(width * dpr); cache.height = Math.round(height * dpr);
    const context = cache.getContext('2d'); context.scale(dpr, dpr);
    const tw = width / state.width, th = height / state.height;
    for (const t of state.tiles) {
      const x = t.index % state.width * tw, y = Math.floor(t.index / state.width) * th;
      let color = COLORS[t.type];
      if (layer === 'resources' && E.isLand(t)) {
        const resource = E.TERRAIN[t.type];
        color = resource.ore > 0.6 ? '#a496a8' : resource.wood > 0.5 ? '#3c8b64' : resource.food > 1 ? '#bdab69' : '#686751';
      }
      const jitter = ((t.index * 73) % 17 - 8) / 250;
      context.fillStyle = mix(color, jitter > 0 ? '#c6d3ba' : '#0c2923', Math.abs(jitter));
      context.fillRect(Math.floor(x), Math.floor(y), Math.ceil(tw) + 1, Math.ceil(th) + 1);
      if (t.type === 'mountain') {
        context.beginPath(); context.moveTo(x + tw * .22, y + th * .77); context.lineTo(x + tw * .52, y + th * .2); context.lineTo(x + tw * .82, y + th * .77); context.strokeStyle = '#c2c1a955'; context.lineWidth = .8; context.stroke();
      } else if (t.type === 'forest' && (t.index % 3 === 0)) {
        context.fillStyle = '#1b463c60'; context.beginPath(); context.arc(x + tw * .6, y + th * .45, Math.max(1, tw * .22), 0, Math.PI * 2); context.fill();
      } else if (t.type === 'ocean' && t.index % 29 === 0) {
        context.strokeStyle = '#537b8029'; context.lineWidth = .8; context.beginPath(); context.moveTo(x + tw * .12, y + th * .5); context.lineTo(x + tw * .7, y + th * .5); context.stroke();
      }
    }
    terrainCache = cache; terrainCacheLayer = layer; currentSeed = `${state.seed}:${state.scenario}`;
  }
  function drawMap() {
    const { width, height, dpr } = setupCanvas(map, mapContext), ctx = mapContext;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    const offset = cameraOffset(width, height);
    ctx.translate(offset.x, offset.y); ctx.scale(camera.zoom, camera.zoom);
    if (!terrainCache || terrainCache.width !== map.width || terrainCache.height !== map.height || terrainCacheLayer !== layer || currentSeed !== `${state.seed}:${state.scenario}`) buildTerrain(width, height, dpr);
    ctx.drawImage(terrainCache, 0, 0, width, height);
    const tw = width / state.width, th = height / state.height;
    if (layer === 'territory') {
      for (const t of state.tiles) if (t.owner >= 0) {
        const x = t.index % state.width * tw, y = Math.floor(t.index / state.width) * th;
        ctx.fillStyle = E.CIVS[t.owner].color; ctx.globalAlpha = t.owner === selected ? .45 : .25;
        ctx.fillRect(x, y, tw + .3, th + .3);
      }
      ctx.globalAlpha = 1;
      for (const t of state.tiles) if (t.owner >= 0) {
        const x = t.index % state.width, y = Math.floor(t.index / state.width);
        const same = n => n >= 0 && n < state.tiles.length && state.tiles[n].owner === t.owner;
        ctx.beginPath();
        if (x === 0 || !same(t.index - 1)) { ctx.moveTo(x * tw, y * th); ctx.lineTo(x * tw, (y + 1) * th); }
        if (x === state.width - 1 || !same(t.index + 1)) { ctx.moveTo((x + 1) * tw, y * th); ctx.lineTo((x + 1) * tw, (y + 1) * th); }
        if (y === 0 || !same(t.index - state.width)) { ctx.moveTo(x * tw, y * th); ctx.lineTo((x + 1) * tw, y * th); }
        if (y === state.height - 1 || !same(t.index + state.width)) { ctx.moveTo(x * tw, (y + 1) * th); ctx.lineTo((x + 1) * tw, (y + 1) * th); }
        ctx.strokeStyle = E.CIVS[t.owner].color; ctx.lineWidth = t.owner === selected ? 1.5 : .8; ctx.globalAlpha = t.owner === selected ? .9 : .65; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Trade routes connect the closest pair of cities, rather than arbitrary capitals.
    for (const r of Object.values(state.relations)) if (r.treaty && r.trade > 0) {
      const aCities = state.cities.filter(c => c.civId === r.a), bCities = state.cities.filter(c => c.civId === r.b);
      let closest = null, distance = Infinity;
      for (const a of aCities) for (const b of bCities) { const d = E.distance(state, a.tile, b.tile); if (d < distance) { distance = d; closest = [a, b]; } }
      if (!closest) continue;
      const [a, b] = closest, ax = (a.tile % state.width + .5) * tw, ay = (Math.floor(a.tile / state.width) + .5) * th, bx = (b.tile % state.width + .5) * tw, by = (Math.floor(b.tile / state.width) + .5) * th;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - Math.min(20, distance), bx, by); ctx.setLineDash([3, 5]); ctx.strokeStyle = '#e4d2a652'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }
    for (const site of state.sites) {
      const x = (site.tile % state.width + .5) * tw, y = (Math.floor(site.tile / state.width) + .5) * th, radius = 3.5 / Math.sqrt(camera.zoom);
      ctx.beginPath(); ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();
      ctx.fillStyle = site.claimedBy >= 0 ? E.CIVS[site.claimedBy].color : '#243837'; ctx.fill(); ctx.lineWidth = 1 / camera.zoom; ctx.strokeStyle = site.claimedBy >= 0 ? E.CIVS[site.claimedBy].color : '#ead6a0'; ctx.globalAlpha = site.claimedBy >= 0 ? .45 : .95; ctx.stroke(); ctx.globalAlpha = 1;
      if (site.id === selectedSite) { ctx.beginPath(); ctx.arc(x, y, radius + 4 / camera.zoom, 0, Math.PI * 2); ctx.strokeStyle = '#f8dc96'; ctx.stroke(); }
    }
    for (const expedition of state.expeditions) {
      const site = state.sites.find(s => s.id === expedition.siteId), ratio = Math.max(0, Math.min(1, (state.year - expedition.started) / (expedition.arrives - expedition.started)));
      const ax = (expedition.from % state.width + .5) * tw, ay = (Math.floor(expedition.from / state.width) + .5) * th;
      const bx = (site.tile % state.width + .5) * tw, by = (Math.floor(site.tile / state.width) + .5) * th;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.setLineDash([3 / camera.zoom, 4 / camera.zoom]); ctx.lineWidth = 1 / camera.zoom; ctx.strokeStyle = E.CIVS[expedition.civId].color; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ax + (bx - ax) * ratio, ay + (by - ay) * ratio, 3 / camera.zoom, 0, Math.PI * 2); ctx.fillStyle = '#fff3cd'; ctx.fill();
    }
    const placed = [], cityRadius = (width < 500 ? 2.7 : 3.4) / Math.sqrt(camera.zoom);
    const orderedCities = [...state.cities].sort((a, b) => (b.civId === selected ? 2 : 0) + (b.capital ? 1 : 0) - ((a.civId === selected ? 2 : 0) + (a.capital ? 1 : 0)));
    for (const city of orderedCities) {
      const x = (city.tile % state.width + .5) * tw, y = (Math.floor(city.tile / state.width) + .5) * th;
      ctx.fillStyle = E.CIVS[city.civId].color; ctx.strokeStyle = '#142522'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, cityRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (city.capital) { ctx.beginPath(); ctx.arc(x, y, cityRadius + 2.4, 0, Math.PI * 2); ctx.strokeStyle = E.CIVS[city.civId].color; ctx.lineWidth = .8; ctx.stroke(); }
      if (width < 450 && !city.capital && city.civId !== selected) continue;
      ctx.font = `${(width < 450 ? 10 : 11) / Math.sqrt(camera.zoom)}px "Microsoft YaHei",sans-serif`;
      const labelWidth = ctx.measureText(city.name).width, labelX = Math.max(4, Math.min(width - labelWidth - 5, x + 8)), labelY = Math.max(30, y - 4);
      const box = { x: labelX - 3, y: labelY - 11, w: labelWidth + 6, h: 16 };
      if (placed.some(p => !(box.x > p.x + p.w + 3 || box.x + box.w < p.x - 3 || box.y > p.y + p.h + 2 || box.y + box.h < p.y - 2))) continue;
      placed.push(box); ctx.fillStyle = '#15282bd4'; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.fillStyle = '#ecebdd'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(city.name, labelX, labelY + 1);
    }
    const focusTile = document.activeElement === map ? keyboardTile : hoverTile;
    if (focusTile >= 0) { ctx.strokeStyle = '#f6e5b9'; ctx.lineWidth = 1.5; ctx.strokeRect(focusTile % state.width * tw + 1, Math.floor(focusTile / state.width) * th + 1, tw - 2, th - 2); }
    ctx.restore();
    if (layer === 'resources') {
      ctx.font = '11px "Microsoft YaHei",sans-serif'; ctx.fillStyle = '#112a2cd9'; ctx.fillRect(10, height - 28, 208, 21); ctx.fillStyle = '#e2e7dc'; ctx.fillText('金黄：粮食   绿：木材   灰紫：矿石', 17, height - 13);
    }
  }
  function cameraOffset(width, height) { return { x: width / 2 - camera.x * width * camera.zoom, y: height / 2 - camera.y * height * camera.zoom }; }
  function clampCamera() { const inset = .5 / camera.zoom; camera.x = Math.max(inset, Math.min(1 - inset, camera.x)); camera.y = Math.max(inset, Math.min(1 - inset, camera.y)); }
  function zoomMap(factor) { camera.zoom = Math.max(1, Math.min(4, camera.zoom * factor)); clampCamera(); drawMap(); }
  function tileAt(event) {
    const rect = map.getBoundingClientRect();
    const offset = cameraOffset(rect.width, rect.height);
    const x = Math.min(state.width - 1, Math.max(0, Math.floor((event.clientX - rect.left - offset.x) / camera.zoom / rect.width * state.width)));
    const y = Math.min(state.height - 1, Math.max(0, Math.floor((event.clientY - rect.top - offset.y) / camera.zoom / rect.height * state.height)));
    return y * state.width + x;
  }
  function tileText(index) {
    const tile = state.tiles[index], city = state.cities.find(c => c.tile === index), site = state.sites.find(s => s.tile === index);
    return `${city ? `${city.name} · ` : ''}${site ? E.SITES[site.type].name + ' #' + (site.id + 1) + ' · ' : ''}${E.TERRAIN[tile.type].name} · ${tile.owner >= 0 ? state.civs[tile.owner].name : E.isLand(tile) ? '未开发土地' : '公共海域'}`;
  }
  function selectTile(index) {
    const tile = state.tiles[index]; keyboardTile = index;
    if (tile.owner >= 0) selectCiv(tile.owner);
    keyboardTile = index;
    const city = state.cities.find(c => c.tile === index), site = state.sites.find(s => s.tile === index);
    if (site) { selectedSite = site.id; setPanel('explore'); }
    else if (city?.civId === state.playerId) { selectedCity = city.id; selectedTile = null; setPanel('cities'); }
    else if (E.isLand(tile) && (tile.owner === state.playerId || tile.owner < 0)) { selectedTile = index; setPanel('cities'); }
    $('tile-info').textContent = tileText(index);
    drawMap();
  }

  let chartLayout = null;
  function drawChart() {
    const { width, height } = setupCanvas(chart, chartContext), ctx = chartContext;
    ctx.clearRect(0, 0, width, height);
    const margin = { left: 48, right: 16, top: 26, bottom: 30 }, plotWidth = Math.max(1, width - margin.left - margin.right), plotHeight = height - margin.top - margin.bottom;
    const history = state.history;
    const maximum = Math.max(1, ...history.flatMap(h => h.civs.map(c => c[chartMetric])));
    const step = niceStep(maximum / 3), topValue = Math.ceil(maximum / step) * step;
    const firstYear = history[0].year, lastYear = Math.max(firstYear + 1, state.year);
    const x = year => margin.left + (year - firstYear) / (lastYear - firstYear) * plotWidth;
    const y = value => margin.top + (1 - value / topValue) * plotHeight;
    chartLayout = { margin, plotWidth, plotHeight, firstYear, lastYear, topValue, x, y };
    ctx.font = '10px "Microsoft YaHei",sans-serif'; ctx.textBaseline = 'middle';
    for (let value = 0; value <= topValue + step * .01; value += step) {
      const py = y(value); ctx.beginPath(); ctx.moveTo(margin.left, py); ctx.lineTo(width - margin.right, py); ctx.strokeStyle = '#2a3b3d'; ctx.lineWidth = .7; ctx.stroke();
      ctx.fillStyle = '#849a96'; ctx.textAlign = 'right'; ctx.fillText(compact(value), margin.left - 9, py);
    }
    const units = { population: '人口 / 人', territory: '领土 / 格', tech: '科技 / 级', wealth: '财富 / 单位' };
    ctx.textAlign = 'left'; ctx.fillStyle = '#91a3a1'; ctx.fillText(units[chartMetric], 0, 10);
    const tickCount = width < 400 ? 3 : 4;
    for (let i = 0; i < tickCount; i++) {
      const year = Math.round(firstYear + (lastYear - firstYear) * i / (tickCount - 1));
      ctx.textAlign = i === 0 ? 'left' : i === tickCount - 1 ? 'right' : 'center';
      if (i === 0 || year !== Math.round(firstYear + (lastYear - firstYear) * (i - 1) / (tickCount - 1))) ctx.fillText(`${year}年`, x(year), height - 12);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(margin.left, margin.top, plotWidth, plotHeight); ctx.clip();
    for (const c of state.civs) {
      ctx.beginPath(); history.forEach((h, i) => { const px = x(h.year), py = y(h.civs[c.id][chartMetric]); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.strokeStyle = E.CIVS[c.id].color; ctx.lineWidth = c.id === selected ? 2.2 : 1.2; ctx.globalAlpha = c.id === selected ? 1 : .55; ctx.stroke();
      if (history.length === 1) { ctx.beginPath(); ctx.arc(x(0) + 2, y(history[0].civs[c.id][chartMetric]), 2.5, 0, Math.PI * 2); ctx.fillStyle = E.CIVS[c.id].color; ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.restore();
    const last = history[history.length - 1];
    const accessible = state.civs.map(c => `${c.name}${compact(last.civs[c.id][chartMetric])}`).join('，');
    chart.setAttribute('aria-label', `世界历${firstYear}至${state.year}年的${units[chartMetric]}历史折线图。当前：${accessible}。`);
    if (chartHover !== null) {
      const year = Math.round(Math.max(firstYear, Math.min(state.year, chartHover))), item = history.find(h => h.year === year);
      if (item) {
        const px = x(year); ctx.beginPath(); ctx.moveTo(px, margin.top); ctx.lineTo(px, height - margin.bottom); ctx.strokeStyle = '#9fb2a577'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        const label = `${year}年 · ${E.CIVS[selected].short} ${compact(item.civs[selected][chartMetric])}`;
        ctx.font = '11px "Microsoft YaHei",sans-serif'; const labelWidth = ctx.measureText(label).width;
        const labelX = Math.max(margin.left + 4, Math.min(width - labelWidth - 12, px - labelWidth / 2));
        ctx.fillStyle = '#1a2b2a'; ctx.fillRect(labelX - 5, margin.top + 3, labelWidth + 10, 23); ctx.fillStyle = '#e4e8da'; ctx.textAlign = 'left'; ctx.fillText(label, labelX, margin.top + 15);
        ctx.beginPath(); ctx.arc(px, y(item.civs[selected][chartMetric]), 3.3, 0, Math.PI * 2); ctx.fillStyle = E.CIVS[selected].color; ctx.fill();
      }
    }
  }
  function niceStep(value) { const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1)))); const normalized = value / magnitude; return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude; }

  for (const [id, policy] of Object.entries(E.POLICIES)) { const option = document.createElement('option'); option.value = id; option.textContent = policy.name; $('policy').append(option); }
  $('play').addEventListener('click', () => setRunning(!running));
  $('step').addEventListener('click', () => { setRunning(false); advance(1); });
  $('advance').addEventListener('click', () => { setRunning(false); advance(10); });
  function safeguard() { try { localStorage.setItem('civilization-lab-recovery', E.serialize(state)); } catch {} }
  $('generate').addEventListener('click', () => { setRunning(false); safeguard(); replaceWorld(E.createWorld({ seed: $('seed').value.trim() || '远方来信', scenario: $('scenario').value }), '新世界已经诞生。'); openCampaign(); });
  $('seed').addEventListener('keydown', event => { if (event.key === 'Enter') $('generate').click(); });
  document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => { layer = button.dataset.layer; document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); drawMap(); }));
  $('policy').addEventListener('change', () => apply({ type: 'policy', civId: selected, policy: $('policy').value }, '发展方向已改变。'));
  $('aid').addEventListener('click', () => apply({ type: 'aid', civId: selected }, '资源援助已送达。'));
  $('rain').addEventListener('click', () => apply({ type: 'rain' }, '雨水带来五年的丰收。'));
  $('peace').addEventListener('click', () => apply({ type: 'peace' }, '和平倡议已发布。'));
  for (const name of ['fertility', 'aggression', 'disasters']) {
    $(name).addEventListener('input', () => updateSlider(name));
    $(name).addEventListener('change', () => apply({ type: 'config', [name]: Number($(name).value) }));
  }
  $('chart-metric').addEventListener('change', () => { chartMetric = $('chart-metric').value; drawChart(); });
  $('event-filter').addEventListener('change', renderEvents);
  $('replay').addEventListener('click', () => {
    const year = Number($('replay-year').value);
    if (!Number.isSafeInteger(year) || year < (state.origin?.year || 0) || year > state.year) { toast(`请输入${state.origin?.year || 0}到${state.year}之间的整数年份。`, true); return; }
    rebuild('replay', { state: { seed: state.seed, scenario: state.scenario, commands: state.commands, origin: state.origin }, year }, `已回到世界历${year}年。`);
  });
  $('cancel-work').addEventListener('click', () => { finishWork(); toast('已取消，当前世界保持原样。'); });
  $('save').addEventListener('click', () => { try { localStorage.setItem(STORAGE, E.serialize(state)); toast(`已保存世界历${state.year}年的进度。`); } catch { toast('浏览器未允许本地保存，请使用“导出”。', true); } });
  $('load').addEventListener('click', () => {
    try { const saved = localStorage.getItem(STORAGE) || localStorage.getItem('civilization-lab-v1'); if (!saved) { toast('还没有本地存档。'); return; } rebuild('import', saved, '存档已读取。旧版世界会从保存年份升级。'); } catch { toast('无法访问本地存档，请使用“导入”。', true); }
  });
  $('recover').addEventListener('click', () => { try { const previous = localStorage.getItem('civilization-lab-recovery'); if (!previous) { toast('还没有可恢复的世界。生成、读取或回退时会保留上一份进度。'); return; } rebuild('import', previous, '已恢复之前的世界。'); } catch { toast('无法读取恢复记录。', true); } });
  $('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([E.serialize(state)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `civilization-${state.year}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('存档已导出。');
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    if (file.size > 2e6) { toast('存档不能超过2 MB。', true); return; }
    try { rebuild('import', await file.text(), '存档已导入。'); } catch (err) { toast(`无法读取存档：${err.message}`, true); }
  });
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const rect = $('help-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('help-dialog').close(); } });
  map.addEventListener('click', event => { if (!dragged) selectTile(tileAt(event)); dragged = false; });
  $('zoom-in').addEventListener('click', () => zoomMap(1.5)); $('zoom-out').addEventListener('click', () => zoomMap(1 / 1.5));
  $('zoom-reset').addEventListener('click', () => { camera = { zoom: 1, x: .5, y: .5 }; drawMap(); });
  map.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse' || event.button !== 0 || camera.zoom <= 1) return; drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }; dragged = false; map.setPointerCapture(event.pointerId); });
  map.addEventListener('pointermove', event => { if (!drag) return; const rect = map.getBoundingClientRect(), dx = event.clientX - drag.x, dy = event.clientY - drag.y; if (Math.hypot(dx, dy) > 4) dragged = true; if (dragged) { camera.x = drag.cx - dx / rect.width / camera.zoom; camera.y = drag.cy - dy / rect.height / camera.zoom; clampCamera(); drawMap(); } });
  map.addEventListener('pointerup', () => { drag = null; }); map.addEventListener('pointercancel', () => { drag = null; });
  map.addEventListener('mousemove', event => {
    if (dragged && drag) return;
    const tile = tileAt(event); hoverTile = tile;
    const tooltip = $('map-tooltip'); tooltip.textContent = tileText(tile); tooltip.hidden = false;
    const rect = map.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltip.offsetWidth - 8, event.clientX - rect.left + 14))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(rect.height - tooltip.offsetHeight - 8, event.clientY - rect.top - 35))}px`;
    drawMap();
  });
  map.addEventListener('mouseleave', () => { hoverTile = -1; $('map-tooltip').hidden = true; drawMap(); });
  map.addEventListener('focus', drawMap); map.addEventListener('blur', drawMap);
  map.addEventListener('keydown', event => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.width, ArrowDown: state.width };
    if (event.key in offsets) {
      event.preventDefault(); const x = keyboardTile % state.width;
      if ((event.key === 'ArrowLeft' && x === 0) || (event.key === 'ArrowRight' && x === state.width - 1)) return;
      keyboardTile = Math.max(0, Math.min(state.tiles.length - 1, keyboardTile + offsets[event.key])); $('tile-info').textContent = tileText(keyboardTile); if (camera.zoom > 1) { camera.x = (keyboardTile % state.width + .5) / state.width; camera.y = (Math.floor(keyboardTile / state.width) + .5) / state.height; clampCamera(); } drawMap();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTile(keyboardTile); }
  });
  chart.addEventListener('pointermove', event => {
    if (!chartLayout) return; const rect = chart.getBoundingClientRect(), { margin, plotWidth, firstYear, lastYear } = chartLayout;
    chartHover = firstYear + (event.clientX - rect.left - margin.left) / plotWidth * (lastYear - firstYear); drawChart();
  });
  chart.addEventListener('pointerleave', () => { chartHover = null; drawChart(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
  new ResizeObserver(() => { drawMap(); drawChart(); }).observe(document.querySelector('.main-grid'));
  window.addEventListener('resize', drawChart);
  $('return-player').addEventListener('click', () => selectCiv(state.playerId));
  document.querySelectorAll('[data-panel]').forEach(tab => {
    tab.addEventListener('click', () => setPanel(tab.dataset.panel));
    tab.addEventListener('keydown', event => { const tabs = [...document.querySelectorAll('[data-panel]')], i = tabs.indexOf(tab); if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); setPanel(tabs[next].dataset.panel); } });
  });
  $('command-body').addEventListener('change', event => { if (event.target.id === 'city-picker') { selectedCity = Number(event.target.value); selectedTile = null; lastCommand = ''; renderCommands(); const city = state.cities.find(c => c.id === selectedCity); keyboardTile = city.tile; drawMap(); } });
  $('command-body').addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset, civId = state.playerId;
    if (d.build) apply({ type: 'build', civId, cityId: selectedCity, building: d.build }, '工程已进入建设队列。');
    else if (d.cancel !== undefined) apply({ type: 'cancelBuild', civId, cityId: selectedCity, index: Number(d.cancel) }, '工程已取消，部分资源已返还。');
    else if (d.research) apply({ type: 'research', civId, research: d.research }, '新知识已转化为文明的力量。');
    else if (d.explore !== undefined) apply({ type: 'explore', civId, siteId: Number(d.explore) }, '远征队出发了。');
    else if (d.locate !== undefined) { const site = state.sites.find(s => s.id === Number(d.locate)); selectedSite = site.id; camera = { zoom: 2, x: (site.tile % state.width + .5) / state.width, y: (Math.floor(site.tile / state.width) + .5) / state.height }; clampCamera(); drawMap(); map.scrollIntoView({ block: 'center', behavior: 'auto' }); }
    else if (d.diplomacy) apply({ type: 'diplomacy', civId, targetId: Number(d.target), action: d.diplomacy }, '外交指令已执行。');
    else if (d.action === 'settle') { apply({ type: 'settle', civId, tile: selectedTile }, '开拓者建立了新城市。'); const city = state.cities.find(c => c.tile === selectedTile && c.civId === civId); if (city) { selectedCity = city.id; selectedTile = null; lastCommand = ''; renderCommands(); } }
  });
  $('decision-banner').addEventListener('click', event => { const b = event.target.closest('[data-choice]'); if (b && !b.disabled && player().decision) apply({ type: 'choice', civId: state.playerId, decisionId: player().decision.id, choice: b.dataset.choice }, '你的决定已载入编年史。'); });
  E.CIVS.forEach((c, id) => { const option = document.createElement('option'); option.value = id; option.textContent = c.name + ' · ' + E.POLICIES[c.policy].name; $('player-choice').append(option); });
  for (const [id, def] of Object.entries(E.GOALS)) { const option = document.createElement('option'); option.value = id; option.textContent = def.name; $('goal-choice').append(option); }
  function goalDescription() { const goal = E.GOALS[$('goal-choice').value]; $('goal-description').textContent = goal.targets.map(t => t[1]).join('；') + '。'; }
  function openCampaign() { setRunning(false); $('player-choice').value = state.playerId; $('goal-choice').value = state.goal; goalDescription(); $('campaign-dialog').showModal(); }
  $('goal-choice').addEventListener('change', goalDescription);
  $('campaign-settings').addEventListener('click', openCampaign); $('close-campaign').addEventListener('click', () => $('campaign-dialog').close());
  $('begin-reign').addEventListener('click', () => { apply({ type: 'reign', civId: Number($('player-choice').value), goal: $('goal-choice').value }); selectedCity = state.cities.find(c => c.civId === state.playerId)?.id; selectCiv(state.playerId); lastCommand = ''; renderCommands(); $('campaign-dialog').close(); });
  function frame(time) {
    if (running && !work) {
      if (lastFrame) {
        carry += Math.min(300, time - lastFrame) * Number($('speed').value) / 1000;
        const count = Math.min(8, Math.floor(carry));
        if (count > 0) { carry -= count; advance(count); }
      }
      lastFrame = time;
    }
    requestAnimationFrame(frame);
  }
  syncSettings(); render(); setRunning(false); requestAnimationFrame(frame);
})();
