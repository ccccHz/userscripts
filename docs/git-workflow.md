# Git 分支、worktree 与发布约定

本仓库是多个 userscript package 共用的 monorepo。分支按交付物划分，不为每个 package
维护长期分支。

## 主目录与主线

- `/Users/chz/myWorkSpace/myJS/直播插件/userscripts` 是唯一长期主项目目录，也是日常构建、
  Tampermonkey 开发代理和最终集成的权威来源。
- `main` 是唯一长期主线，只接收已经完成检查、可以继续集成的提交。
- 功能开发不能直接在 `main` 上进行；一个交付物使用一个短期分支。
- `archive/` 只保存历史样本，不作为开发分支或运行入口。

## 分支命名

统一使用 `<type>/<package>/<slug>`：

```text
feat/douyu-web-enhancer/danmaku-availability
fix/douyu-web-enhancer/remove-sync-button
docs/userscripts/git-workflow
chore/userscripts/dependency-update
refactor/douyu-web-enhancer/settings-store
test/douyu-web-enhancer/danmaku-availability
```

- `feat`：新增用户能力。
- `fix`：修复既有行为。
- `docs`、`test`、`refactor`、`chore`：分别用于文档、测试、纯重构和维护。
- `wip/<package>/<slug>` 只用于无损保存混合或待拆分改动，不合并进 `main`。
- 不再使用 package 无关或来源不明的长期 `codex/*` 开发分支。

## 一个任务、一个分支、同一个项目目录

1. 调度中心先在主项目目录中从最新 `main` 创建并切换到任务分支。
2. 可写的独立任务使用该项目的 local 环境，直接在
   `/Users/chz/myWorkSpace/myJS/直播插件/userscripts` 工作；默认不创建 Codex worktree。
3. 同一时间只安排一个会写入该项目的功能任务。其他并行任务只能做只读调研、审查或等待，
   避免共享 checkout 时互相切分支或覆盖文件。
4. 源码、测试、构建和浏览器验收都在这个项目目录完成，因此长期安装的 Tampermonkey
   开发代理始终 `@require` 这个目录的 `dist`，不会出现第二个开发产物来源。
5. 任务通过检查并提交后，由调度中心审核、切回 `main` 并合并；后续修正重新切回同一任务分支。
6. 只有用户明确要求隔离，或主目录无法安全承载任务时才使用 worktree；使用前必须另行约定
   构建和浏览器入口，不能默认改变 `@require` 来源。

同一功能的补充、修正和复验继续使用原任务及原 feature/fix 分支；不同功能不能混入同一次提交。

## 集成与提交

- 提交尽量保持 package 单一、目的单一；跨 package 的共享基础设施变更必须在提交信息中说明。
- 功能分支合并到 `main` 时保留分支边界；不通过重写远端 `main` 来整理历史。
- 合并前至少执行受影响 package 的测试和类型检查。仓库级交付执行：

```bash
pnpm validate && pnpm test && pnpm type-check && pnpm build
```

- 推送、发布和删除远端分支仍需用户明确授权。

## 版本与 tag

- 开发和验证期间保持 package 当前版本，`userscript.publish=false`；版本号不是每个试验提交的计数器。
- 最新 `dist` 完成约定浏览器验收、且用户确认发布后，单独创建 release 提交提高版本。
- 每个 package 独立遵循语义化版本：修复用 patch，向后兼容的新能力用 minor，不兼容调整用 major。
- release 使用 annotated tag：`<package>/v<version>`，例如
  `douyu-web-enhancer/v0.10.11`。
- 非发布但需要长期定位的重要快照使用
  `<package>/baseline-YYYY-MM-DD`，不得冒充 release tag。
- tag 必须指向已经进入 `main` 的提交；同一个 package/version 不重复打 tag，也不移动已发布 tag。

当前确认的 DouyuEx 迁移基线是提交 `fa69430`，标记为
`douyu-web-enhancer/baseline-2026-09-21`；基线 package 版本为 `0.10.10`。
