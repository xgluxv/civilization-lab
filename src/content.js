(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CivContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BRANCHES = {
    land: { name: '民生', mark: '穗', color: '#94c699' },
    industry: { name: '工程', mark: '铸', color: '#dfad7b' },
    knowledge: { name: '学术', mark: '书', color: '#b6a1e0' },
    diplomacy: { name: '商贸', mark: '帆', color: '#7bbce0' }
  };
  const RESEARCH = {
    agronomy: { name: '轮作农法', branch: 'land', cost: 32, requires: [], era: 0, description: '粮食产量 +15%；解锁农庄。', effects: { food: .15 } },
    medicine: { name: '草药医学', branch: 'land', cost: 95, requires: ['agronomy'], era: 1, description: '疫病损失 −35%；解锁医馆。', effects: { health: .35 } },
    governance: { name: '公共治理', branch: 'land', cost: 250, requires: ['medicine'], era: 3, description: '土地人口容量 +20%，幸福度 +6。', effects: { capacity: .2, happiness: 6 } },
    tools: { name: '精良工具', branch: 'industry', cost: 30, requires: [], era: 0, description: '木材与矿石产量 +15%；解锁工坊。', effects: { wood: .15, ore: .15 } },
    masonry: { name: '石工技艺', branch: 'industry', cost: 100, requires: ['tools'], era: 1, description: '建设速度 +20%；解锁城墙。', effects: { construction: .2 } },
    engineering: { name: '机械工程', branch: 'industry', cost: 270, requires: ['masonry'], era: 3, description: '建设速度 +30%，木材与矿石产量 +20%。', effects: { construction: .3, wood: .2, ore: .2 } },
    writing: { name: '文字典籍', branch: 'knowledge', cost: 35, requires: [], era: 0, description: '研究产出 +15%；解锁图书馆。', effects: { research: .15 } },
    astronomy: { name: '天文观测', branch: 'knowledge', cost: 110, requires: ['writing'], era: 1, description: '研究产出 +20%；探索范围 +5格；解锁观星台奇观。', effects: { research: .2, exploration: 5 } },
    printing: { name: '知识传播', branch: 'knowledge', cost: 290, requires: ['astronomy'], era: 3, description: '研究产出 +30%；解锁学院。', effects: { research: .3 } },
    coinage: { name: '统一货币', branch: 'diplomacy', cost: 30, requires: [], era: 0, description: '贸易收益 +20%；解锁集市。', effects: { trade: .2 } },
    sailing: { name: '远洋航行', branch: 'diplomacy', cost: 90, requires: ['coinage'], era: 1, description: '探索范围 +7格，远征时间 −25%。', effects: { exploration: 7, travel: .25 } },
    charter: { name: '商贸宪章', branch: 'diplomacy', cost: 260, requires: ['sailing'], era: 3, description: '贸易收益 +35%，改善关系更有效。', effects: { trade: .35, diplomacy: 10 } }
  };
  const BUILDINGS = {
    granary: { name: '粮仓', mark: '仓', category: '民生', cost: { wood: 24, wealth: 18 }, work: 7, max: 3, requires: null, description: '每级粮食产出 +6%，储粮上限 +20%。', effects: { food: .06, storage: .2 } },
    farm: { name: '农庄', mark: '田', category: '民生', cost: { wood: 32, wealth: 25 }, work: 9, max: 3, requires: 'agronomy', description: '每级粮食产出 +10%，土地容量 +6%。', effects: { food: .1, capacity: .06 } },
    lumbermill: { name: '伐木场', mark: '林', category: '工程', cost: { wood: 18, wealth: 22 }, work: 6, max: 3, requires: null, description: '每级木材产出 +15%，矿石产出 +5%。', effects: { wood: .15, ore: .05 } },
    workshop: { name: '工坊', mark: '工', category: '工程', cost: { wood: 45, ore: 15, wealth: 35 }, work: 10, max: 3, requires: 'tools', description: '每级建设速度 +15%，矿石产出 +15%。', effects: { construction: .15, ore: .15 } },
    library: { name: '图书馆', mark: '书', category: '学术', cost: { wood: 35, wealth: 40 }, work: 9, max: 3, requires: 'writing', description: '每级研究产出 +18%。', effects: { research: .18 } },
    market: { name: '集市', mark: '市', category: '商贸', cost: { wood: 30, wealth: 35 }, work: 8, max: 3, requires: 'coinage', description: '每级贸易收益 +15%，税收 +8%。', effects: { trade: .15, revenue: .08 } },
    walls: { name: '城墙', mark: '卫', category: '工程', cost: { wood: 30, ore: 40, wealth: 50 }, work: 14, max: 3, requires: 'masonry', description: '此城每级攻城防御 +35%。', effects: {} },
    hospital: { name: '医馆', mark: '医', category: '民生', cost: { wood: 50, wealth: 75 }, work: 12, max: 2, requires: 'medicine', description: '每级幸福度 +3，疫病损失 −15%。', effects: { happiness: 3, health: .15 } },
    academy: { name: '学院', mark: '学', category: '学术', cost: { wood: 90, ore: 40, wealth: 140 }, work: 20, max: 2, requires: 'printing', description: '每级研究产出 +35%，土地容量 +8%。', effects: { research: .35, capacity: .08 } },
    observatory: { name: '穹顶观星台', mark: '✧', category: '世界奇观', cost: { wood: 180, ore: 110, wealth: 350 }, work: 45, max: 1, requires: 'astronomy', unique: true, description: '全球仅一座。研究产出 +35%，完成任意胜利目标的奇观条件。', effects: { research: .35 } }
  };
  const SITES = {
    archive: { name: '失落书库', mark: '▤', description: '残存的典籍可能改变知识的方向。', reward: { insight: 65, science: 100 }, risk: .08 },
    grove: { name: '古老圣林', mark: '♧', description: '古树下埋藏着种子与药草。', reward: { food: 100, wood: 65, happiness: 5 }, risk: .08 },
    vault: { name: '沉眠宝库', mark: '◇', description: '旧时代的矿藏，仍守着最后的财富。', reward: { wealth: 170, ore: 70 }, risk: .18 },
    tower: { name: '远古高塔', mark: '△', description: '石壁上的航图指向更远的世界。', reward: { insight: 50, wealth: 100, science: 60 }, risk: .12 }
  };
  const DECISIONS = {
    harvest: { title: '第一场丰收之后', text: '议事厅里，农人希望储备粮食，工匠希望扩建街区。有限的余粮，该为谁铺路？', options: [
      { id: 'store', name: '储粮过冬', detail: '获得60粮食与3幸福度。', effect: { food: 60, happiness: 3 } },
      { id: 'build', name: '修建公共工程', detail: '消耗25粮食，获得30木材；12年内建设速度 +35%。', cost: { food: 25 }, effect: { wood: 30 }, buff: { key: 'construction', value: .35, duration: 12 } },
      { id: 'study', name: '资助田野学者', detail: '消耗20财富，获得35研究点。', cost: { wealth: 20 }, effect: { insight: 35 } }
    ] },
    travelers: { title: '远方的旅人', text: '一支商队带着陌生的口音来到城门。有人想留下，有人愿意交换见闻。', options: [
      { id: 'welcome', name: '接纳定居', detail: '消耗35粮食，增加18人口。', cost: { food: 35 }, effect: { population: 18 } },
      { id: 'trade', name: '交换货物', detail: '获得60财富；邻国关系 +5。', effect: { wealth: 60, relations: 5 } },
      { id: 'learn', name: '记录旅途见闻', detail: '获得25研究点与30时代研究。', effect: { insight: 25, science: 30 } }
    ] },
    labor: { title: '工坊的灯火', text: '工匠提出赶工计划。更长的工作时间能加快建设，也会带来怨言。', options: [
      { id: 'rush', name: '批准赶工', detail: '幸福度 −8；10年内建设速度 +70%。', effect: { happiness: -8 }, buff: { key: 'construction', value: .7, duration: 10 } },
      { id: 'rest', name: '安排休息', detail: '消耗30财富，幸福度 +10。', cost: { wealth: 30 }, effect: { happiness: 10 } },
      { id: 'tools', name: '采购新工具', detail: '消耗40财富，获得35木材与20矿石。', cost: { wealth: 40 }, effect: { wood: 35, ore: 20 } }
    ] },
    festival: { title: '星空下的庆典', text: '新一年的节庆将至。人们可以为共同的生活举杯，也可以把资源留给下一次出发。', options: [
      { id: 'celebrate', name: '举办庆典', detail: '消耗50粮食与30财富；15年内幸福度 +10。', cost: { food: 50, wealth: 30 }, effect: {}, buff: { key: 'happiness', value: 10, duration: 15 } },
      { id: 'scholars', name: '举办学术集会', detail: '消耗60财富，获得80研究点。', cost: { wealth: 60 }, effect: { insight: 80 } },
      { id: 'reserve', name: '保留储备', detail: '获得25粮食与25财富。', effect: { food: 25, wealth: 25 } }
    ] }
  };
  const GOALS = {
    prosperity: { name: '繁荣之路', description: '让城镇成为安居之地。', targets: [ ['population', '人口达到1,200人', 1200], ['cities', '拥有4座城市', 4], ['buildings', '建成12级建筑', 12], ['happiness', '幸福度达到85%', 85] ] },
    knowledge: { name: '知识之光', description: '用发现点亮一个时代。', targets: [ ['research', '完成9项专项研究', 9], ['tech', '时代科技达到6级', 6], ['relics', '成功探索3处遗迹', 3], ['wonder', '拥有穹顶观星台', 1] ] },
    alliance: { name: '四海同盟', description: '把陌生的城邦连成盟友。', targets: [ ['treaties', '维持4份通商条约', 4], ['wealth', '拥有3,000财富', 3000], ['buildings', '建成10级建筑', 10], ['peaceYears', '连续和平40年', 40] ] }
  };
  const RESOURCE_NAMES = { food: '粮食', wood: '木材', ore: '矿石', wealth: '财富', insight: '研究点', science: '时代研究', population: '人口', happiness: '幸福度', relations: '邻国关系' };
  return { BRANCHES, RESEARCH, BUILDINGS, SITES, DECISIONS, GOALS, RESOURCE_NAMES };
});
