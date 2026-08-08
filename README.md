# ivadmin-web

Pixo 新运营后台 Web 项目。

- `admin/`：React、TypeScript、Vite 管理后台。
- `player/`：运营后台使用的互动内容预览播放器。
- `deploy/`：Nginx 与生产镜像配置。

本地目录由线上 `/opt/play_video/ivadmin` 的生产源码建立，已移除原 GitHub Git 信息、依赖缓存和构建产物。

## 本地开发

```bash
cd admin
npm install
npm run dev
```

开发服务器默认使用 `5173` 端口，并将 `/api` 代理到 `http://127.0.0.1:8000`。

