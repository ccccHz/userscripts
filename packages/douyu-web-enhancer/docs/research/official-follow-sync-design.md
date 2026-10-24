# 官方关注列表 → 本机 Socket 关注（实现中，首次导入待确认）

## 2026-10-01 只读证据

- 按用户约定使用内置 Browser；固定站内信调研页保留。另开用户提供的公开关注页作页面请求样本，不切换外部 Chrome。
- 页面真实 GET：`https://yuba.douyu.com/wbapi/web/user/followList/<safe_uid>?page=1&limit=20`。
- 电棍公开样本返回 `status_code=200`、`data.forbidden=0`、`count_page=13`、`is_end=0`，首页 20 项。每项含数字 `uid`、`nickname`、`safe_uid`，无需逐人再请求主页映射 UID。
- GET `/wgapi/yubanc/api/user/getCenterInfo` 实测返回当前登录账号数字 UID、safe_uid 和昵称；与运行时 acf_uid 核对，再分页读取自身 followList。最新 DEV 在固定站内信页成功完整读取 124 位。网页封禁没有阻止本次 API 查询，无需移动端回退；失败仍不得解释为空列表。
- 已完成自身列表完整分页，只生成预览，未确认导入、开启同步、修改官方关注或发送消息。无新增权限：yuba 域名已在现有查询范围。

## 建议体验

在“消息处理 → 关注用户”增加折叠的“同步斗鱼关注”区域，默认关闭，包含同步开关、立即检查、上次成功时间、来源账号、人数与失败状态。第一次检查只读并显示新增/移除/重叠预览，用户确认后本机生效。

开启后首次进入页面检查缓存；距上次尝试超过 24 小时才自动同步一次（失败也计入冷却）。多页共享锁防止重复同步，不做逐房间轮询。仍可手动立即检查。同步不创建其他直播间连接，只观察已访问页面的原生 Socket。

## 已实现的来源、取消与失败边界

- 用数字 UID 合并展示，保存“手动关注”和“当前账号官方同步”两个独立来源。现有 uids 迁移为手动来源，历史保持。
- 官方取关仅移除同步来源；重叠用户因手动来源继续生效。在增强面板点击“取消增强关注”移除手动来源，并将同步来源记入按账号隔离的排除名单，确保真正停用且避免同步后重新出现；提供恢复同步入口。
- 关闭同步暂停同步来源，保留名单、排除项和历史；手动来源继续按原有开关运行。全局发言/进场/礼物记录与提醒配置继续复用，首次同步预览明确提示现有提醒状态。
- 账号切换不把上一账号名单应用给新账号；身份确认失败暂停同步来源，保留旧缓存。官方身份仅运行时核对，不记录登录凭据。
- 全部分页成功、结构和 UID 合法且完整性通过后再提交快照。失败、封禁、验证码、超时或缺页均不覆盖上次成功名单；不将失败/未知响应解释为全部取关。空列表及大量移除提供预览确认。
- 官方同步快照最多 5000 人、250 页，超限保留原快照并提示；手动来源保持原有 500 人上限，分开持久化。面板每次展示 50 人，可加载更多，不静默截断导入。
- 昵称以最新同步或自然消息更新，历史保留每条事件当时的房间与行为；提醒是当前已访问房间的事件，不代表跨平台后台追踪。

## 实施与验收顺序

1. 在内置 Browser 确认当前账号身份来源和自身 followList 只读响应；若官方拒绝则停止并说明，不能因移动端能查看就假设 Web API 可用。
2. 用固定样本测试多页合并、重复 UID、手动重叠、排除、官方取关、关闭/重开、切账号、分页失败原子保留、超限和已有 v1 状态迁移。
3. 最新 dist 验收检查 → 差异预览 → 确认 → 刷新保留；不改变官方关注状态。外部 Chrome 仅做最后兼容性验收，不重复 API 调研。

## 2026-10-01 当前验证

