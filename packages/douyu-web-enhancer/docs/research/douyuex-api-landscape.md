# DouyuEx 接口研究与对比

审计日期：2026-09-05。范围：归档 `archive/douyuEx-2026.06.03.01/source`、工作区斗鱼相关 package，以及公开仓库/公开文档。只读研究；未读取 Cookie/Token，未操作账号，未执行账号写入。

## 结论摘要

DouyuEx 的研究深度在“页面逆向 + 用户脚本集成”上较深，在“稳定、可验证的公共 API 契约”上较弱。它同时覆盖页面内 HTTP、真实流鉴权、未登录/登录弹幕 WebSocket、DOM/脚本/响应 Hook 和大量账号动作；但很多接口是站点内部接口、活动接口或第三方聚合服务，不能按官方长期 API 处理。

当前 userscript 的 `room-metrics` 已把两个时间字段分开处理：`show_time` 只表示当前房间开播时间戳，`todayWatch` 只表示当前账号的今日观看累计秒数；二者均为斗鱼页面接口，礼物金额则来自第三方 `doseeing`，不能混为“斗鱼统计接口”。

## `show_time` 与 `todayWatch`

| 展示 | 请求与来源 | 语义/单位 | 登录依赖与边界 | 证据等级 |
| --- | --- | --- | --- | --- |
| 已播 | `GET https://www.douyu.com/swf_api/h5room/{rid}`；斗鱼 Web 页面内部接口 | `data.show_time` 为 Unix 秒时间戳；脚本用“当前 Unix 秒 - show_time”格式化时长；`show_status == 2` 时显示 0 | 归档用页面 `fetch` + `credentials: include`；公开样本显示未登录可拿到房间状态。换房应按新 rid 重新取；下播后旧 `show_time` 不能继续当作当前场次计时 | 归档事实；公开历史项目也记录 `show_time` 为房间状态字段 |
| 已观看 | `GET https://www.douyu.com/japi/interactnc/web/fsjk/getCardTaskInfo?rid={rid}`；斗鱼 Web 页面内部接口 | `data.todayWatch` 为秒数，表示账号当天观看累计；不是当前房间开播时长，也不是本地计时 | 归档使用 `credentials: include`；当前无 Cookie 样本返回 `error:1002`，因此通常需要斗鱼登录态。`error != 0` 应显示占位；跨自然日、登录态变化、换房均应重新取 | 归档事实 + 当前工作区验证记录 |

归档的旧逻辑每 5 秒在“已播/已观看”之间轮换，每 150 秒刷新房间信息；当前实现已改为独立文本、独立失败隔离和 150 秒刷新，并让“已播”在页面可见时本地刷新显示。当前仍待实机确认 SPA 换房、下播跳转和自然日切换。

一个重要边界：归档曾把 `todayWatch` 放进 `show_time` 的 tooltip，且未先判断错误码；迁移版已改为只有 `error:0` 才解析 `todayWatch`。这避免把登录错误或空数据伪装成观看时长。

## DouyuEx 已触及的接口面

### 页面内 HTTP / 页面状态

- 房间识别：从 HTML 中 `$ROOM.room_id`、`roomID`、canonical link 提取真实 rid。
- 房间状态与时间：`swf_api/h5room/{rid}`，读取 `show_time/show_status`。
- 观看任务：`japi/interactnc/web/fsjk/getCardTaskInfo`，读取 `todayWatch`。
- 关注、粉丝牌、背包、VIP、用户卡片、抽奖、Yuba、签到等多个 `www.douyu.com`、`member`、`yuba` 和活动路径；其中不少是登录态或已过期的内部接口。
- 视频页：流地址、回放弹幕、下载/ASS 导出相关 `v.douyu.com` 接口和签名参数。
- 页面状态：DOM 观察、CSS/StyleHook、脚本和 XHR/ResponseHook；这使它能适配站点内部状态，但也意味着哈希 class、请求形状和 CSP 改动会造成静默失效。

### WebSocket / 弹幕协议

归档包含登录与未登录的 Douyu WebSocket 封装、STT `key@=value/` 编解码、二进制包头、`loginreq`、`joingroup`、`mrkl` 心跳、`loginres` 和房间进组/退出处理；PIP/多房间功能还复用了实时流和弹幕连接。工作区 `auto-fans-continue` 进一步验证了 `wsproxy.douyu.com:6672` 的登录态连接，并使用 `acf_*` Cookie 构造登录消息。`douyuDM` 和 `Douyu-node` 则保存了 `chatmsg/uenter/rss/dgb/spbc/rankup` 等消息字段说明。

风险分级：未登录只读弹幕连接通常是网络只读，但会产生持续连接和站点可观测流量；登录 WebSocket 涉及 Cookie 派生鉴权、用户身份和房间权限，应视为账号级能力；弹幕发送、禁言、送礼不能因“同一条 WebSocket”而视为只读。

## 与公开项目的对比

