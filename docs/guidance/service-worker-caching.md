# Service Worker 缓存说明

## 目的

当前前端已经接入仅在生产环境启用的 Service Worker，用来提升同源静态资源的重复访问速度，并降低前端发布后 chunk 版本切换导致的加载问题。

这套实现是按 ComfyUI 的浏览器部署场景设计的，目标是：

- 缓存前端静态资源和模板元数据
- 让 HTML 导航始终优先走网络，尽快感知新版本
- 不缓存 API、WebSocket、上传和扩展相关流量
- 在任务仍在运行时延后 Service Worker 激活

## 本次改动

### 构建接入

- 在 [`vite.config.mts`](../../vite.config.mts) 中接入了 `vite-plugin-pwa`，使用 `injectManifest` 模式
- 增加了 Workbox 运行时依赖，用于 Service Worker 本体和前端更新协调逻辑
- Service Worker 只会在非 desktop 的生产构建中生成
- 构建产物文件名为 `dist/service-worker.js`

### 运行时缓存策略

Service Worker 源码位于 [`src/service-worker.js`](../../src/service-worker.js)。

缓存策略如下：

- HTML 导航请求：`NetworkFirst`
- 前端 chunk、CSS、字体、图片：`CacheFirst`
- 静态 JSON 数据：
  - `assets/sorted-custom-node-map.json`
  - `templates/*.json`
  - `templates/index_logo.json`
  - `manifest.json`
  策略：`StaleWhileRevalidate`
- 明确绕过 Service Worker 的路径：
  - `/api/*`
  - `/internal/*`
  - `/ws`
  - `/extensions/*`
  - `/docs/*`
  - `/workflow_templates/*`

统一的路径匹配逻辑在
[`src/services/pwa/serviceWorkerPaths.ts`](../../src/services/pwa/serviceWorkerPaths.ts)。

### 更新切换逻辑

前端注册和更新处理逻辑位于
[`src/services/pwa/serviceWorkerManager.ts`](../../src/services/pwa/serviceWorkerManager.ts)。

当前行为：

- 仅在生产 Web 构建中注册 Service Worker
- Service Worker 的 URL 通过 `import.meta.url` 推导，保证反向代理子路径场景
  例如 `/ComfyUI/` 也能拿到正确的注册 scope
- 当新 worker 进入 `waiting` 状态后，只有在以下条件满足时才会激活：
  - `executionStore.isIdle === true`
  - `queueStore.activeJobsCount === 0`
- 对于更新场景，在新的 worker 接管页面后会触发刷新
- 如果同源核心前端 chunk 加载失败，会尝试以下恢复策略：
  - 优先激活等待中的新 worker
  - 如果没有 waiting worker，则直接强制刷新页面

`preload` 和资源加载错误恢复逻辑已经接到
[`src/App.vue`](../../src/App.vue)。

### Manifest 兼容性调整

[`manifest.json`](../../manifest.json) 已改成相对路径写法，以兼容子路径部署：

- `start_url: "./"`
- 图标路径从绝对路径改为相对路径

## 验证方式

### 已执行的自动检查

以下命令已经在 Node 24 下跑通：

```bash
pnpm exec vitest run src/services/pwa/serviceWorkerPaths.test.ts
pnpm typecheck
pnpm exec vite build
```

构建结果确认包含：

- `dist/service-worker.js`
- `dist/service-worker.js.map`

### 本地手工验证

Service Worker 在 dev 模式下不会注册，所以需要用生产预览验证：

```bash
source ~/.nvm/nvm.sh && nvm use 24
pnpm exec vite build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

然后在 Chrome 打开 `http://127.0.0.1:4173/`，按下面步骤检查：

1. 打开 DevTools -> Application -> Service Workers
2. 确认当前应用 scope 下注册了一个 worker
3. 打开 DevTools -> Application -> Cache Storage
4. 确认存在类似以下缓存：
   - `comfyui-frontend-pages`
   - `comfyui-frontend-static`
   - `comfyui-frontend-data`
5. 打开 DevTools -> Network
6. 至少刷新一次页面，确认同源 chunk、字体、图片的重复请求不再每次都完整走远端网络，而是由 Service Worker 或缓存返回

### 部署后验证

在前端发布新版本后，建议按下面流程验证：

1. 先打开一次应用，让当前版本稳定运行
2. 发布一个新的前端构建，确保 chunk hash 发生变化
3. 刷新页面并确认：
   - HTML 请求优先走网络
   - 新的 chunk 文件名被请求
   - `/assets/` 下的核心资源没有出现 stale chunk 报错
4. 在一个任务运行中时，从另一个标签页触发一次更新检查
5. 确认新的 worker 会停留在 `waiting`，不会在任务执行中强制切页
6. 等任务结束后，确认新的 worker 被激活，并且页面自动刷新

### 子路径部署验证

如果应用是通过反向代理挂在子路径下，例如 `/ComfyUI/`，需要额外确认：

1. 注册出来的 Service Worker scope 是 `/ComfyUI/`
2. `/ComfyUI/assets/*.js` 这类资源会被缓存
3. `/ComfyUI/api/*` 这类请求不会被 Service Worker 缓存

## 已知限制

- 第一次把 Service Worker 带上线的版本，更多是在建立接管关系，真正明显的缓存收益通常出现在后续再次访问时
- 这套方案不能替代正常的 HTTP 强缓存，带 hash 的 chunk 仍然建议由服务端返回长效缓存头
- `/extensions/` 下的第三方扩展资源目前是有意不交给 Service Worker 缓存的
