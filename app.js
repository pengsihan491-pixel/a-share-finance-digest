const dataUrl = "./data/daily.json";

const marketApi = {
  indices: "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f4,f6,f104,f105,f106&secids=1.000001,0.399001,0.399006",
  industry: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f4,f6,f104,f105,f128,f140,f136",
  concept: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f4,f6,f104,f105,f128,f140,f136",
  stocks: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f4,f5,f6,f8,f9,f10,f15,f16,f17,f18",
  lastTradeDay: "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&fields2=f51&klt=101&fqt=1&end=20500101&lmt=1"
};

const state = {
  data: null,
  trend: "all",
  feedType: "all",
  stockKeyword: ""
};

const els = {
  sourceStatus: document.querySelector("#sourceStatus"),
  lastUpdated: document.querySelector("#lastUpdated"),
  tradeDate: document.querySelector("#tradeDate"),
  marketTicker: document.querySelector("#marketTicker"),
  shIndex: document.querySelector("#shIndex"),
  shChange: document.querySelector("#shChange"),
  szIndex: document.querySelector("#szIndex"),
  szChange: document.querySelector("#szChange"),
  cyIndex: document.querySelector("#cyIndex"),
  cyChange: document.querySelector("#cyChange"),
  temperatureFill: document.querySelector("#temperatureFill"),
  temperatureValue: document.querySelector("#temperatureValue"),
  mainTheme: document.querySelector("#mainTheme"),
  themeSummary: document.querySelector("#themeSummary"),
  pulseScore: document.querySelector("#pulseScore"),
  signalLevel: document.querySelector("#signalLevel"),
  breadthLevel: document.querySelector("#breadthLevel"),
  catalystLevel: document.querySelector("#catalystLevel"),
  riskBias: document.querySelector("#riskBias"),
  sectorCount: document.querySelector("#sectorCount"),
  sectorHeatmap: document.querySelector("#sectorHeatmap"),
  sectorList: document.querySelector("#sectorList"),
  feedList: document.querySelector("#feedList"),
  stockGrid: document.querySelector("#stockGrid"),
  signalList: document.querySelector("#signalList"),
  riskList: document.querySelector("#riskList"),
  importantList: document.querySelector("#importantList"),
  calendarList: document.querySelector("#calendarList"),
  socialList: document.querySelector("#socialList"),
  socialStatus: document.querySelector("#socialStatus"),
  marketPulse: document.querySelector("#marketPulse"),
  feedSelect: document.querySelector("#feedSelect"),
  stockSearch: document.querySelector("#stockSearch"),
  refreshBtn: document.querySelector("#refreshBtn")
};

async function loadData() {
  try {
    state.data = await loadDynamicMarketData();
  } catch (error) {
    try {
      const response = await fetch(`${dataUrl}?t=${Date.now()}`);
      if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
      state.data = await response.json();
      state.data.status = `${state.data.status}（静态缓存）`;
    } catch {
      if (!window.__DAILY_DIGEST__) throw error;
      state.data = structuredClone(window.__DAILY_DIGEST__);
      state.data.status = `${state.data.status}（本地缓存）`;
    }
  }
  render();
}

async function loadDynamicMarketData() {
  try {
    return await loadFunctionMarketData();
  } catch {
    return await loadLiveMarketData();
  }
}

