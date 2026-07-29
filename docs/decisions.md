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

## D011：`userscripts/` 使用独立 git 仓库记录版本

**日期：** 2026-06-30

**决策：** 在 `userscripts/` 内初始化独立 git 仓库，并以 commit 记录迁移和重构节点。

**原因：** 外层目录不是统一 git 仓库，而多个旧项目本身各自带有 `.git`。独立仓库可以只记录新的 userscript 工作区，避免把旧项目、实验目录和第三方参考仓库混进同一段历史，也方便未来按 commit 回退。

## D012：`auto-fans-continue` 组合参考两个斗鱼实现

**日期：** 2026-06-30

**决策：** 续牌核心参考 `douyuEX_new` 的手动续牌逻辑，自动每日执行和剩余礼物策略参考 `douyuEx_meta` 的 `DailyAuto` 模块。

**原因：** `douyuEX_new` 的手动续牌功能用户测试更多，且已经包含先查背包、优先 `268`、兜底 `2358` 的逻辑；`douyuEx_meta` 则保留了每日自动运行、每个牌子送 1 个、剩余送 `12306` 的策略。组合两者可以保留自动化目标，同时减少送礼核心逻辑的未知风险。

## D013：`auto-fans-continue` 的失败标记策略

**日期：** 2026-06-30

**决策：** 背包为空、没有可用荧光棒、未找到粉丝牌房间时，不写入 `Ex_DailyAuto_LastTime`；一旦已经生成并执行赠送计划，则写入当天状态，避免刷新页面后重复赠送。

**原因：** 斗鱼每日荧光棒可能需要进入直播间后才会到账。预检失败时不标记，可以给脚本稍后重试机会；已经开始送礼后标记，则更能避免重复消耗背包道具。

## D014：当前阶段优先最小可用和跨机器同步

**日期：** 2026-07-04

**决策：** 当前 userscript 迁移阶段不优先做复杂后台化、浏览器扩展或可视化；先保证最小可用版本，并优先把 Tampermonkey 中仍在用且依赖 `file://` 本地文件的脚本迁移为 git 管理的 package。

**原因：** 用户的直接目标是迁移到其他机器后仍能同步和更新脚本。`file://` 依赖强绑定本机路径，是当前跨机器迁移的主要障碍；先把这些脚本纳入 git 管理，可以用统一构建、版本和安装产物解决路径分散问题。

## D015：浏览器扩展和 Bark 推送作为未来升级方向

**日期：** 2026-07-04

**决策：** `auto-fans-continue` 未来可以评估升级为浏览器扩展：使用扩展后台静默执行、通过授权域名 cookie 调用斗鱼接口，并将执行结果推送到 Bark；当前只记录方向，不进入最小可用版本范围。

**原因：** 扩展方案能减少手动打开网页的要求，也能用 Bark 替代复杂可视化。但它会引入扩展权限、后台定时、cookie 访问、推送配置和错误恢复等新复杂度。现阶段先保持 userscript 版本可用，等基础迁移稳定后再评估升级。

## D016：测试阶段不默认赠送剩余荧光棒

**日期：** 2026-07-05

**决策：** `auto-fans-continue` 当前默认策略只给每个粉丝牌直播间赠送 1 个荧光棒，不再默认把剩余荧光棒赠送给 `12306`。

**原因：** 当前还处于 Tampermonkey 和斗鱼页面验证阶段。只送每个直播间 1 个能减少单次测试消耗，方便多次刷新、清理每日状态后重复验证。剩余全送策略暂时保留为可恢复方向，等最小可用版本稳定后再评估是否重新启用。

## D017：斗鱼 API 验证阶段只在 `www.douyu.com` 下运行

**日期：** 2026-07-05

**决策：** `auto-fans-continue` 的 `@match` 暂时收窄为 `https://www.douyu.com/*`，斗鱼 API 请求不再使用 `mode: "no-cors"`。

