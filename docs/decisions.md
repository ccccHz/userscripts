# 决策记录

## D001：使用本地 pnpm monorepo

**日期：** 2026-06-15

**决策：** 新建 `userscripts/` pnpm workspace，而不是修改或复制已有的第三方
`tampermonkey-scripts` 仓库。

**原因：** `vite-plugin-monkey` 负责单个 userscript 的开发与构建，但不规定多脚本仓库的组织方式。因此 workspace 结构属于本项目自己的约定。

## D002：每个 userscript 一个 package

**日期：** 2026-06-15

**决策：** 每个可独立安装的 userscript 使用一个 package 和一个
`monkey({ entry })` 配置。

**原因：** `vite-plugin-monkey` 的一个配置对应一个 userscript 入口。独立 package
也能让 metadata、依赖和验证范围保持清晰。

## D003：迁移期间保留原文件

**日期：** 2026-06-15

**决策：** 首次迁移时，只把源码复制到新工作区，不修改或删除原项目文件。

**原因：** 仓库中包含旧项目、独立 Git 仓库和未提交修改。保留原文件可以提供可靠回退路径。

## D004：先行为对齐，再现代化

**日期：** 2026-06-15

**决策：** 首次迁移时保留显式 metadata、全局 GM API 用法、外部 `@require`
URL 和运行时行为。

**原因：** 如果同时改成 ESM GM API、npm 管理的 external globals 或共享 helper，
行为回归会更难定位。

## D005：不要假设每个目录都是 userscript

**日期：** 2026-06-15

**决策：** 只有识别出实际的浏览器 userscript 入口后，才创建 package。

**原因：** `biliDM` 当前包含库和实验项目，没有 userscript 入口；其他目录也存在多个候选文件或生成文件。

## D006：pnpm 运行在 Node 18 时临时使用 Vite 6

**日期：** 2026-06-15

**状态：** 已被 D007 取代。

**决策：** 在初始工作区中使用 `vite-plugin-monkey` 7 和 Vite 6。

**原因：** 当时 `pnpm` 运行时使用 Node 18.20.8。Vite 7 要求 Node 20.19
或更高版本，而 `vite-plugin-monkey` 7 同时支持 Vite 6 和 Vite 7。使用
Vite 6 可以暂时避免机器级 Node 迁移。

## D007：用 Volta 固定 Node 22 并使用 Vite 7

**日期：** 2026-06-15

**状态：** 已被 D008 取代。

**决策：** 在工作区中通过 Volta 固定 Node 22.14.0，并使用 Vite 7。

**原因：** Volta 已安装，且本机已有 Node 22.14.0。项目级 Volta 固定可以让 pnpm
相关命令使用兼容 Vite 7 的 Node 版本，同时不改变机器级默认值。后来发现全局 pnpm
最初安装在 Node 18 下，因此仅固定 Node 仍不足以让 `pnpm exec node` 使用新版本。

## D008：用 Volta 固定 Node 24 并重新绑定 pnpm

**日期：** 2026-06-15

**决策：** 在工作区中固定 Node 24.14.0，使用 Vite 7，并在 Node 24 下重新安装
Volta 管理的 pnpm。

**原因：** Node 24 是 LTS，已经是用户的 Volta 默认版本，并且满足 Vite 7 的 Node
要求。重新绑定 pnpm 后可以移除隐藏的 Node 18 运行时，并恢复正常的 `pnpm`
命令，不再需要显式 `volta run` 包装。

## D009：项目文档默认使用中文

**日期：** 2026-06-16

**决策：** `userscripts` 工作区中的维护文档默认使用中文。命令、包名、路径、API 名称、metadata 字段等技术标识保持原文。

**原因：** 用户明确希望文档用中文记录。中文文档也更适合后续多轮迁移时持续维护。

## D010：`auto-fans-continue` 放弃 GM 存储

**日期：** 2026-06-29

**决策：** `auto-fans-continue` 不再使用 `GM_getValue` / `GM_setValue`
保存每日执行状态，改为使用页面 `localStorage`。

**原因：** 用户反馈 GM 存储不好用，`localStorage` 更稳定直观。`douyuEx_meta`
中的 `DailyAuto` 模块也使用 `localStorage` 的 `Ex_DailyAuto_LastTime` 保存每日执行状态。