async function loadFunctionMarketData() {
  const response = await fetch(`/.netlify/functions/market?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`动态函数错误：${response.status}`);
  const data = await response.json();
  if (!data?.market || !data?.sectors?.length) throw new Error("动态函数返回异常");
  return data;
}

async function loadLiveMarketData() {
  const [indicesRaw, industryRaw, conceptRaw, stocksRaw, socialBuzz, lastTradeDate] = await Promise.all([
    fetchMarketJson(marketApi.indices),
    fetchMarketJson(marketApi.industry),
    fetchMarketJson(marketApi.concept),
    fetchMarketJson(marketApi.stocks),
    loadSocialBuzzClient(),
    fetchLastTradeDateClient()
  ]);

  return buildLiveDigest({
    indices: indicesRaw.data.diff,
    industry: industryRaw.data.diff,
    concept: conceptRaw.data.diff,
    stocks: stocksRaw.data.diff,
    socialBuzz,
    tradeDate: lastTradeDate
  });
}

async function fetchMarketJson(url, validate = hasQuoteDiff) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`行情接口错误：${response.status}`);
  const data = await response.json();
  if (!validate(data)) throw new Error("行情接口返回异常");
  return data;
}

async function fetchLastTradeDateClient() {
  try {
    const data = await fetchMarketJson(marketApi.lastTradeDay, hasKline);
    return parseKlineTradeDate(data) || latestWeekdayText();
  } catch {
    return latestWeekdayText();
  }
}

function hasQuoteDiff(data) {
  return data.rc === 0 && Array.isArray(data.data?.diff);
}

function hasKline(data) {
  return data.rc === 0 && Array.isArray(data.data?.klines) && data.data.klines.length > 0;
}

function parseKlineTradeDate(data) {
  const line = data.data.klines.at(-1);
  const date = String(line).split(",")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

async function loadSocialBuzzClient() {
  try {
    const response = await fetch(`./data/social-buzz.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("社媒数据未发布");
    const data = await response.json();
    return {
      status: data.status || "已接入社媒数据",
      lastUpdated: data.lastUpdated || nowText(),
      source: data.source || "data/social-buzz.json",
      items: Array.isArray(data.items) ? data.items.slice(0, 5) : []
    };
  } catch {
    return window.__DAILY_DIGEST__?.socialBuzz || {
      status: "未接入抖音/小红书数据源",
      lastUpdated: "",
      source: "等待接入导入文件",
      items: []
    };
  }
}

function buildLiveDigest({ indices, industry, concept, stocks, socialBuzz, tradeDate }) {
  const sh = quoteByCode(indices, "000001");
  const sz = quoteByCode(indices, "399001");
  const cy = quoteByCode(indices, "399006");
  const upCount = quoteSum(indices, "f104");
  const downCount = quoteSum(indices, "f105");
  const temperature = Math.round((upCount / Math.max(1, upCount + downCount)) * 100);
  const topIndustryNames = industry.slice(0, 3).map((item) => item.f14).join("、");
  const topConceptNames = concept.slice(0, 3).map((item) => item.f14).join("、");

  return {
    tradeDate: tradeDate || latestWeekdayText(),
    status: "实时公开行情接口",
    lastUpdated: nowText(),
    market: {
      shanghai: indexFromQuote(sh),
      shenzhen: indexFromQuote(sz),
      chinext: indexFromQuote(cy),
      temperature
    },
    theme: {
      title: `${topIndustryNames}领涨，${topConceptNames}活跃`,
      summary: `页面打开时实时读取公开行情接口：行业侧 ${topIndustryNames} 涨幅居前，概念侧 ${topConceptNames} 较活跃。该摘要只反映行情强弱，不等同于新闻因果或投资建议；涨跌逻辑仍需结合公告、成交额、龙虎榜、研报和社媒热度复核。`
    },
    pulse: makePulse(temperature),
    sectors: industry.map(sectorFromQuote),
    stocks: stocks.map(stockFromQuote),
    feed: buildLiveFeed({ indices, industry, concept, stocks }),
    signals: [
      {
        title: "板块持续性验证",
        detail: `跟踪 ${topIndustryNames} 的成交额、涨停家数、龙头封单和次日承接。`
      },
      {
        title: "领涨股公告核验",
        detail: "逐一核验涨幅榜个股公告、异动说明、龙虎榜和基本面变化。"
      },
      {
        title: "社媒热议交叉验证",
        detail: "接入抖音/小红书后，对比社媒讨论热度与行情强度是否同向。"
      }
    ],
    risks: [
      "行情接口只能说明涨跌和强弱，不能单独解释上涨原因。",
      "涨幅榜个股可能存在异动、停复牌、公告或短线资金博弈，需要二次核验。",
      "抖音/小红书讨论热度需要导入或授权数据源，未接入前不应生成假榜单。"
    ],
    socialBuzz
  };
}