**原因：** 开发版验证时，背包接口在 `res.json()` 处抛出 `Unexpected end of input`。根因是 `no-cors` 请求模式会让响应 body 不可读或为空，而脚本需要读取 JSON。收窄到 `www.douyu.com` 后，脚本在同源页面中调用 `www.douyu.com` 接口，可以读取 JSON 响应，也能避免从其他斗鱼子域名跨源请求时触发 CORS 问题。

## D018：斗鱼页面日志不只依赖 `console.log`

**日期：** 2026-07-05

**决策：** `auto-fans-continue` 使用 `@run-at document-start` 尽早启动；真正的主流程仍延后到 `DOMContentLoaded` 后执行。日志优先使用 Tampermonkey 的 `GM_log`，再 fallback 到提前绑定的 console 方法，并将运行事件写入 `window.__chzAutoFansContinue`。

**原因：** 斗鱼页面环境中 `console.log` 可能被页面代码影响，导致用户看不到带 `chz_script` 前缀的输出，或者只看到异常的 `undefined`。`GM_log` 由 userscript 管理器提供，不依赖页面重写后的 console，更适合作为斗鱼页面的主日志通道；同时暴露 `window.__chzAutoFansContinue.lastEvent` 和 `events`，即使 DevTools 输出被污染，也可以确认脚本是否启动、最后停在哪个阶段。

## D019：剩余荧光棒全送策略延后到最终部署

**日期：** 2026-07-04

**决策：** 当前测试版继续保持默认策略：每个粉丝牌直播间赠送 1 个荧光棒，不自动赠送剩余荧光棒。`createRenewalPlan` 保留 `sendRest: true` 显式开关，最终部署前再切回“剩余全部送给默认房间 `12306`”。

**原因：** 用户的意思是最终上线前恢复原有自动续牌逻辑，而不是现在就放进测试版本。当前还要继续做 toast、并发赠送和浏览器侧验证；暂不默认赠送剩余可以降低测试消耗，也方便反复刷新验证。

## D020：使用本地轻量 toast 和有限并发赠送

**日期：** 2026-07-04

**决策：** `auto-fans-continue` 增加本地轻量 toast/notifier，不直接迁入旧 `NoticeJs` 库；赠送请求从完全串行改为默认最多 4 个并发。toast 显示启动、每个直播间赠送结果、预检失败、执行完成和执行错误；“今天已经执行过”只写 logger，不弹 toast。

**原因：** 旧 `NoticeJs` 能满足提示需求，但引入整套库会增加当前最小 userscript 的体积和维护边界。当前需求只需要轻量提示，用本地实现更容易维护。每个直播间的赠送结果弹 toast，便于人工观察测试；“今天已经执行过”属于低价值重复提示，保留在 logger 即可。并发数选择 4，是为了缩短 20 多个直播间时的执行时间，同时避免全量并发对斗鱼接口造成过高压力。

## D021：恢复剩余荧光棒全送默认策略

**日期：** 2026-07-05

**决策：** `auto-fans-continue` 默认策略恢复为：每个粉丝牌直播间赠送 1 个荧光棒，剩余荧光棒全部赠送给默认房间 `12306`。`createRenewalPlan` 仍保留 `sendRest: false` 作为显式关闭开关。

**原因：** console 日志、toast、并发赠送和每日失败重试边界已经完成验证，最小可用版本可以回到原有每日自动策略。默认房间号目前继续使用旧逻辑里的 `12306`；未来再补充 GM 菜单或页面内 UI，让用户可以配置这个房间号。

## D022：剩余全送必须在续牌批次之后执行

**日期：** 2026-07-06

**决策：** `auto-fans-continue` 的续牌赠送仍保持有限并发；但“剩余全送”不再进入同一个并发队列，而是在所有粉丝牌房间赠送请求结束后单独执行。只有至少一个赠送成功时，才写入当天已执行状态。