| 项目 | 公开证据与优势 | DouyuEx 的相对位置 |
| --- | --- | --- |
| [flxxyz/douyudm](https://github.com/flxxyz/douyudm) | Node/浏览器 WebSocket 客户端、STT 序列化、消息事件、6 个弹幕端口重试和连接前失败处理；文档明确说明断开后不自动重连 | DouyuEx 页面集成面更广，但应吸收其“协议层独立、端口重试、明确重连边界”和测试化方向 |
| [v2wy/streamlink-plugin-for-douyu](https://github.com/v2wy/streamlink-plugin-for-douyu/blob/main/douyu.py) | 当前维护线索覆盖 HTML/`betard/{rid}` 房间状态、`show_status/videoLoop` 判定、`homeH5Enc`、`lapi/live/getH5Play` 和多码率流 | DouyuEx 已有真实流鉴权和音频/PIP，但缺少同等清晰的“直播/录播/下播/重试/缓存”边界说明 |
| [renmu123/douyu-video-cli](https://github.com/renmu123/douyu-video-cli) | 将 getH5Play 封装成可复用 API，适合回放/下载工具 | DouyuEx 有下载与弹幕导出实现，但应把视频页能力与直播页能力隔离，避免把一次性签名当长期接口 |
| [Birjemin/douyuapi](https://github.com/birjemin/douyuapi) | 公开列出房间、分类、直播流、弹幕和官方开发者 token 线；同时用勾选/警告区分完成与不稳定 | DouyuEx 缺少这种接口成熟度登记；其账号/活动请求应逐项标明证据和失效时间 |
| [yjqiang/danmu](https://github.com/yjqiang/danmu/blob/master/examples/douyu/ws_douyu_danmu_client.py) | 给出 `danmuproxy.douyu.com:8506`、`loginreq`、`joingroup`、45 秒心跳的独立客户端示例 | DouyuEx 协议覆盖更复杂，但端口、心跳和重连策略分散在功能代码中，难以单独回归 |

公开斗鱼开发者文档/历史实现可帮助解释字段和协议，但它们不是当前 Web 页面接口的稳定承诺；第三方 `doseeing` 聚合服务更不是斗鱼官方来源。报告不把公开仓库的“能请求到”升级为“可安全迁移”。

## 已有证据但 DouyuEx/本 userscript 尚未充分挖掘的能力

| 候选 | 级别 | 证据与价值 | 风险/阶段/授权 |
| --- | --- | --- | --- |
| 房间状态卡：`show_status`、`videoLoop`、标题/主播/分类、下播安全状态 | 只读网络 | streamlink 当前实现有明确判定；可改善换房和录播误判 | 低到中；M3/M5；无需账号写入授权，但需新增接口证据与失败测试 |
| 直播流解析的窄适配：画质列表、音频 URL、过期重取 | 只读网络 | DouyuEx 与 streamlink 均有 getH5Play/加密参数线索 | 中；M5；新增域名/权限前需用户确认，禁止默认下载或跨平台播放 |
| 未登录弹幕阅读/本地过滤 | 网络只读 + 本地 | `douyuDM`/`douyudm` 证明 STT 与事件字段可独立封装 | 中；M2/M6；不需要账号授权时优先只读，仍需限制连接数、心跳和清理 |
| 弹幕事件导出/本地收藏 | 本地优先 | 公开客户端支持事件流，归档已有收藏/导出方向 | 低；M2；明确聊天内容只落本地并给出清理入口 |
| 回放弹幕热度/导出 | 网络只读 + 本地文件 | 归档 `getBarrageListByPage`、视频下载器已有接口 | 中；M5；需要文件写入/大体积处理确认，不读取账号凭据 |
| 关注列表的“只看在播”与安全换房 | 登录态只读 | 归档 `follow/list` 与 `show_time` 过滤已有实现 | 中；M3；需要用户接受登录态只读请求，不附带关注/取消关注 |
| 背包/粉丝牌/VIP 信息增强 | 登录态只读 | 归档已有 `bag-info`、`fans-badge-date`、`room-vip-expiry` | 中；M3；逐项确认隐私和页面当前可用性 |
| 自动领取/送荧光棒、签到、禁言、回复、送礼 | 账号写入/自动化 | 归档、`auto-fans-continue` 和公开自动化项目均有实现线索 | 高；M6 独立评估；每个动作单独授权，默认不迁移、不自动执行 |

## 后续 TODO（不实现）

1. 为 `room-metrics` 补一份无敏感的自然样本矩阵：直播中、下播、换房、SPA 重建、未登录、跨日；只记录状态码/字段存在性/可见结果。
2. 将 `show_time`、`todayWatch`、`show_status/videoLoop` 的解析测试与来源日期纳入 feature contract；禁止用本地累计值替代 `todayWatch`。
3. 单独建立“直播流适配”研究卡，记录 `getEncryption/getH5PlayV1` 与公开 streamlink `getH5Play` 的差异、签名寿命和失败重取边界；不扩大 `@connect` 前先确认。
4. 若用户确实需要弹幕实时能力，先做未登录只读协议包：连接上限、心跳、断开清理、端口轮换和本地脱敏日志；不复用账号登录模块。
5. 对所有登录态只读接口标记隐私字段和登录错误码；对所有写入接口建立单独授权记录，禁止从“研究发现”直接进入迁移计划。

## 来源记录（访问日期：2026-09-05）

- 工作区归档与当前实现：`archive/douyuEx-2026.06.03.01/source`、`packages/douyu-web-enhancer/src/features/room-metrics.ts`、`packages/auto-fans-continue/src/douyu-socket.js`、`douyuDM/src/messageEvent.js`。
- [flxxyz/douyudm README](https://github.com/flxxyz/douyudm)：WebSocket/STT、端口重试和事件 API。
- [v2wy/streamlink-plugin-for-douyu](https://github.com/v2wy/streamlink-plugin-for-douyu/blob/main/douyu.py)：房间状态和 H5 流请求。
- [renmu123/douyu-video-cli](https://github.com/renmu123/douyu-video-cli)：视频 API 封装。
- [Birjemin/douyuapi](https://github.com/birjemin/douyuapi)：公开 API 能力清单。
- [yjqiang/danmu Douyu WebSocket example](https://github.com/yjqiang/danmu/blob/master/examples/douyu/ws_douyu_danmu_client.py)：弹幕端口、登录、进组和心跳示例。
- [manitozhang/DouYu MeApi](https://github.com/manitozhang/DouYu/blob/master/MeApi.md)：历史公开房间字段与开发者/移动端接口资料，仅作历史对照。