function sectorFromQuote(item) {
  const breadthBase = Number(item.f104 || 0) + Number(item.f105 || 0);
  const breadth = breadthBase ? Math.round((Number(item.f104 || 0) / breadthBase) * 100) : 0;
  return {
    name: item.f14,
    score: clamp(Math.round(60 + Number(item.f3 || 0) * 3), 0, 96),
    change: pct(item.f3),
    logic: `行情接口显示该板块涨幅 ${pct(item.f3)}，上涨家数 ${item.f104 ?? "--"}，下跌家数 ${item.f105 ?? "--"}，领涨股为 ${item.f128 || "待确认"}${item.f140 ? `（${item.f140}）` : ""}。`,
    tags: ["行业板块", "涨幅居前", item.f128 ? `领涨：${item.f128}` : "领涨待确认"],
    leaders: [item.f128, item.f140].filter(Boolean),
    breadth
  };
}

function stockFromQuote(item) {
  return {
    name: item.f14,
    code: item.f12,
    change: pct(item.f3),
    sector: "涨幅榜",
    summary: `现价 ${num(item.f2)} 元，成交额 ${money(item.f6)}，换手率 ${num(item.f8)}%。该卡片来自实时行情排行，题材归因需接入公告/快讯/社媒数据进一步确认。`,
    logic: [
      `涨幅 ${pct(item.f3)}，位于当前涨幅榜前列`,
      `成交额 ${money(item.f6)}，换手率 ${num(item.f8)}%`,
      "建议核验公告、龙虎榜、所属概念和社媒讨论热度"
    ]
  };
}

function buildLiveFeed({ indices, industry, concept, stocks }) {
  const indexLine = indices.map((item) => `${item.f14} ${num(item.f2)}（${pct(item.f3)}）`).join("，");
  return [
    {
      time: shortTime(),
      type: "market",
      source: "实时行情接口",
      title: "主要指数更新",
      summary: indexLine,
      impact: "市场温度自动计算"
    },
    ...industry.slice(0, 4).map((item) => ({
      time: shortTime(),
      type: "industry",
      source: "行业板块",
      title: `${item.f14}涨幅居前`,
      summary: `板块涨幅 ${pct(item.f3)}，领涨股 ${item.f128 || "待确认"}${item.f140 ? `（${item.f140}）` : ""}，上涨家数 ${item.f104 ?? "--"}。`,
      impact: `利好${item.f14}`
    })),
    ...concept.slice(0, 4).map((item) => ({
      time: shortTime(),
      type: "market",
      source: "概念板块",
      title: `${item.f14}活跃`,
      summary: `概念涨幅 ${pct(item.f3)}，领涨股 ${item.f128 || "待确认"}${item.f140 ? `（${item.f140}）` : ""}。`,
      impact: `关注${item.f14}`
    })),
    ...stocks.slice(0, 3).map((item) => ({
      time: shortTime(),
      type: "company",
      source: "涨幅榜",
      title: `${item.f14}涨幅 ${pct(item.f3)}`,
      summary: `代码 ${item.f12}，现价 ${num(item.f2)} 元，成交额 ${money(item.f6)}。`,
      impact: "需核验异动原因"
    }))
  ];
}

function render() {
  const data = state.data;
  if (!data) return;

  els.sourceStatus.textContent = data.status;
  els.lastUpdated.textContent = data.lastUpdated;
  els.tradeDate.textContent = `交易日 ${data.tradeDate}`;
  els.mainTheme.textContent = data.theme.title;
  els.themeSummary.textContent = data.theme.summary;

  setIndex(els.shIndex, els.shChange, data.market.shanghai);
  setIndex(els.szIndex, els.szChange, data.market.shenzhen);
  setIndex(els.cyIndex, els.cyChange, data.market.chinext);
  els.temperatureValue.textContent = `${data.market.temperature}/100`;
  els.temperatureFill.style.width = `${clamp(data.market.temperature, 0, 100)}%`;

  renderTicker(data);
  renderIntelligence(data);
  renderImportant(data);
  renderCalendar(data);
  renderSocial(data.socialBuzz);
  renderSectors(data.sectors);
  renderFeed(data.feed);
  renderStocks(data.stocks);
  renderSignals(data.signals, data.risks);
  drawPulse(data.pulse);
}