**原因：** 剩余全送的数量是基于“每个粉丝牌房间已经消耗 1 个荧光棒”计算出来的。如果它和最后几笔续牌请求并发发送，就会用未来库存推导出的数量去竞争当前库存，容易导致斗鱼接口批量失败。全失败时不标记当天已执行，可以让用户修复登录态、接口状态或库存时机后再次触发。

## D023：toast 支持全屏挂载和 hover 暂停

**日期：** 2026-07-06

**决策：** `auto-fans-continue` 继续使用本地轻量 toast，不迁入 `NoticeJs`。toast root 每次显示时都会重新挂载到 `document.fullscreenElement ?? document.body`，并监听 `fullscreenchange`；单条 toast 的自动消失计时器在鼠标 hover 时暂停，移出后继续。

**原因：** `douyuex` 使用的 `NoticeJs` 提供了 hover 暂停和进度条，但仍是挂到 `document.body` 的普通 fixed 容器。斗鱼播放器或网页全屏会改变可见顶层容器，单纯调高 `z-index` 不一定可靠。保留本地实现并补全 fullscreen host 迁移，可以减少依赖，同时解决当前直播画面偶尔压住 toast 的问题。

## D024：常用小型 `@require` 依赖本地化为共享模块

**日期：** 2026-07-08

**决策：** 对体积小、常用、且已经被多个自用脚本依赖的 `MSCSTSTS-TOOLS.js`，不再继续作为远程 `@require` 保留，而是迁移为 `userscripts/shared/mscststs.js`，由需要的 package 通过 ESM import 引入。

**原因：** `douyin-live-optimizer` 在 dev 调试中出现 `ReferenceError: mscststs is not defined`，说明迁移后的 Vite 模块源码继续依赖 Tampermonkey 外部全局会让开发链路不稳定。`MSCSTSTS-TOOLS.js` 只有 `sleep`、`wait` 和 `hijackXMLHttpRequest` 三类能力，体积小且在抖音、快手、小红书等脚本中重复出现，放在本地共享模块更利于跨机器同步、测试和后续复用。

## D025：开发服务使用单端口路径式 gateway

**日期：** 2026-07-12

**状态：** 已由 D028 取代。

**决策：** 保持“每个 userscript 一个 package、一个内部 Vite worker”的结构，
但 Tampermonkey 统一通过 `127.0.0.1:5173/<package>/` 访问。根目录 `pnpm dev`
启动 gateway、内部 worker 和 HTTP/WebSocket 代理；worker 就绪后自动打开选中 package
的安装页。

**原因：** `vite-plugin-monkey` 把安装、entry 和 pull 路由固定在 Vite server 根路径，
多个实例不能直接共享一个 server。仅固定多个端口虽然能阻止漂移，但仍会把 worker 端口
暴露给 Tampermonkey。gateway 将插件路由和 Vite HMR WebSocket 按 package path 隔离，
使外部安装地址只依赖一个固定端口；内部端口仅作为实现细节。

## D026：通过 GitHub Pages 分发生产版 userscript

**日期：** 2026-07-11

**决策：** 使用 `ccccHz/userscripts` 保存源码；push 到 `main` 后由 GitHub Actions
执行验证、构建并部署到 `https://ccccHz.github.io/userscripts/`。每个 package 同时生成
`.user.js` 和 `.meta.js`，分别作为 `@downloadURL` 和 `@updateURL`。metadata 版本统一读取
package 的 `package.json`。

**原因：** 本地 `dist/` 适合开发检查，但不能提供跨机器稳定更新。Pages URL 固定，
`.meta.js` 可以降低版本检查开销；以 `package.json` 为唯一版本来源，可以避免 metadata
版本和 package 版本不一致。保留原 `@namespace`，确保已安装脚本不会因发布迁移被识别为
另一个脚本。

## D027：迁移包只保留可移植和可远程更新的脚本

**日期：** 2026-07-15

