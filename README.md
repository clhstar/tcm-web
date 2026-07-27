# AI中医 Web/Desktop

React 19 + Vite 8 前端，同时提供浏览器版本和 Electron 桌面版本。桌面端复用同一套 React UI，并通过仅监听 `127.0.0.1` 的本地静态服务器加载页面，使现有后端 CORS 规则继续适用。

## 服务地址

- 本地开发：`.env`
- 生产 Web 与桌面包：`.env.production`
- Java API：`http://47.108.172.192:4040`
- TCM Flow API：`http://47.108.172.192:2027`

如服务器地址变化，只修改 `.env.production` 后重新构建即可。

## 开发

在项目目录运行：

```bash
pnpm dev
pnpm dev:desktop
```

## 构建

```bash
# Web
pnpm build

# 当前操作系统的桌面包
pnpm build:desktop

# Windows x64 NSIS 安装包（在 Windows 上运行）
pnpm build:desktop:win

# macOS Intel + Apple Silicon DMG/ZIP（在 macOS 上运行）
pnpm build:desktop:mac
```

输出目录为 `release/`。GitHub Actions 工作流会分别在 Windows 和 macOS Runner 上构建，并上传安装包 Artifact。

当前构建默认不签名：Windows 可能显示 SmartScreen 提示，macOS 可能显示 Gatekeeper 提示。正式分发时应在 CI 中配置 Windows 代码签名证书，以及 Apple Developer ID 与 notarization 凭据。

## 发布新版本

在 `main` 分支、工作区干净时运行：

```bash
pnpm release
```

默认递增 patch 版本，例如 `0.1.20` -> `0.1.21`。脚本会同步远端 main/tags、更新 `package.json`、提交 `release: vx.x.x`、创建 `vx.x.x` tag，并推送 `main` 和 tag 到 `origin`；不会执行测试。

可选参数：

```bash
pnpm release -- --minor
pnpm release -- --major
pnpm release -- --version=0.2.0
pnpm release -- --dry-run
```

## Electron 安全边界

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer sandbox 开启
- 默认拒绝权限请求
- 外部 HTTP/HTTPS 链接交给系统浏览器
- 打包后页面仅由随机端口的 `127.0.0.1` 静态服务器提供