- 来源合并、账号隔离、排除恢复、分页失败保留、首次/空名单/大量移除预览、跨页锁与 24 小时失败冷却均有回归测试。
- 全仓 validate、264/264 测试、type-check、build 通过；429.27 kB / gzip 110.50 kB。一次旧调度器实时计时测试波动，复跑全仓通过；未改该调度器。
- 最新 dist → 刷新内置 Browser 固定站内信页 → 检查关注列表，展示新增 124、移除 0、重叠 0、排除 0。首次确认导入、启用、刷新持久化与外部 Chrome 最终兼容性仍待执行。版本 0.10.10，publish=false。

## 2026-10-01：隐私样本及主播列表对照

- 内置 Browser 观察两个用户提供的真实样本 `ajwmlGzJY7g6`、`JGdyQZokX8dX`，页面均显示“TA已设置关注列表不可见”。各自 followList 首页 HTTP 200、status_code 200、forbidden 1、list 空；服务端有权限判断，不能将其解释为真实空列表。未尝试绕过。
- `/room/follow` 首屏直接输出主播房间卡片，20 条/页、5 页；`/directory/myFollow` 官方 JS 的列表调用为 GET `/wgapi/livenc/liveweb/follow/list`，参数 page/sort/cid1；分组也是房间列表。
- 原生页面 Network 与 JS 检查未发现普通用户关注列表接口。直接导航已知 JSON URL 被浏览器 ERR_BLOCKED_BY_CLIENT 阻止，不能当作业务失败。使用临时 development mode 只读按钮和已授权 GM 请求完成对照，随后移除源码并恢复普通构建，不保留账号数据或凭据日志。
- 自身鱼吧 followList 全分页 124 项；liveweb/follow/list 返回 98 房间、pageCount 1，room_id/nickname/status 等字段，不含用户 UID。按昵称对照 98 项全部匹配，鱼吧另外 26 项（包括已注销项）；这是昵称对照，不能声称逐 UID 验证或把所有额外项都认定为普通用户。
- 已有 getCenterInfo（无目标账号参数）可以核对登录者，再读取其 followList；当前账号已成功。尚未验证“本人关闭对外展示后本人查询”，未擅自修改隐私设置，也不能用两个他人样本推断本人访问权限。
- 有限公开检索发现历史源码沿用房间 follow/list，以及早期鱼吧 followList；未找到经过当前实测、与 public followList 独立且包含普通用户的本人专用 API。不能据此声称不存在其他 Web API。当前需求无需移动端抓包；只有当前入口失效或本人隐私限制阻断时，再评估移动端线索。

## 2026-10-01：鱼吧首页与官方 JS 确认

- 内置 Browser 首页关注数字链接指向当前用户 `/member/<safe_uid>/focus/follow`。3763gs4um4atl.js 用 hashUid 生成链接、followUserNum 渲染计数。
- 1snb_93c4sgo4.js 的 getUserFullInfo 调用 GET /wgapi/yubanc/api/user/getCenterInfo，safe_uid 映射 hashUid、follow_count 映射 followUserNum。数字不等于完整名单。
- 点击本账号关注入口，页面显示“该用户由于涉嫌违规已经被封禁”；仍能加载列表模块 0zlwsk8gvsrjn.js。其中 getMemberFollowsList({page,limit,uid}) 明确 GET /wbapi/web/user/followList/<uid>，默认 page=1、limit=20，映射数字 uid、safe_uid、nickname；forbidden 分支显示“TA已设置关注列表不可见”。
- 当前实现沿用官方入口，先前自身完整分页成功 124 项是独立 API 实测证据；不需要正常账号才能定位接口。首页动态流不是完整名单。此次无需切换账号或配置移动抓包。临时关闭的 HTTP 缓存已恢复，无账号设置变更。

## 2026-10-01：登录与纯匿名对照

同一内置浏览器 DEV 请求适配器、相同 URL，分别使用正常会话和 `GM_xmlhttpRequest` 的 `anonymous: true`。未注销或修改现有登录状态。匿名身份接口返回 error=901、“请提供token”，无身份字段，确认匿名请求未携带有效登录凭据。

