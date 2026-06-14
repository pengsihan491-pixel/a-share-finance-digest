import { readFile } from "node:fs/promises";

const urls = {
  indices: "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f4,f6,f104,f105,f106&secids=1.000001,0.399001,0.399006",
  industry: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f4,f6,f104,f105,f128,f140,f136",
  concept: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:3&fields=f12,f14,f2,f3,f4,f6,f104,f105,f128,f140,f136",
  stocks: "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f4,f5,f6,f8,f9,f10,f15,f16,f17,f18",
  lastTradeDay: "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&fields2=f51&klt=101&fqt=1&end=20500101&lmt=1"
};

export async function handler() {
  try {
    const [indicesRaw, industryRaw, conceptRaw, stocksRaw, socialBuzz, lastTradeDate] = await Promise.all([
      fetchJson(urls.indices),
      fetchJson(urls.industry),
      fetchJson(urls.concept),
      fetchJson(urls.stocks),
      loadSocialBuzz(),
      fetchLastTradeDate()
    ]);

    const digest = buildDigest({
      indices: indicesRaw.data.diff,
      industry: industryRaw.data.diff,
      concept: conceptRaw.data.diff,
      stocks: stocksRaw.data.diff,
      socialBuzz,
      tradeDate: lastTradeDate
    });

    return jsonResponse(200, digest, {
      "Cache-Control": "public, max-age=60, s-maxage=120"
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "MARKET_FETCH_FAILED",
      message: error.message
    });
  }
}

async function fetchJson(url, validate = hasQuoteDiff) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 AShareDigest/1.0"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!validate(data)) throw new Error("bad quote response");
  return data;
}

async function fetchLastTradeDate() {
  try {
    const data = await fetchJson(urls.lastTradeDay, hasKline);
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

async function loadSocialBuzz() {
  try {
    const data = JSON.parse(await readFile(new URL("../../data/social-buzz.json", import.meta.url), "utf8"));
    return {
      status: data.status || "已接入社媒数据",
      lastUpdated: data.lastUpdated || nowText(),
      source: data.source || "data/social-buzz.json",
      items: Array.isArray(data.items) ? data.items.slice(0, 5) : []
    };
  } catch {
    return {
      status: "未接入抖音/小红书数据源",
      lastUpdated: "",
      source: "等待接入导入文件",
      items: []
    };
  }
}

function buildDigest({ indices, industry, concept, stocks, socialBuzz, tradeDate }) {
  const sh = byCode(indices, "000001");
  const sz = byCode(indices, "399001");
  const cy = byCode(indices, "399006");
  const upCount = sum(indices, "f104");
  const downCount = sum(indices, "f105");
  const temperature = Math.round((upCount / Math.max(1, upCount + downCount)) * 100);
  const topIndustryNames = industry.slice(0, 3).map((item) => item.f14).join("、");
  const topConceptNames = concept.slice(0, 3).map((item) => item.f14).join("、");

  return {
    tradeDate: tradeDate || latestWeekdayText(),
    status: "Netlify 动态函数实时行情",
    lastUpdated: nowText(),
    market: {
      shanghai: indexFromQuote(sh),
      shenzhen: indexFromQuote(sz),
      chinext: indexFromQuote(cy),
      temperature
    },
    theme: {
      title: `${topIndustryNames}领涨，${topConceptNames}活跃`,
      summary: `页面通过 Netlify 动态函数实时读取公开行情接口：行业侧 ${topIndustryNames} 涨幅居前，概念侧 ${topConceptNames} 较活跃。该摘要只反映行情强弱，不等同于新闻因果或投资建议；涨跌逻辑仍需结合公告、成交额、龙虎榜、研报和社媒热度复核。`
    },
    pulse: makePulse(temperature),
    sectors: industry.map(sectorFromQuote),
    stocks: stocks.map(stockFromQuote),
    feed: buildFeed({ indices, industry, concept, stocks }),
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

function buildFeed({ indices, industry, concept, stocks }) {
  const indexLine = indices.map((item) => `${item.f14} ${num(item.f2)}（${pct(item.f3)}）`).join("，");
  return [
    {
      time: shortTime(),
      type: "market",
      source: "Netlify 动态函数",
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

function indexFromQuote(item) {
  return {
    name: item.f14,
    value: Number(item.f2).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    change: pct(item.f3)
  };
}

function byCode(items, code) {
  return items.find((item) => item.f12 === code) || items[0];
}

function sum(items, key) {
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

function jsonResponse(statusCode, data, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers
    },
    body: JSON.stringify(data)
  };
}
