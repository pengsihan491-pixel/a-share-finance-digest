# 免费部署说明

这个目录是纯静态网站，可以部署到任何免费静态托管平台。

## 最快方式：Netlify Drop

1. 打开 https://app.netlify.com/drop
2. 登录 Netlify 账号
3. 上传 `a-share-finance-digest-deploy.zip`
4. 部署完成后会得到一个免费域名，例如：
   `https://your-site-name.netlify.app`

## Vercel

1. 打开 https://vercel.com/new
2. 上传本目录或连接 GitHub 仓库
3. Framework 选择 `Other`
4. Build command 留空
5. Output directory 留空或填 `.`
6. 部署后会得到：
   `https://your-project.vercel.app`

## Cloudflare Pages

1. 打开 https://dash.cloudflare.com/
2. 进入 Workers & Pages
3. 创建 Pages 项目
4. 上传本目录
5. Build command 留空
6. Output directory 填 `/`
7. 部署后会得到：
   `https://your-project.pages.dev`

## GitHub Pages

1. 新建一个 GitHub 仓库
2. 上传本目录所有文件
3. 在仓库 Settings -> Pages 中选择 `Deploy from a branch`
4. Branch 选择 `main`，Folder 选择 `/root`
5. 部署后会得到：
   `https://你的用户名.github.io/仓库名/`

## 每天更新数据

新版前端会在公网环境中优先直接读取公开行情接口，页面打开时自动刷新指数、板块、个股和快讯。

静态缓存仍然保留。需要手动刷新缓存时，本地运行：

```bash
node update-market.mjs
```

它会更新：

- `data/daily.json`
- `data/daily.js`

如果网站已经部署到公网，需要重新上传更新后的文件，或者后续改成 GitHub Actions/服务器定时任务自动更新。

## 动态数据说明

- 行情数据：优先请求 Netlify 动态函数；如果函数不可用，再尝试浏览器端公开行情接口；仍失败则回退到静态缓存。
- 社媒数据：仍读取 `data/social-buzz.json`，未接入前不会生成假榜单。
- 失败兜底：如果公开行情接口无法访问，页面会回退到打包时的 `data/daily.js` 缓存。

## 免费自动更新方案

如果你想让 Netlify 上的站点每天自动更新，推荐连接 GitHub：

1. 把本目录上传到一个 GitHub 仓库。
2. 在 Netlify 中选择 `Add new site -> Import an existing project`，连接这个仓库。
3. Build command 留空，Publish directory 填 `.`。
4. 仓库里的 `.github/workflows/update-market.yml` 会在交易日下午自动运行 `node update-market.mjs`。
5. 脚本更新 `data/daily.json` 和 `data/daily.js` 后提交到仓库，Netlify 会自动重新部署。
