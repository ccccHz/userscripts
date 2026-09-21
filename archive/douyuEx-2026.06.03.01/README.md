# DouyuEx 本地归档

本目录是 DouyuEx 的只读历史归档，用于保留最后一份本地上游样本，并作为 `packages/douyu-web-enhancer` 迁移功能时的稳定参考。因斗鱼官方侧变化，原项目不再继续使用和维护；这里不是续更分支，也不接受直接开发。

当前 Git 仓库只收录日常迁移所需的不可变 `source/` 快照和发布产物校验值。完整历史恢复包 `douyuEx-a6acc60.bundle` 与重复的便携压缩包保留在仓库外的原始冷备份中，不作为构建、测试或普通迁移任务的输入。

## 归档基线

- 上游仓库：`https://github.com/qianjiachun/douyuEx.git`
- 分支：`master`
- 提交：`a6acc60a382e0007272e158bbdc3ff0bb3e0c754`
- 提交时间：`2026-06-03T17:19:29+08:00`
- 提交说明：`release: 2026.06.03.01`
- 归档时间：`2026-08-09`（Asia/Shanghai）
- 文件数：202 个 Git 跟踪文件

归档基线来自本地干净副本 `douyuEX_new`。个人 fork 工作区 `douyuEx_meta` 中的提交和未提交修改均未混入本归档。

## 目录内容

- `source/`：上述提交的完整、无 `.git` 源码快照，包含当时提交的 `dist/` 发布产物。
- `SHA256SUMS`：仓库内原始发布产物的 SHA-256 校验值。

仓库外冷备份中的 Git bundle 可用于恢复完整仓库：

```sh
git clone douyuEx-a6acc60.bundle douyuEx
```

验证归档文件：

```sh
shasum -a 256 -c SHA256SUMS
```

## 构建说明

原项目的构建依赖 Node.js、npm 和 `uglify-js`。在 `source/` 内执行：

```sh
npm ci
npm run build
```

归档检查使用 Node.js `v24.14.0` 和锁文件指定的 `uglify-js 3.19.3`，源码能够成功完成构建。

需要注意：`build.js` 仅移除 CSS 的 CRLF（`\r\n`），不移除 LF（`\n`），因此构建结果受源码检出时的换行格式影响。Git 快照没有保留作者当时各 CSS 文件的混合工作区换行状态，所以在当前 macOS/LF 环境重新生成的两个脚本与提交内 `dist/` 不逐字节一致。`dist/douyuex_version.txt` 可以一致。归档以提交内的 `source/dist/` 为原始发布产物，不用重建结果覆盖它。

## 许可证备注

上游 `package.json` 声明许可证为 MIT，但该提交没有包含独立的 `LICENSE` 文件。本归档保持原提交内容，不补写或推断版权声明；后续提取代码时应保留来源记录，并在发布前重新核实许可信息。

## 后续开发边界

新的自用版本应在独立目录或仓库中实现，只选择仍有价值的功能，并重新梳理依赖、权限和斗鱼页面兼容性。不要直接修改本归档，以便它始终可以作为稳定对照样本。