**决策：** 清理后的 Tampermonkey 导入 ZIP 包含两类脚本：本工作区已完成 dev 验证的
6 个生产构建版本，以及原导出包中已启用且已有第三方远程更新来源的 8 个脚本。
尚未迁移的 `file://` 脚本、空实现、测试脚本和停用/失效脚本不进入迁移包。

**原因：** 新浏览器导入包的目标是开箱可用并能继续远程更新。保留本地绝对路径会让脚本
在另一台机器失效；混入测试和停用脚本也会重新引入已整理掉的噪声。对 6 个自有脚本，
保留原导出 UUID、storage 和位置设置，同时启用更新检查并将 `file_url` 对齐到正式
GitHub Pages `@downloadURL`。

## D027：开发版统一拉取本地单文件 bundle

**日期：** 2026-07-13

**状态：** 已由 D028 取代。

**决策：** dev gateway 不再把 Vite ES module 作为外链脚本插入目标页面。`pnpm dev`
改为使用 Vite watch 持续生成单文件 bundle；开发版 loader 通过
`GM_xmlhttpRequest` 拉取 bundle，在 userscript sandbox 中执行，并在 bundle 变化时刷新页面。
`GM_xmlhttpRequest` 和 `@connect 127.0.0.1` 只加入开发版安装响应，package 配置和生产构建
保持原权限。

**原因：** `vite-plugin-monkey` 默认通过页面原生 `script[type="module"]` 加载 dev
entry。快手、虎牙、NGA、Wikipedia 等页面可能通过 Content Security Policy 禁止加载
`127.0.0.1`，表现为脚本标签存在但入口、日志和 HMR 都不执行。实测 `GM_addElement`
仍不能稳定绕过这类限制，因此改为由 Tampermonkey 主动请求构建产物；代价是源码变化时
使用整页刷新而不是 Vite HMR，但开发链路不再依赖站点 CSP，也不需要维护站点黑名单。

## D028：开发版回归官方单 package Vite serve

**日期：** 2026-07-14

**决策：** 每个 package 的 `dev` 命令直接执行 `vite`，同一时间只启动一个 userscript。
根目录 `pnpm dev -- <package-name>` 仅作为单 package 选择器，不再承担 HTTP gateway、
构建 watch、loader 生成或代码执行。开发期使用 `vite-plugin-monkey` 原生安装页和 HMR；
受目标站点 CSP 阻止时，由开发者自行启用官方文档建议的 `Disable-CSP` 扩展。

**原因：** 日常调试通常只专注一个脚本，同时运行所有 package 增加了端口、残留进程和
安装页管理成本。官方模式链路更短，保留完整 Vite HMR，也避免长期维护
`GM_xmlhttpRequest`、`eval`、bundle hash 轮询和整页刷新等自定义运行时。代价是开发时
需要临时放宽目标站点 CSP；该扩展只应在开发期间、并尽量限定到正在调试的站点。

## D029：单 package 开发统一从 5173 起自动顺延

**日期：** 2026-07-15

**决策：** 所有 package 的 Vite dev server 都以 `localhost:5173` 为默认地址，不设置
`strictPort`。如果 5173 已被占用，使用 Vite 默认行为自动尝试 5174、5175 等后续端口。

**原因：** 当前开发方式一次只专注一个 userscript，为每个 package 永久分配不同端口
没有实际收益。统一默认端口能让绝大多数开发安装地址保持稳定；偶尔存在残留服务时，
自动顺延又比直接启动失败更方便，终端仍会明确显示本次实际端口。

**2026-07-19 补充：** host 从 `127.0.0.1` 改为 `localhost`。斗鱼当前 CSP 已明确允许
`http://localhost:*`，但不允许 `http://127.0.0.1:*`；使用 `localhost` 可以让
`vite-plugin-monkey` 的开发入口直接命中站点白名单。Chromium 的本地/环回网络访问权限仍需
由用户对目标站点单独授权，这与 CSP 是两层不同的浏览器限制。

