# A股每日财经资讯总结

这是一个本地可打开的资讯工作台 MVP，页面读取 `data/daily.json` 渲染市场总览、热点板块、个股逻辑、资讯流、线索池和风险摘要。

## 打开方式

直接打开 `index.html` 即可。页面会优先读取 `data/daily.json`，本地直开时会自动使用 `data/daily.js` 缓存。

也可以在本目录运行本地服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 每日采集

`update-market.mjs` 会从公开行情接口更新指数、行业板块、概念板块和涨幅个股，并生成 `data/daily.json` 与 `data/daily.js`：

```bash
node update-market.mjs
```

`collect.mjs` 仍保留为可替换的数据源适配器：

```bash
node collect.mjs collector.config.example.json
```

它会读取 JSON、RSS 或本地文件，把结果写入 `data/daily.json`，同时生成 `data/daily.js` 供本地直开使用。实际落地时建议接入以下合规来源：

- 交易所公告、上市公司公告、巨潮资讯等公开公告源
- 自有授权的财经快讯 API
- 券商研报摘要或内部研究纪要
- 行情数据服务商 API，例如指数、涨跌幅、成交额、板块热度

## 后续可扩展

- 增加定时任务：Windows 任务计划程序或服务器 cron 每日 08:30、11:45、15:30 采集。
- 增加 AI 摘要：把采集到的标题、摘要、板块和个股输入模型，输出统一 JSON。
- 接入社媒热议：把抖音/小红书官方开放平台、巨量算数、新红、千瓜等数据写入 `data/social-buzz.json`，`update-market.mjs` 会合并到页面。
- 增加数据库：SQLite/PostgreSQL 保存历史主题，支持按日期复盘。
- 增加登录与订阅：按行业、股票池、持仓列表生成个性化摘要。

页面中的当前内容是示例数据，不构成投资建议。
