# 页面 WebSocket Hook：第一阶段契约与验收

状态：实现中；真实斗鱼页面的最新 `dist` 验证前保持 `verifying`。用户 2026-09-28 确认目标是斗鱼页面自己建立的直播间 WebSocket，第一阶段只实现 Hook，不加入屏蔽、提醒、小尾巴或礼物改写。

## 范围与行为

- 在现有 `document-start`、页面主世界入口安装一次构造器 Hook；仅观察斗鱼域名的页面 WebSocket。返回原生实例，页面原本的 `onmessage`、`addEventListener`、`send`、`close`、`binaryType`、消息事件与消息字节保持原样。
- 只在内存中统计连接、断开、错误、入站帧，以及可识别的 `chatmsg`、`uenter`、`dgb`、`ranklist` 与其他消息类型。诊断不包含原始包、正文、UID、昵称、Cookie、Token 或完整连接 URL；不持久化、不上传。
- 不自行建立登录态连接，不复用匿名连接，不发送任何消息。既有 `danmaku-send-check` 的匿名连接显式使用 Hook 安装前的原生构造器，避免算作页面连接。
- `socketHook` 旧项目的入站改写仅作协议参考；DouyuEx 的“荧光棒变超火”是礼物横幅 DOM 改写，第一阶段不迁移。当前消息类型只用于接线证据，不断言斗鱼当前完整协议或各展示区域一定由同一实例驱动。

## 生命周期与失败回退

- 新开页必须在页面创建目标 Socket 前安装；若加载过晚，不能追溯已有实例，报告未捕获，不强迫斗鱼重连。页面自己重连时，Hook 观察新实例；SPA 换房是否复用同实例由真实页面证据判断。
- `pagehide` 解除观察监听，并只在仍持有 `WebSocket` 构造器位置时恢复原值；不关闭页面 Socket。重复安装共享一份 Hook。别的脚本后来替换构造器时，不覆盖对方。
- 构造器不可替换、解析失败、帧过大或协议变化时只降级诊断；原生连接和页面消息继续运行。观察没有定时重连或无界日志，诊断合并更新。
- 构造器 Hook 仅覆盖当前页面主世界；独立 Worker、iframe 和安装前已创建的实例不在本阶段能力内。若直播消息实际走这些路径，保留证据并重新设计，不猜测或强行接管。

## 权限边界

- 维持当前 `@match`、`@grant`、`@connect` 和 `sandbox: raw`；包版本继续 `0.10.10`，`userscript.publish=false`。不读取 Cookie、Token，不调用账号 API，不发弹幕、签到、关注或送礼。
- 现有“每日自动化”是独立功能；真实浏览器验收前确认它处于关闭状态，避免刷新页面触发已有账号流程。

## 测试与真实页面验收

1. 自动化验证页面原事件与字节完全透传、`onmessage` 和 `addEventListener` 仍可工作、`binaryType` 与出站 `send` 不变；覆盖匿名连接排除、非斗鱼连接、Blob/ArrayBuffer、坏包/大包、重复安装、页面重连、晚安装、清理及其他脚本后续接管构造器。
2. 执行 package 类型检查与仓库级 `pnpm validate && pnpm test && pnpm type-check && pnpm build`。
3. Chrome 当前用户配置中仅启用一个 `[DEV] 斗鱼网页增强（预览版）`。它通过本地 `@require file://.../userscripts/packages/douyu-web-enhancer/dist/douyu-web-enhancer.user.js` 读取最新构建。旧 `douyu WS hook`、`test ban socket` 与同功能正式脚本保持停用。DEV 代理版本 `300` 只隔离脚本身份；实际包版本仍 `0.10.10`。
4. 最新构建完成后刷新一个正常开播的数字房间，读取“复制诊断信息”中的 `page-socket-hook` 计数；观察右栏普通弹幕、自然出现的飘屏与礼物时，仅在相应样本真实出现的前提下核对计数。检查页面仍正常播放和展示、不重复注入；再刷新和自然换房，核对新连接。没有自然礼物样本就标为未覆盖。
5. 开发代理首次安装需要用户在 Chrome Tampermonkey 中开启文件网址访问，并根据终端给出的本地安装链接安装一次。后续修改只需等 `built` 后刷新，不重复安装。安装或权限变更遵循仓库规则，在实际操作前请用户确认。
