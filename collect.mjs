import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const configPath = process.argv[2] || "./collector.config.example.json";
const config = JSON.parse(await readFile(configPath, "utf8"));
const root = dirname(resolve(configPath));
const outputPath = resolve(root, config.output || "./data/daily.json");

const items = [];
for (const source of config.sources || []) {
  try {
    const fetched = await loadSource(source, root);
    fetched.forEach((item) => items.push(normalizeItem(item, source)));
  } catch (error) {
    items.push({
      time: nowTime(),
      type: source.category || "market",
      source: source.name,
      title: `${source.name} 采集失败`,
      summary: error.message,
      impact: "需检查数据源"
    });
  }
}

const digest = buildDigest(items, config);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
if (outputPath.endsWith(".json")) {
  const scriptPath = outputPath.replace(/\.json$/i, ".js");
  await writeFile(scriptPath, `window.__DAILY_DIGEST__ = ${JSON.stringify(digest, null, 2)};\n`, "utf8");
}
console.log(`Wrote ${outputPath}`);

async function loadSource(source, rootDir) {
  if (source.type === "file") {
    const filePath = resolve(rootDir, source.path);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(data) ? data : data.items || [];
  }

  if (source.type === "json") {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : data.items || data.data || [];
  }

  if (source.type === "rss") {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    return parseRss(xml);
  }

  throw new Error(`不支持的数据源类型：${source.type}`);
}

function normalizeItem(item, source) {
  return {
    time: item.time || item.pubTime || item.pubDate || nowTime(),
    type: item.type || source.category || "market",
    source: item.source || source.name,
    title: item.title || item.headline || "未命名资讯",
    summary: item.summary || item.description || item.content || "",
    impact: item.impact || inferImpact(`${item.title || ""} ${item.summary || ""}`)
  };
}

function buildDigest(feed, config) {
  const tradeDate = config.tradeDate === "auto" ? today() : config.tradeDate;
  const rankedSectors = rankSectors(feed, config.summary?.watchSectors || []);
  const themeTitle = rankedSectors.length
    ? `${rankedSectors.slice(0, 3).map((item) => item.name).join("、")}成为资金关注主线`
    : "市场主线等待数据源补充";

  return {
    tradeDate,
    status: "自动采集",
    lastUpdated: `${today()} ${nowTime()}`,
    market: {
      shanghai: { name: "上证指数", value: "--", change: "0.00%" },
      shenzhen: { name: "深证成指", value: "--", change: "0.00%" },
      chinext: { name: "创业板指", value: "--", change: "0.00%" },
      temperature: Math.min(88, 45 + rankedSectors.length * 8)
    },
    theme: {
      title: themeTitle,
      summary: summarizeTheme(rankedSectors, feed)
    },
    pulse: makePulse(rankedSectors.length),
    sectors: rankedSectors,
    stocks: extractStocks(feed),
    feed: feed.slice(0, config.summary?.maxFeedItems || 60),
    signals: buildSignals(rankedSectors),
    risks: [
      "自动摘要只反映已接入数据源，交易前需结合公告、成交额和龙虎榜复核。",
      "题材热度高不等于业绩兑现，注意短线情绪回落。",
      "若采集源延迟或失败，页面会保留采集异常记录。"
    ]
  };
}

function rankSectors(feed, watchSectors) {
  const buckets = new Map();
  for (const sector of watchSectors) {
    buckets.set(sector, {
      name: sector,
      score: 0,
      change: "+0.0%",
      logic: "",
      tags: [],
      leaders: [],
      breadth: 0
    });
  }

  for (const item of feed) {
    const text = `${item.title} ${item.summary} ${item.impact}`;
    for (const sector of watchSectors) {
      if (text.includes(sector)) {
        const current = buckets.get(sector);
        current.score += item.type === "policy" ? 18 : 12;
        current.tags.push(item.type);
        current.logic = current.logic || item.summary || item.title;
      }
    }
  }

  return [...buckets.values()]
    .filter((item) => item.score > 0)
    .map((item) => ({
      ...item,
      score: Math.min(95, 55 + item.score),
      change: `+${(item.score / 10).toFixed(1)}%`,
      tags: [...new Set(item.tags)].slice(0, 4),
      leaders: item.leaders.length ? item.leaders : ["待提取"],
      breadth: Math.min(92, 48 + item.score)
    }))
    .sort((a, b) => b.score - a.score);
}

function extractStocks(feed) {
  const stockPattern = /([\u4e00-\u9fa5A-Za-z]{2,8})[（(]?([036]\d{5})[）)]?/g;
  const found = new Map();
  for (const item of feed) {
    const text = `${item.title} ${item.summary}`;
    for (const match of text.matchAll(stockPattern)) {
      const key = match[2];
      if (!found.has(key)) {
        found.set(key, {
          name: match[1],
          code: match[2],
          change: "0.00%",
          sector: item.impact || item.type,
          summary: item.summary || item.title,
          logic: [item.title, item.impact || "等待人工复核"].filter(Boolean)
        });
      }
    }
  }
  return [...found.values()].slice(0, 12);
}

function buildSignals(sectors) {
  return sectors.slice(0, 5).map((sector) => ({
    title: `${sector.name}后续验证`,
    detail: `跟踪${sector.name}的公告、订单、成交额扩散和核心个股反馈。`
  }));
}

function summarizeTheme(sectors, feed) {
  if (!sectors.length) return "当前数据源尚未形成稳定主题，需要补充快讯、公告或研报摘要。";
  const lead = sectors.slice(0, 3).map((item) => item.name).join("、");
  const count = feed.length;
  return `已聚合 ${count} 条资讯，${lead}出现频次较高。摘要由规则模板生成，适合做早盘/收盘复盘底稿，关键结论仍建议结合实时行情和公告原文核验。`;
}

function inferImpact(text) {
  if (/利好|增长|订单|中标|突破|提速|上调/.test(text)) return "偏利好";
  if (/风险|下调|减持|亏损|处罚|放缓/.test(text)) return "偏谨慎";
  return "待观察";
}

function parseRss(xml) {
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  return [...xml.matchAll(itemPattern)].map((match) => {
    const block = match[1];
    return {
      title: pickXml(block, "title"),
      summary: pickXml(block, "description"),
      pubDate: pickXml(block, "pubDate")
    };
  });
}

function pickXml(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripXml(match[1]).trim() : "";
}

function stripXml(value) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "");
}

function makePulse(seed) {
  return Array.from({ length: 14 }, (_, index) => {
    const wave = Math.sin((index + seed) / 2) * 8;
    return Math.round(45 + seed * 7 + index * 1.6 + wave);
  });
}

function today() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: config.timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date()).replaceAll("/", "-");
}

function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: config.timezone || "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}
