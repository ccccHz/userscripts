# Working agreement

本仓库迁移和维护多个 userscript。默认先保持用户可感知行为，再用现代、轻量、可维护的内部实现替换旧代码。
已有改动属于用户，避免覆盖无关内容。

## 任务编排

- 重型 package 可以使用独立调度中心；调度中心的职责是澄清需求、冻结体验契约、创建任务、汇总结果并独立判断验收证据，不直接实现完整功能，也不重复已由指定负责人完成的浏览器路径。
- 各调度中心只处理已约定的 package 范围；`douyu-web-enhancer` 的调度规则位于 `packages/douyu-web-enhancer/docs/task-routing.md`。
- 完整且可独立验收的功能使用侧栏可见的独立任务；内部 subagent 只做边界清楚、一次性返回短结果的辅助工作。
- 可写任务默认使用 `userscripts` 保存项目的 local 环境，并在同一主项目目录内通过短期 feature/fix 分支开发。避免同时启动会写同一 checkout 的任务；只有确有并行隔离价值时才使用 worktree，并显式约定其构建与浏览器入口。
- 每个独立任务是对应交付物的持续负责人：补功能、修正、复验和同一界面/模块的后续完善默认续用原任务。派发前先查找已有负责任务；“可独立验收”本身不是重建任务的理由。
- 修改目标 package 前读取其最近的 `AGENTS.md`。只定向读取当前功能需要的契约和证据，不默认加载全部历史文档。
- `archive/` 是只读历史样本；新实现必须放在 `packages/` 中，不得在归档源码上直接续改。

## 安全与仓库边界

- 发布、推送、安装脚本、扩大 userscript 权限、真实账号/付费/对外操作和删除数据必须先获用户确认。
- 不提交 Cookie、Token、个人导出数据或含这些内容的日志。
- 每个可安装 userscript 使用独立 `packages/<name>`；共享代码放 `shared/`，仓库工具放 `scripts/`。
- `main` 是唯一长期主线；功能分支使用 `<type>/<package>/<slug>`。不建立长期 package 分支，完整规则见 `docs/git-workflow.md`。
- 开发、构建和浏览器验收默认都在主项目目录当前 checkout 的任务分支完成；切换分支后重新构建或重启 dev watcher，Tampermonkey 开发代理继续 `@require` 主项目目录的 `dist`。
- 本地分支创建、切换、暂存、提交、合并、cherry-pick、rebase 和 annotated tag 属于常规版本控制；推送、发布以及可能丢失数据的 reset/clean/restore/强制删除仍须用户确认。
- 用户可见版本是发布声明：验证中的构建和试验保持当前 package 版本；只有最新 `dist` 已通过约定的核心浏览器路径、并获用户验收或明确发布授权时才提高版本。验证期保持 `userscript.publish=false`。
- 页面功能必须可撤销、幂等，避免无界轮询和 observer 自激。

## 完成标准

- 运行与范围相称的测试和类型检查；仓库级交付运行 `pnpm validate && pnpm test && pnpm type-check && pnpm build`。
- 页面体验使用修改后的实际构建产物验收；未实际验证的项目明确标记，不推断通过。
- 声明 UI 行为完成或发布前，必须完成“最新 `dist` → 刷新目标页面 → 核心操作”闭环；浏览器自动化可证明接线与回归，但涉及手感时不能替代真实输入验收。
- 最终报告说明改动、版本、验证结果和未覆盖项。
