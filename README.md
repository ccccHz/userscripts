# Userscripts 工作区

这个工作区用于集中管理本仓库中正在使用的 userscript。

## 目标

- 每个可独立安装的 userscript 使用一个 package。
- 使用 Vite 和 `vite-plugin-monkey` 负责开发与生产构建。
- 首次迁移旧脚本时保持原有行为不变。
- 用版本化文档记录迁移进度、待办事项和未决问题。
- 新脚本在浏览器中验证通过前，不移动、删除或改写原项目目录。
- 优先把 Tampermonkey 中依赖 `file://` 本地文件的自用脚本迁移为 git 管理的 package，方便迁移到其他机器后同步和更新。
- 除命令、包名、路径、API 名称等技术标识外，项目文档默认使用中文。

## 命令

```bash
pnpm install
pnpm dev -- <package-name>
pnpm build
pnpm prepare-pages
pnpm type-check
pnpm validate
pnpm --filter <package-name> dev
pnpm --filter <package-name> build
```

Volta 会使用 `package.json` 中固定的 Node 版本。由 Volta 管理的 pnpm
也必须运行在同一个 Node 版本下。

## 开发版

开发版回到 `vite-plugin-monkey` 官方的 `vite serve` 流程，一次只启动一个 package：

```bash
pnpm dev -- kuaishou-live-optimizer
```

也可以直接使用 pnpm filter：

```bash
pnpm --filter kuaishou-live-optimizer dev
```

Vite 启动后，插件会自动打开 Tampermonkey 开发版安装页；安装一次后，源码由 Vite
原生模块服务加载并使用 HMR。所有 package 默认从 `5173` 启动；如果该端口已被占用，
Vite 会自动尝试 `5174`、`5175` 等后续端口。正常一次只启动一个 package 时，开发地址
会长期保持在 `127.0.0.1:5173`。

官方开发入口会把本地 ES module 注入目标页面，因此仍受目标网站 CSP 约束。调试快手、
虎牙、NGA、Wikipedia 等站点时，需要启用 `Disable-CSP` 扩展；只在开发期间、并尽量只对
正在调试的站点启用。旧的 gateway、`GM_xmlhttpRequest` loader、bundle 轮询和整页刷新
方案已经移除。

## 构建和发布

`pnpm build` 只负责在每个 package 的 `dist/` 下生成 `.user.js` 和 `.meta.js`；
`pnpm prepare-pages` 会把所有产物汇总到忽略提交的 `site/`，用于本地检查或 Pages
部署。

推送到 `ccccHz/userscripts` 的 `main` 分支后，GitHub Actions 会依次执行测试、
类型检查、构建和 GitHub Pages 部署。生产版安装入口为：

```text
https://ccccHz.github.io/userscripts/
```

每个脚本的 `@updateURL` 指向对应 `.meta.js`，`@downloadURL` 指向 `.user.js`。
发布代码变更前必须提高对应 package 的 `package.json` `version`；
`vite.config.ts` 会自动读取它，不需要再维护第二份版本号。

首次启用发布时，需要在 GitHub 仓库的 `Settings > Pages > Build and deployment`
中把 `Source` 设为 `GitHub Actions`。

## Tampermonkey 跨浏览器迁移包

先完成 `pnpm build`，再基于原始 Tampermonkey 导出包生成清理后的可移植导入包：

```bash
pnpm prepare-tampermonkey-import -- \
  /path/to/original-tampermonkey-export.zip \
  artifacts/tampermonkey-clean.zip
```

导入包包含工作区中的 8 个正式构建版本，以及原导出包中已启用、已有远程更新
来源的 8 个第三方脚本。所有保留脚本都会设为启用并打开更新检查；`file://` 依赖、
空实现、测试脚本和用户确认不保留的停用脚本不会进入清理包。脚本会同时生成同名
`.json` 清单，记录版本、更新 URL 和排除原因。

## 已管理的包

| Package | 原项目 | 状态 |
| --- | --- | --- |
| `auto-fans-continue` | `../autoFansContinue/AutoFansContinue.user.js` | 代码已按 `douyuEX_new` 和 `douyuEx_meta` 重构，浏览器验证待完成 |

## 文档

- [迁移状态](docs/migration-status.md)
- [TODO 清单](docs/todo.md)
- [决策记录](docs/decisions.md)
- [Tampermonkey 脚本整理清单](docs/tampermonkey-inventory.md)

## 迁移规则

1. 创建 package 前，先确认实际使用的 userscript 入口。
2. 将源码复制到本工作区，不修改或删除原文件。
3. 首次迁移时保留 metadata 和运行时行为。
4. 同时验证生成的 userscript 产物和它在目标网站中的实际行为。
5. 在 `docs/migration-status.md` 中记录进度、决策和阻塞项。
6. 只有在行为对齐后，才考虑代码现代化或抽取共享工具。
7. 重要调整需要用 git commit 记录，便于未来回退。
8. 当前阶段优先替换 `file://` 本地引用；浏览器扩展、后台任务、Bark 推送等增强能力先记录为未来升级方向。
