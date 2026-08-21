# viAdminWeb

Pixo 运营后台的独立前端、预览播放器与 Web 部署配置。后端 API 位于独立的 `ivadmin` 服务；本仓库不保存后端密钥、数据库数据或媒体文件。

## 目录

- `admin/`：React + TypeScript + Vite 运营后台。
- `player/`：运营后台内嵌使用的互动视频预览播放器。
- `deploy/`：生产镜像与 Nginx 反向代理配置。

## 开发

需要 Node.js 20（见 `admin/.nvmrc`）。

```bash
cd admin
npm ci
npm run dev
```

开发服务器默认使用 `5173` 端口，`/api` 请求代理到 `http://127.0.0.1:8000`。如需本地联调，请先启动对应的 ivadmin API 服务。

## 验证与构建

```bash
cd admin
npm run build
```

构建结果位于 `admin/dist/`，仅用于镜像构建，不提交到 Git。生产镜像通过 `deploy/Dockerfile.web` 使用锁定的 npm 依赖构建，并由 `deploy/nginx.conf` 提供静态页面、`/player/` 预览资源及 `/api/` API 反向代理。

## AI 生成视频（Seedance / Vidu）

后台侧边栏「AI生成视频」是原生 React 页面（无 iframe），功能参考
makeVideo 项目实现：文生视频 / 图生视频 / 参考视频、模型与参数选择、
任务轮询与记录管理、设置弹窗，以及任务列表里的「使用此视频」→ 发布流程。

模型服务商可在页面「设置」中切换：**火山方舟（Seedance 2.5 / 2.0）** 或
**Vidu（viduq3-pro / viduq3-turbo）**。切换后模型列表、时长/分辨率范围、
图片与参考视频限制会自动按服务商调整（Vidu 图生视频仅支持 1 张首帧图片，暂不支持参考视频）。

前端通过后台同源接口 `/api/v1/seedance/*` 访问，由 ivAdminApi 代理到
独立的 makeVideo 服务（见 `ivAdminApi/README.seedance.md`）。makeVideo
服务需与后台部署在同一台服务器（默认 `127.0.0.1:8123`），并在
ivAdminApi 的 `.env` 配置 `SEEDANCE_UPSTREAM_BASE_URL`；Vidu 的 API Key
与模型配置在 makeVideo 的设置里维护（`tools/data/settings.json` 或环境变量）。

## 协作约定

- 功能从 `feature/<topic>` 分支开发，经 Pull Request 合并到 `main`。
- `main` 必须保持可构建、可部署；建议在 GitHub 对它开启 PR 审核与构建检查保护。
- 不提交 `.env`、访问令牌、私钥、`node_modules`、`dist` 或 TypeScript 构建缓存。
- 修改 API 合同时，应同时更新 ivadmin 后端仓库并完成联调。
