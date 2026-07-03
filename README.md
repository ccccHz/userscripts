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
pnpm build
pnpm type-check
pnpm validate
pnpm --filter <package-name> dev
pnpm --filter <package-name> build
```

Volta 会使用 `package.json` 中固定的 Node 版本。由 Volta 管理的 pnpm
也必须运行在同一个 Node 版本下。

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