function renderSocial(socialBuzz) {
  if (!els.socialList || !els.socialStatus) return;
  const data = socialBuzz || { status: "未接入社媒数据源", items: [] };
  els.socialStatus.textContent = data.status || "未接入社媒数据源";
  if (!data.items?.length) {
    els.socialList.innerHTML = `
      <div class="social-empty">
        <strong>等待接入抖音/小红书热度源</strong>
        <p>需要官方开放平台、第三方舆情 API，或每天导出的 CSV/JSON。未接入前不会生成假 Top5。</p>
      </div>
    `;
    return;
  }

  els.socialList.innerHTML = data.items.slice(0, 5).map((item, index) => `
    <article class="social-item">
      <span>${String(item.rank || index + 1).padStart(2, "0")}</span>
      <div>
        <strong>${escapeHtml(item.name)}${item.code ? ` <em>${escapeHtml(item.code)}</em>` : ""}</strong>
        <p>${escapeHtml(item.reason || "社媒讨论热度居前，需结合行情验证。")}</p>
        <div class="social-bars">
          <b>抖音 ${formatSocialCount(item.douyinMentions)}</b>
          <b>小红书 ${formatSocialCount(item.xhsMentions)}</b>
        </div>
      </div>
    </article>
  `).join("");
}

function setIndex(valueEl, changeEl, item) {
  valueEl.textContent = item.value;
  changeEl.textContent = item.change;
  changeEl.className = getChangeClass(item.change);
}

function renderTicker(data) {
  const indexItems = [
    data.market.shanghai,
    data.market.shenzhen,
    data.market.chinext
  ].map((item) => `
    <span class="ticker-item">
      <em>${escapeHtml(item.name)}</em>
      <strong>${escapeHtml(item.value)}</strong>
      <b class="${getChangeClass(item.change)}">${escapeHtml(item.change)}</b>
    </span>
  `);

  const sectorItems = data.sectors.map((sector) => `
    <span class="ticker-item sector-ticker">
      <em>${escapeHtml(sector.name)}</em>
      <strong>${sector.score}</strong>
      <b class="${getChangeClass(sector.change)}">${escapeHtml(sector.change)}</b>
    </span>
  `);

  els.marketTicker.innerHTML = [...indexItems, ...sectorItems, ...indexItems].join("");
}

function renderIntelligence(data) {
  const avgBreadth = Math.round(data.sectors.reduce((sum, item) => sum + item.breadth, 0) / data.sectors.length);
  const strongCount = data.sectors.filter((item) => item.score >= 80).length;
  const pulse = data.pulse.at(-1);
  els.pulseScore.textContent = `${pulse}/100`;
  els.signalLevel.textContent = pulse >= 75 ? "强势" : pulse >= 60 ? "活跃" : "谨慎";
  els.breadthLevel.textContent = `${avgBreadth}%`;
  els.catalystLevel.textContent = `${strongCount}/${data.sectors.length}`;
  els.riskBias.textContent = strongCount >= 3 ? "偏进攻" : "均衡";
}

function renderImportant(data) {
  const items = [
    ...data.feed.slice(0, 3).map((item) => ({ title: item.title, meta: item.impact })),
    ...data.sectors.slice(0, 2).map((item) => ({ title: `${item.name}强度 ${item.score}`, meta: item.change }))
  ];
  els.importantList.innerHTML = items.map((item, index) => `
    <article class="important-item">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <em>${escapeHtml(item.meta)}</em>
      </div>
    </article>
  `).join("");
}

function renderCalendar(data) {
  const calendar = [
    { date: "今日", tag: "盘后", title: `${data.tradeDate} 收盘复盘与板块强度确认` },
    { date: "明日", tag: "数据", title: "关注成交额、北向资金与高位题材换手" },
    { date: "本周", tag: "事件", title: "产业会议、政策窗口与龙头公告催化" },
    { date: "持续", tag: "验证", title: "订单、业绩预告、龙虎榜与机构调研" }
  ];
  els.calendarList.innerHTML = calendar.map((item) => `
    <article class="calendar-item">
      <time>${item.date}</time>
      <div>
        <span>${item.tag}</span>
        <strong>${escapeHtml(item.title)}</strong>
      </div>
    </article>
  `).join("");
}