| 目标 | 登录请求 | 纯匿名请求 |
| --- | --- | --- |
| `/wgapi/yubanc/api/user/getCenterInfo` | HTTP 200，error=0，有当前身份 | HTTP 200，error=901，请提供token，无身份 |
| 本账号 `/wbapi/web/user/followList/<safe_uid>?page=1&limit=20` | HTTP 200，status_code=200，forbidden=0，首批20条，共7页 | HTTP 200，status_code=4250，未登录 |
| 公开样本 `5JjAL6g5QwXr` 同一列表接口 | HTTP 200，status_code=200，forbidden=0，首批20条，共13页 | HTTP 200，status_code=4250，未登录 |
| 隐藏样本 `ajwmlGzJY7g6` 同一列表接口 | HTTP 200，status_code=200，forbidden=1，0条 | HTTP 200，status_code=4250，未登录 |
| 隐藏样本 `JGdyQZokX8dX` 同一列表接口 | HTTP 200，status_code=200，forbidden=1，0条 | HTTP 200，status_code=4250，未登录 |

结论修正：接口要求登录；登录后仍执行目标用户的关注列表可见性检查。此前本账号完整124条的成功只证明当前账户及当前状态可读、包含主播列表以外的条目。尚未确认本账号是否关闭对外展示，也未测试“已关闭展示的账号以本人身份请求”这一组合，因此不能宣称已解决关闭展示情况下的本人读取。safe_uid 是目标标识，不是授权凭据。对照只读，未写入关注名单；临时 DEV 入口测试后移除。

## 2026-10-01：切换新账号后的官方页面对照

用户明确允许本次改用外部 Chrome，使用现有登录态，通过官方页面触发请求并读取 CDP Network 响应，无 DEV 临时入口、无账号设置或关注写入。

- getCenterInfo：HTTP 200，error=0，存在本人身份，follow_count=1。
- 本人 followList：HTTP 200，status_code=200，forbidden=0，list=1，count_page=1，is_end=1；页面唯一关注条目为电棍。
- 公开样本电棍：HTTP 200，status_code=200，forbidden=0，首批20条，13页。
- 隐藏样本A与B：均 HTTP 200，status_code=200，forbidden=1，list=0，count_page=0；页面提示关注列表不可见。

新账号当前有效且可读取自己的完整1条列表，仍不能读取他人的隐藏列表。本账号对外展示开关尚未确认，因此此结果仍不能证明关闭展示后本人读取的例外。此次未做导入或同步，没有更改任何账号隐私设置。

## 2026-10-01：新账号读取原账号的关键对照

此前未测这一项，本次补齐。外部 Chrome 当前新账号身份由 getCenterInfo 再次核对，error=0、身份与刚才的新账号匹配、follow_count=1。对原账号 followList 第一页执行同源 credentials=include 单次只读 GET，返回 HTTP 200、status_code=200、forbidden=1、list=0、count_page=0。原账号主页另显示封禁提示；API 的 forbidden 结果不依赖该页面提示。

结合此前原账号本人登录时完整读取124条：原账号本人可读，新账号作为他人不可读。原账号对他人的列表访问确实被禁止，不能再说仅未确认他人可见性。但 forbidden 结果本身不区分手动隐藏与账号封禁的其他访问限制，尚不能仅据此断言隐私开关具体选项；并非绕过别人列表权限。未更改隐私设置、账号关注或本机同步名单。

## 2026-10-01：用户确认关闭设置并切换公开后的复测

用户确认原账号此前关注列表展示为关闭状态，然后自行打开并要求复测。外部 Chrome 新账号身份再次核对成功。相同原账号 followList 接口在新账号 credentials=include、cache=no-store 请求下，7页全部 HTTP 200、status_code=200、forbidden=0，分页数量20/20/20/20/20/20/4，共124条。credentials=omit 的第一页面请求仍 HTTP 200、status_code=4250、“未登录”。

结合此前关闭状态的本人124条成功、他人 forbidden=1，以及现在公开状态下他人124条成功：本账号展示开关对其他登录账号访问生效；关闭不阻止本人读取；公开仍要求访问者登录。原账号封禁状态的页面限制不等同于这个列表API的读取权限。隐私开关由用户操作，代理只执行只读请求，未同步或持久化原始关注名单。
