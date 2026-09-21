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

## 单 checkout 的 feature branch 开发

本仓库按单人、本地、顺序开发设计。`main` 是稳定历史主线，不要求主项目目录始终 checkout 在
`main`；开发期间该目录正常切换到当前 feature/fix 分支。

1. 在主项目目录中从最新 `main` 创建并切换到任务分支。
2. 任务使用该项目的 local 环境，直接在
   `/Users/chz/myWorkSpace/myJS/直播插件/userscripts` 编辑、测试、构建和验收。
3. Tampermonkey 开发代理固定 `@require` 该目录的 `dist`。切换分支后必须重新构建或重启 dev
   watcher，避免继续加载上一个分支留下的产物；绝对路径本身不随分支变化。
4. 功能完成后提交任务分支，切回 `main` 合并，并在 `main` 上重新构建和执行必要的冒烟验证。
5. 同一功能的补充、修正和复验继续使用原任务及原分支；不同功能避免混入同一次提交。

默认不并行运行两个会写同一 checkout 的任务。这是避免文件互相覆盖的简单协调约定，不是禁止并行
开发：确有同时维护两个独立工作区的需要时可以使用 worktree，但必须显式选择当前浏览器验证所使用的
构建入口，不能让 Tampermonkey 无意绑定到临时 worktree 路径。

## 集成与提交

- 提交尽量保持 package 单一、目的单一；跨 package 的共享基础设施变更必须在提交信息中说明。
- 功能分支合并到 `main` 时保留分支边界；不通过重写远端 `main` 来整理历史。
- 合并前至少执行受影响 package 的测试和类型检查。仓库级交付执行：

```bash
pnpm validate && pnpm test && pnpm type-check && pnpm build
```

- 推送、发布和删除远端分支仍需用户明确授权。
- 本地 `switch`、`add`、`commit`、`merge`、`cherry-pick`、`rebase` 和 annotated tag 属于
  常规开发操作。会丢失未提交数据或改写远端状态的 `reset --hard`、`clean`、普通 `restore`、
  强制删除分支和 push/force-push 仍需明确授权。

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