## D030：`auto-fans-continue` 增加运行中锁防止重复注入并发执行

**日期：** 2026-07-19

**决策：** `auto-fans-continue` 在每日状态 `Ex_DailyAuto_LastTime` 之外，增加
`localStorage` 运行中锁 `Ex_DailyAuto_RunningLock`。脚本开始执行前先尝试获取锁；
如果已有未过期锁，本次触发直接跳过。锁在流程结束时释放，并设置 10 分钟过期时间兜底
页面关闭、脚本异常或浏览器中断导致的残留锁。

**原因：** 浏览器验证中发现“每个直播间送一次”的流程可能执行两遍，连“剩余全部赠送”
也出现重复调用。这说明问题更像是同一页面被 Tampermonkey 注入了两份同功能脚本，例如
开发版、生产版或旧 `file://` 中转脚本同时启用，而不是赠送计划内部重复。每日完成标记
只会在成功后写入，无法阻止两个实例在完成前同时开始；运行中锁用于防御这种并发入口。
预检失败时仍不写入每日完成标记，后续打开斗鱼页面仍可再次尝试。

## D031：`auto-fans-continue` 使用三层防重复执行

**日期：** 2026-07-19

**决策：** 在现有 `localStorage` 运行中锁之外，为 `auto-fans-continue` 增加两层前置防护：
userscript metadata 声明 `@noframes`，避免 Tampermonkey 向匹配地址的 iframe 注入；脚本入口在
共享的 `unsafeWindow.__chzAutoFansContinueStarted` 上同步记录当前 document 已启动，重复入口不再
注册 `DOMContentLoaded` 回调。`localStorage` 锁继续保留为最后兜底。

**原因：** 用户确认 Tampermonkey 中只启用了一个同功能脚本，因此重复执行仍可能来自同源 iframe
注入，或同一 document 生命周期内的重复入口。`@noframes` 直接消除 iframe 注入来源；页面标记处理
同一 document 内的重复启动；运行中锁覆盖不同 document、页面实例或前两层失效时的并发。三层职责
不同，且赠送礼物属于不可逆操作，保留最后的存储锁是合理的防御措施。

## D032：房间连接与自动领取回退分层实现

**日期：** 2026-07-28

**决策：** 将带当前浏览器登录态的斗鱼房间连接实现为独立模块：从斗鱼页面可见 Cookie
提取 `acf_username`、`acf_ltkid`、`acf_biz`、`acf_stk`、`acf_ct`，连接
`wss://wsproxy.douyu.com:6672` 并发送签名 `loginreq`；收到有效 `loginres` 后发送
`h5ckreq`，以 `h5ckres` 作为进房完成信号并立即断开。开发期曾用 GM 菜单提供独立
测试入口，实机验证完成后移除；现有的剩余赠送房间配置同时作为 Socket 连接目标。

自动续牌流程不在每次运行时无条件建立 socket。只有首次背包查询为空或找不到荧光棒时，
才调用房间连接模块；连接成功后按 0.5、1、1.5、2、3、4 秒退避轮询背包，以背包接口
实际返回荧光棒作为到账完成条件，再继续原有赠送计划。如果登录态不完整、握手失败或轮询
结束后仍无荧光棒，则不标记当天已执行，保留以后重试机会。

**原因：** 正常情况下背包已有道具，无需额外连接；问题只发生在用户当天尚未进入任何
直播间、却先打开斗鱼其他页面时。独立协议层便于单测和手动验证，回退层则只处理领取时机，
不会侵入现有赠送和防重复逻辑。旧 `Douyu-node` 与 2026 年仍在维护的
`tophtab/douyu-keep-just-works` 均使用相同的 `wsproxy loginreq -> h5ckreq` 链路，
说明该协议仍有现实可用性。2026-07-29 当前账号实机确认该连接能够触发领取，同时确认
`h5ckres` 仅能作为房间请求完成信号，不能保证背包接口已经同步到账。