function renderSectors(sectors) {
  const filtered = sectors.filter((sector) => {
    if (state.trend === "all") return true;
    if (state.trend === "bullish") return sector.score >= 80;
    return sector.score < 80;
  });
  els.sectorCount.textContent = `${filtered.length} 条`;
  renderHeatmap(filtered);
  els.sectorList.innerHTML = filtered.map(sectorTemplate).join("");
  if (!filtered.length) els.sectorList.innerHTML = emptyTemplate("暂无匹配板块");
}

function renderHeatmap(sectors) {
  els.sectorHeatmap.innerHTML = sectors.map((sector, index) => `
    <button class="heat-cell level-${index + 1}" type="button" data-sector="${escapeHtml(sector.name)}">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <strong>${escapeHtml(sector.name)}</strong>
      <em>${sector.score} / ${escapeHtml(sector.change)}</em>
    </button>
  `).join("");

  els.sectorHeatmap.querySelectorAll(".heat-cell").forEach((button) => {
    button.addEventListener("click", () => {
      state.stockKeyword = button.dataset.sector;
      els.stockSearch.value = button.dataset.sector;
      renderStocks(state.data.stocks);
      document.querySelector("#stocks").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function sectorTemplate(sector, index) {
  const tags = [...sector.tags, ...sector.leaders].map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `
    <article class="sector-row">
      <div class="sector-rank">
        <strong>${String(index + 1).padStart(2, "0")}</strong>
        <em class="${getChangeClass(sector.change)}">${escapeHtml(sector.change)}</em>
      </div>
      <div class="sector-copy">
        <div class="row-title">
          <h3>${escapeHtml(sector.name)}</h3>
          <b>${sector.score}</b>
        </div>
        <p>${escapeHtml(sector.logic)}</p>
        <div class="tag-row">${tags}</div>
      </div>
      <div class="breadth-meter">
        <span>扩散</span>
        <strong>${sector.breadth}%</strong>
        <div><i style="width:${sector.breadth}%"></i></div>
      </div>
    </article>
  `;
}

function renderFeed(feed) {
  const filtered = feed.filter((item) => state.feedType === "all" || item.type === state.feedType);
  els.feedList.innerHTML = filtered.map(feedTemplate).join("");
  if (!filtered.length) els.feedList.innerHTML = emptyTemplate("暂无匹配资讯");
}

function feedTemplate(item) {
  const typeLabel = {
    policy: "政策",
    company: "公司",
    industry: "产业",
    market: "市场"
  }[item.type] || "资讯";
  return `
    <article class="feed-item ${item.type}">
      <time>${escapeHtml(item.time)}</time>
      <div class="feed-dot"></div>
      <div class="feed-content">
        <div class="feed-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${typeLabel}</span>
        </div>
        <p>${escapeHtml(item.summary)}</p>
        <div class="feed-meta">
          <em>${escapeHtml(item.source)}</em>
          <b>${escapeHtml(item.impact)}</b>
        </div>
      </div>
    </article>
  `;
}

function renderStocks(stocks) {
  const keyword = state.stockKeyword.trim().toLowerCase();
  const filtered = stocks.filter((stock) => {
    const haystack = `${stock.name} ${stock.code} ${stock.sector} ${stock.summary}`.toLowerCase();
    return !keyword || haystack.includes(keyword);
  });
  els.stockGrid.innerHTML = filtered.map(stockTemplate).join("");
  if (!filtered.length) els.stockGrid.innerHTML = emptyTemplate("暂无匹配个股");
}

function stockTemplate(stock) {
  const logic = stock.logic.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const score = Math.round(clamp(62 + Math.abs(parseFloat(stock.change) || 0) * 5, 0, 98));
  return `
    <article class="stock-card">
      <div class="stock-head">
        <div>
          <strong>${escapeHtml(stock.name)}</strong>
          <span>${escapeHtml(stock.code)} · ${escapeHtml(stock.sector)}</span>
        </div>
        <b class="${getChangeClass(stock.change)}">${escapeHtml(stock.change)}</b>
      </div>
      <p>${escapeHtml(stock.summary)}</p>
      <div class="stock-score">
        <span>逻辑热度</span>
        <strong>${score}</strong>
        <div><i style="width:${score}%"></i></div>
      </div>
      <ul>${logic}</ul>
    </article>
  `;
}

function renderSignals(signals, risks) {
  els.signalList.innerHTML = signals.map((signal) => `
    <article class="check-item">
      <span></span>
      <div>
        <strong>${escapeHtml(signal.title)}</strong>
        <p>${escapeHtml(signal.detail)}</p>
      </div>
    </article>
  `).join("");
  els.riskList.innerHTML = risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
}

function drawPulse(points) {
  const canvas = els.marketPulse;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const width = rect.width;
  const height = rect.height;
  const pad = 26;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((point, index) => [
    pad + index * stepX,
    height - pad - (point / 100) * (height - pad * 2)
  ]);

  ctx.strokeStyle = "rgba(20, 123, 118, 0.10)";
  ctx.lineWidth = 1;
  for (let x = pad; x <= width - pad; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, height - pad);
    ctx.stroke();
  }
  for (let y = pad; y <= height - pad; y += 36) {
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const area = ctx.createLinearGradient(0, pad, 0, height - pad);
  area.addColorStop(0, "rgba(212, 63, 58, 0.18)");
  area.addColorStop(0.55, "rgba(209, 165, 76, 0.10)");
  area.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  ctx.beginPath();
  coords.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineTo(width - pad, height - pad);
  ctx.lineTo(pad, height - pad);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();

  ctx.beginPath();
  coords.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d43f3a";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  coords.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#a8792b";
    ctx.stroke();
  });

  ctx.fillStyle = "#6f7b86";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText("弱", pad, height - 8);
  ctx.fillText("强", width - pad - 12, 18);
}

function getChangeClass(change) {
  if (String(change).startsWith("+")) return "up";
  if (String(change).startsWith("-")) return "down";
  return "flat";
}

function emptyTemplate(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function indexFromQuote(item) {
  return {
    name: item.f14,
    value: Number(item.f2).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    change: pct(item.f3)
  };
}

function quoteByCode(items, code) {
  return items.find((item) => item.f12 === code) || items[0];
}

function quoteSum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function pct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function num(value) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function money(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(2)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(2)}万`;
  return num(number);
}

function makePulse(temperature) {
  const base = clamp(temperature, 30, 88);
  return Array.from({ length: 14 }, (_, index) => {
    const wave = Math.sin(index / 1.8) * 5;
    const trend = (index - 8) * 1.2;
    return clamp(Math.round(base + wave + trend), 8, 95);
  });
}

function todayText() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("/", "-");
}

function latestWeekdayText() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const day = date.getUTCDay();
  if (day === 0) date.setUTCDate(date.getUTCDate() - 2);
  if (day === 6) date.setUTCDate(date.getUTCDate() - 1);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function nowText() {
  return `${todayText()} ${shortTime()}`;
}

function shortTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatSocialCount(value) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.trend = button.dataset.filter;
    renderSectors(state.data.sectors);
  });
});

els.feedSelect.addEventListener("change", (event) => {
  state.feedType = event.target.value;
  renderFeed(state.data.feed);
});

els.stockSearch.addEventListener("input", (event) => {
  state.stockKeyword = event.target.value;
  renderStocks(state.data.stocks);
});

els.refreshBtn.addEventListener("click", () => {
  loadData().catch((error) => {
    els.sourceStatus.textContent = "数据异常";
    els.lastUpdated.textContent = error.message;
  });
});

window.addEventListener("resize", () => {
  if (state.data) drawPulse(state.data.pulse);
});

loadData().catch((error) => {
  els.sourceStatus.textContent = "数据异常";
  els.lastUpdated.textContent = error.message;
});
