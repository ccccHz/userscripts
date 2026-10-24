# 特殊弹幕背景屏蔽调研

## 2026-10-18：后续过滤优先级

用户决定：飘屏头图和特殊背景的 Socket 层过滤先只保留证据与设计记录，降低实现优先级。现有已验证的普通头图 DOM 样式开关继续独立工作；没有同一条原始消息与最终图像节点的逐条配对前，不按 `nail`、`dcsid` 或其它候选字段删除整条弹幕。新样本继续用于核实字段，不扩大现有过滤范围。

最后更新：2026-10-18

后续多类型飘屏样本采集参考 [瞬态 DOM 采集指南](../transient-dom-capture.md)，
优先观察新增弹幕并即时保存，避免消失后才查询。

## 目标与边界

本次只读采集当前斗鱼播放器特殊背景弹幕的 DOM、class、图片层、伪元素和
computed style，不注入屏蔽样式，不修改页面或功能代码。用户已确认未来入口放在脚本默认控制
中心，不融入斗鱼原生屏蔽面板。

2026-09-27 用户补充决定：**暂停实现，P1 高优先级补充自然样本**。当时单条样本不足以
证明不同背景下头像、表情、图片正文和钻粉彩字均不会误伤。下文实现建议仅为待验证方案，
不代表已批准按当前样本直接开发。

2026-10-03 用户认可继续推进头部清理；本轮获取多个自然头图、渐变彩字、正文表情后，
只实现已核实的普通 scroll 头图层。特殊背景皮肤仍待自然样本，不合并到此开关。

## 2026-10-03：普通飘屏头部图像契约

内置 Browser 房间 1126960 的原生飘屏原来关闭；通过原生底部弹幕按钮开启后捕获自然样本。
当前普通飘屏实际位于 `#__h5player .danmu-fbb2a3`，并非 `#comment-higher-container`。

```html
<div class="danmuItem-a8616a scroll-c8a9ee" data-comment-uuid="…">
  <img class="headpic-e5b098" src="PUBLIC_DECORATION_ASSET">
  <div class="text-da6396" style="margin-left:6px">
    <div class="textWrap-f7cfb9">TEXT</div>
    <div class="afterpic-e66834"></div>
  </div>
</div>
```

自然头图资产包含 `dygev/2024/12/19/97fd72b967a4ebdf7aa5fabb04c8f49f.png`
（与用户截图相同）、2026/07/23、2026/09/21、2026/09/22 的多种资产。
普通正文无头图；渐变彩字在 `.text-da6396.barrage-gradient` 上使用线性渐变；正文
表情则在 `.textWrap-f7cfb9` 内的 `.EmotImageWrapPe-* > img.EmotImagePe-*`。
不保存自然正文、昵称、UID、消息 ID 或头像 URL。

当前官方 firstqueue_325852d.js 的 scroll renderer 明确由 `extraData.leftPic`、
`dcallPic`、`jhsPic` 生成直接 `.headpic-*` 图片；正文表情由独立 renderEmotText 生成。
这证明可以在渲染层隐藏独立头图，不需要修改 Socket 消息或按用户身份过滤。

冻结实现：独立默认关闭的 `floatingHeadCleanup` Settings v6 开关，面板“弹幕”页入口；
静态 CSS 限定播放器、danmu-* 宿主、直接 data-comment-uuid 行和直接 headpic-* img。
同时移除该行文字层头图的 6px 左间距。无 observer 或轮询，不改颜色、渐变、text-shadow、
正文表情、聊天栏、增强关注或原包。关闭恢复尚在页面中的图像，刷新保留选择。
贵族背景 head/tail、用户头像及 PlayerCustomBarrage-prefixPlugin 仍待自然配对，本版不处理。

## 采集环境

| 项目 | 记录 |
| --- | --- |
| 页面 | `https://www.douyu.com/52`，普通直播页 |
| 时间 | 2026-09-27 |
| 浏览器 | Codex `@Browser`，已登录，Full CDP 只读采集 |
| 样本 | 一条当时可见的贵族/活动特殊背景弹幕 |
| 页面主题 | Dark Reader 正在运行；computed text color 受其影响，背景资产及 DOM 为该环境下实测，未做停用主题的对照 |
| DEV 构建 | 未运行：页面无 `#douyu-web-enhancer-control-center`、`dwe-*` 标记或 localhost/127.0.0.1 资源；因此本次不做脚本验收 |
| 操作边界 | 未发送弹幕、签到、关注、送礼、修改账号或删除数据 |

## 实际 DOM

正文已省略，用 `TEXT` 表示；个人头像 URL 不写入仓库。

```html
<div class="danmuItem-a8616a noble-d35c82" data-comment-uuid="…">
  <img class="super-user-icon-f04849" style="opacity: 0; margin-top: 9px">
  <img class="super-noble-icon-eb79c7" src="…/351a34….webp" style="margin-left: -46px">
  <div
    class="super-text-f60bfa customBarrage"
    style="color: rgb(255,255,255); text-shadow: …; background-image: url(…/fe1cd2….png); height: 47px; padding-top: 6px"
  >
    <div
      style="width: 100%; height: 52px; position: absolute; top: 1px; left: 0;
             pointer-events: none; background: url(…/f4e178….webp) 0 0 / 65px 52px repeat-x"
    ></div>
    TEXT
    <div class="afterpic-e66834" style="margin-top: 7px; margin-left: -1px"></div>
  </div>
  <img class="super-tail-b436b7" src="…/a8d8cd….webp">
</div>
```

所有背景资产均来自 `sta-op.douyucdn.cn/dygev/2026/09/22/`：

- `.super-text-f60bfa.customBarrage` 的内联 `background-image` 是 PNG 中心层；
- 其直接子 `div` 使用另一张 WebP 做 `repeat-x` 重复背景；
- `.super-noble-icon-eb79c7` 是左侧贵族/活动装饰图；
- `.super-tail-b436b7` 是右侧收尾装饰图；
- `.super-user-icon-f04849` 是用户头像层，本样本中 `opacity:0`，不能因为它是 `img` 就当作背景删除；
- `.afterpic-e66834` 本样本的 computed background 为 `none`，暂无证据需要处理。

## computed style

| 节点 | 尺寸 | 关键值 |
| --- | --- | --- |
| `.danmuItem-a8616a.noble-d35c82` | 约 `602.66 × 53px` | `position:absolute`; `background-image:none`; `border-radius:21px`; `opacity:1`; `visibility:visible`; `z-index:999` 来自内联样式 |
| `.super-noble-icon-eb79c7` | 约 `58.99 × 52px` | `display:inline-block`; 图片本体是左侧装饰 |
| `.super-text-f60bfa.customBarrage` | 约 `521.68 × 47px` | `position:relative`; `display:inline-block`; `background-image:url(...png)`; `background-size:auto 52px`; 白字+紫色多层 `text-shadow` |
| `.customBarrage > div[style*="background"]` | 约 `521.68 × 52px` | `position:absolute`; `pointer-events:none`; `background-image:url(...webp)`; `background-size:65px 52px`; `repeat-x` |
| `.super-tail-b436b7` | 约 `25.99 × 52px` | `display:inline-block`; 图片本体是右侧收尾装饰 |

样本内所有节点的 `::before` / `::after` 均没有背景图。外层 `::after` 存在空 `content:""`，
但 computed background 为 `none`；其余伪元素的 `content` 为 `none` 或空值。因此当前样本不需要靠全局
`::before/::after` 规则清除背景。

## 与归档 Git 历史的对照

归档原仓库从 2024-03-29 开始实现此功能，后续至少经历了下列类型的修正：

- 2024-03-31：避免误屏蔽钻粉炫彩弹幕；
- 2024-07-29：更换 `danmuItem-*` / `super-text-*` 哈希 class，并修复“直接隐藏整条弹幕”的误伤；
- 2024-08-04 至 08-10：补贵族背景、`customBarrage` 和子背景层；
- 2025-06-20 至 06-30：再次切换哈希 class，新增 `PlayerCustomBarrage-prefixPlugin--text`；
- 2025-08-28 / 09-04：为图片前缀扩大规则后又因误伤钻粉彩字回退；
- 2025-11-25：更新到 `danmuItem-a8616a`、`super-text-f60bfa`、`noble-d35c82`。

2026-09-27 的实机样本仍使用这三个 2025-11 class，但装饰图的资产 URL 和额外图片 class
由当期活动动态下发。结论是：精确哈希 class 并非每次都变，但原版“对所有后代 `div/img`
一刀切”会随新背景类型和新内容层产生误伤，仍需维护。

## 推荐的最窄实现

1. 将规则限定到 `#comment-higher-container > [data-comment-uuid]`，不对全页 `div` / `img` 生效。
2. 使用语义 class 前缀和结构组合，例如 `.customBarrage`、`[class^="super-text-"]`、
   `[class^="super-noble-icon-"]` 和 `[class^="super-tail-"]`；精确哈希只作已知样本证据，不作唯一依赖。
3. 对文字层只清除 `background` / `background-image`；只隐藏已证明是左右背景收边的
   `super-noble-icon-*` / `super-tail-*`，不再隐藏任意头像、表情或正文图片。
4. 保留文字 `color` 和 `text-shadow`，因为它们不是背景，且移除后可能降低浅色画面上的可读性。
5. 开关状态只由设置 schema 所有；runtime 注入/移除一个命名 style，不需要 MutationObserver。
6. 诊断记录当前页命中的特殊文字层、子背景层和左右装饰层数量；“开关已开”不代表
   “当期背景已覆盖”。

这种做法不能消除斗鱼新增完全不同渲染器时的更新需求，但能把维护从“追每个哈希并冒险隐藏
所有后代”降为“为新的语义背景层增加一条有样本的规则”。基于当时的单条 DOM 样本，优先考虑
渲染层处理；2026-10-02 的官方 JS 调研补充了 Socket 字段与皮肤配置的关联，尚不能排除
Socket 层方案。需要自然样本配对后比较两种方案的影响范围。

## 2026-10-02：头部装饰与活动尾部的追加调研

范围：用户截图中飘屏的钻粉/活动头部，以及右侧聊天栏的“合成大西瓜 / 保卫鱼娘 查看活动>”。
仅采样和读取官方 JS、公开配置，不增加屏蔽功能。内置浏览器房间 `12306` 的飘屏宿主存在但
没有弹幕节点；有界观察期间也未捕获新的“查看活动”聊天行，因此本轮没有完成截图目标与
原始 Socket 包的逐条配对。读取到的包不代表完整流量：早期批次存在事件缓冲截断、重复连接消息。
未保存正文、昵称、UID、消息 ID、头像、Cookie 或完整原始包。

### 官方 JS 直接证据

来源为当前页面加载的官方资源：

- [播放器 firstqueue_325852d.js](https://shark2.douyucdn.cn/front-publish/live_player-master/js/firstqueue_325852d.js)
- [聊天栏 BarrageGroup_c8d2c66_de2a94c.js](https://shark2.douyucdn.cn/front-publish/live-next-player-aside-master/js/BarrageGroup_c8d2c66_de2a94c.js)
- [活动模板 comm_chatmsg_w.json](https://wconf.douyucdn.cn/resource/common/comm_chatmsg_w.json)：匿名只读 GET 返回 HTTP 200。

| 区域 | 已确认的生成路径 | 证据边界 |
| --- | --- | --- |
| 飘屏皮肤 | 消息 `fid` 对应 `anchorRightConfig.list`；`dcsid` 对应 `barrageSkinConfig.property_info`；`nail` 也能选取 `property_type=42` 的配置。配置生成 head/center/tail、颜色、描边和动画层 | 证明 Socket 字段可参与皮肤选择，不证明截图两个小头部都走这些分支 |
| 飘屏前缀 | 格式化参数 `prefixImg` 写入 `extraData.leftPic`；钻粉皮肤另有 `PlayerCustomBarrage-prefixPlugin`，其中还包含头像和文字 | 必须区分前缀图、头像、完整皮肤，不能统一删除图片；截图资产未在 JS 中硬编码 |
| 普通聊天附加后缀 | `getBarrageSuffix` 用消息 `adid` 查询 `dfansDanmuSuffixLinkMap`；输出 `.js-barrage-suffix`，`data-btype` 来自配置 `rnType` | 是一条独立后缀路径，不能直接认定截图活动属于它 |
| 活动模板消息 | `handleCommChatmsg` 在 `bizType=comm_chatmsg` 时按 `commChatMsg.gbtemp` 选模板，并检查 `btype` 的 Web 开关及 `range`；另一分支按 `gadid` 选模板并检查有效期 | 原始 Socket 到 `bizType/commChatMsg` 的转换及截图实际字段仍待配对 |
| 活动尾部节点 | 模板内容 `vType=2` 使用正文；`sType=2` 输出 `.js-barrage-activity-link` 的 span，点击通过 `common.push` 打开内部页面；`sType=3` 才生成真正的 `a href` | 看起来像链接的尾部不一定是超链接，不能只检查 `a` 元素 |

公开配置中的模板 `48` 包含两个片段：正文（`vType=2, sType=0`）和“查看活动>”
（`vType=0, sType=2`）。其内部命令为 `_dyRn_DYRNWatermelon2607_openH5_subType1`。
模板 `29` 的相同尾部使用 `_dyRn_DYRNTowerGame2606_openH5_subType1`；尚未证明它就是
截图中的“保卫鱼娘”。其他多个模板也使用相同尾部文字，不能按尾部文字推断活动类型。

Socket 候选样本曾观察到 `ct=42, diaf=1, dfgm=1, hl=1, cdiaf=1` 同时存在；这只是钻粉
相关候选组合，没有 DOM 配对，不能把 `ct=42` 或 `diaf=1` 单独作为屏蔽条件。

### 后续采样与实现判断

1. 对同一自然事件保留短时内存中的原始字段、聊天行和飘屏节点，用消息 ID（存在时）及时间配对；
   文档只保留脱敏字段结构。不要用人工发送活动弹幕制造样本。
2. 为“只隐藏头部装饰”“只隐藏活动尾部”“隐藏整条活动推广消息”分别建立样本与行为契约，
   它们对普通正文和增强关注记录的影响不同。
3. 优先验证结构/模板标记；不按活动正文关键词、用户钻粉身份或所有 `img/a` 一刀切。
4. Socket 方案需要证明字段修改不会影响右栏正文、表情、关注记录和其他装饰；DOM 方案需要证明
   隐藏目标节点后正文宽度与运动不异常。当前证据不足以批准其中任一方案直接实现。

本轮只更新研究文档，版本仍为 `0.10.10`，没有重建或声明功能验收通过。

## 2026-10-02：活动尾部已有样本，先推进隐藏入口

用户明确要求长期采样继续运行，并用已有证据逐步推进功能。本轮先实现右侧聊天栏的
“隐藏活动入口”，默认关闭；只隐藏两个已核实活动的“查看活动>”，保留正文。
隐藏整条推广消息和飘屏头部仍是独立范围，未合并进入这个开关。

### 自然消息、配置和 DOM 的对应

首次扫描运行中多房归档的 7776 个保存包，找到 18 条 `gadid=29` 和 23 条 `gadid=48`
的自然 `chatmsg`，分别含“保卫鱼娘”和“合成大西瓜”。这是保存样本的阶段快照，不是
完整收包计数；未观察到这些包含正数 `adid`。不在文档保存身份字段或完整原包。
本轮公开模板快照 SHA-256 为
`60be1f4abcc0db7b770924d3f3929fa59d3096ca41e7a05d755930635a32898b`。

| 模板 | 正文片段 | 活动尾部 `data-btype` |
| --- | --- | --- |
| `29` | `vType=2, sType=0, value=txt` | `_dyRn_DYRNTowerGame2606_openH5_subType1` |
| `48` | `vType=2, sType=0, value=txt` | `_dyRn_DYRNWatermelon2607_openH5_subType1` |

两者尾部均为 `vType=0, sType=2, value=查看活动>`，有效时间范围为
`0..2145888000`，Web 版本为 `1`。尾部由模板追加，不在自然消息的正文中。
内置 Browser 房间 `12306` 实际观察到相同正文及内部命令的自然聊天行：
`.Barrage-list .Barrage-listItem .js-barrage-activity-link[data-btype]`。
尾部为独立 `span`，普通显示为 `inline`。钻粉聊天容器也出现过合并异常的正文类名，
因此选择器不要求额外的 `.Barrage-content`，不按用户身份判断。

这证明“自然包 → 官方模板 → 对应活动 DOM”三层语义一致。聊天行的 `id` 是页面生成的
UUID，未证明与 Socket `cid` 相同；短时 CDP 批次存在缓冲截断，本轮没有声称同一消息 ID
逐条配对通过，也不把空批次当作目标消息不存在。

### 实现与核心验收

- `activity-link-cleanup.ts` 只为两个精确内部命令注册静态 CSS，由 Settings v6 的
  `features.activityLinkCleanup` 派生；缺失字段默认 `false`，旧导出也按此值导入。
  控制中心“弹幕”页提供独立开关，关闭移除样式。没有 observer、轮询或新增网络请求。
- 保留活动正文、普通弹幕、未知活动、普通链接、头像/表情、飘屏及 Socket 原消息。
  关注记录、提醒、弹幕速度仍接收原始消息；不按“查看活动”文字或活动正文关键词屏蔽。
- 最新 `dist` 刷新内置 Browser 房间 `12306` 后，开关初始为关闭；自然“保卫鱼娘”
  和“合成大西瓜”的尾部均实测开启变为 `none`、正文仍为 `inline`，关闭后同一行尾部
  恢复 `inline` 且正文相同。刷新后开关仍开启，新产生的两个活动尾部也隐藏。
- 一个样式实例、停用后零实例。验收结束恢复原来的右侧入口及新功能关闭状态。
  截图 `/tmp/dwe-activity-link-iab-20261002.png` 记录最新实际页面与开启状态。
- 全仓 validate、285/285 测试、type-check、build 通过，产物 439.59 kB / gzip 112.79 kB。
  版本保持 `0.10.10`、`publish=false`，未扩大权限、安装、发布或执行账号动作。
- 尚未实测浏览器原生全屏、网页全屏及未知活动的自然对照；钻粉异常类名在实现前有自然
  DOM 证据，但未在最新构建单独触发复验。上述缺口不扩大到所有活动/特效的完成声明。

## 2026-10-02：整条活动屏蔽与隐藏统计

本节替代上一阶段的“只隐藏尾部、保留正文”体验。用户明确要求开启后屏蔽整条活动弹幕；
开关仍默认关闭，内部 `activity-link-cleanup` / `activityLinkCleanup` 标识保持兼容。

- Socket 自然包的 `gadid=29/48` 对应官方模板 29/48；页面处理仍是 CSS，未过滤或改写 Socket。
  `.Barrage-list .Barrage-listItem:has(...)` 只匹配已确认尾部的两个精确 `data-btype`：
  `_dyRn_DYRNTowerGame2606_openH5_subType1` 和 `_dyRn_DYRNWatermelon2607_openH5_subType1`。
  因而即使正文类名有异常，也可由尾部命令找到整行；普通人手打同样活动名不会因此被屏蔽。
- CSS 管隐藏，共享 ObserverHub 仅做计数。开启时已有的目标行也计入；当前页保留最近 2000 个
  房间号/行 UUID 去重键，无 UUID 时用 WeakSet。反复开关和近期同 ID 重建不重复加数；
  刷新产生新 UUID 的聊天行重新计数。这是“实际隐藏的聊天行数”，不是去重 Socket 消息数。
- `ActivityCleanupStats` 只在独立 IndexedDB 保存房间号、累计数与最后隐藏时间，没有正文、UID
  或昵称。一秒批量合并，事务累加避免多标签写入覆盖；停用不清历史，页面隐藏时尝试 flush。
  抽屉显示本房间、累计、最近时间，并折叠按房间详情；内存读取最近 100 个房间及本房间，
  较早房间聚合保留在磁盘。其他标签新增统计在本页下一次保存或刷新时读入，非实时跨标签广播。
- 最新 dist 在内置 Browser `71415` 的自然两类活动上验证：整条 li 为 `none`，叶子尾部仍为
  `inline`；关闭整行恢复 `list-item`，样式实例归零，重新开启同一行不加数。普通行继续显示。
- `12306` 新文档及同页刷新验证：本房间 0、累计由 66 增至 70（另一房间仍有自然消息）；详情
  对应 `71415`，时间为 10/2/26 21:39。证明按房间区分及刷新读取，未伪造计数样本。
  截图 `/tmp/dwe-activity-whole-iab-20261002.png`；验收后恢复原关闭状态。
- 统计写入后的快照读取也在同一事务内完成；读取失败回滚增量，重试不重复累计。故障注入回归通过。
  修正后的实际构建刷新 `71415` 读取 70，自然保卫鱼娘新增后保存为 71；再刷新累计 72，
  无存储错误。最终截图更新为 `71415` 的 72 条 / 最近 10/2/26 22:02；结束仍恢复关闭。
- 全仓 291/291 测试、validate、type-check、build 通过，0.10.10 / publish=false。
  网页全屏、浏览器全屏、未知活动自然对照及 Socket cid 与页面 UUID 的逐条配对仍未覆盖；
  不据此宣称所有活动或飘屏装饰都已屏蔽。

## 背景功能待验证

- 开关的控制中心交互、刷新持久化与停用恢复；
- 本样本移除中心背景和左右收边后，正文仍可读且尺寸/运动轨迹不异常；
- 普通弹幕、钻粉彩字、表情/图片正文、非贵族 `customBarrage` 和其他活动背景无误伤；
- 斗鱼如改用 canvas、Shadow DOM 或不同宿主，需新样本后再增规则，不预先扩大选择器。

## 2026-10-16：普通头图能否改为 Socket 识别

本轮只核对原理和样本，未改变飘屏过滤。当前“隐藏飘屏头部图像”仍是静态 CSS，直接隐藏普通 scroll 行的 `headpic-*` 图片，保留正文、渐变字与表情。特殊背景、头像及 `PlayerCustomBarrage-prefixPlugin` 仍不在此规则中。

重新扫描 2026-10-02 两份本地多房归档的 124 个分卷，得到 42,587 条 `chatmsg` 保存记录；其中 435 条含 `dcsid`（本批仅一个不同值），10,281 条含 `nail`（292 个不同值），没有 `fid` 字段。扫描结果是归档的保存记录，不是全站分布或独立用户数；不保留正文、UID、昵称或原包。本批字段存在并不证明这些消息最终在飘屏中出现头图。官方 JS 能从 `fid`、`dcsid`、`nail` 选择部分皮肤配置，并将格式化后的 `prefixImg` 放入 `extraData.leftPic`；`dcallPic`、`jhsPic` 也可生成普通 `headpic-*`。其中 `extraData` 属于渲染结果，不能假设它原样存在于 `chatmsg`。

**判断：Socket 层按已知字段识别部分皮肤有可行性，尚无证据可完整替代 DOM 头图清理。** 需要同一自然弹幕的原始 `chatmsg`、官方配置、最终 `headpic-*` 或头像／背景节点逐条配对，确认哪些是消息字段直接决定、哪些由房间配置或用户状态补充。不能单凭 `nail`、`dcsid`、`ct=42`、`diaf=1` 或活动文字屏蔽整条消息；那会把正文也一起删掉。若未来改用 Socket，须先验证改写或过滤仅影响目标装饰，并保持聊天栏、关注记录和表情不变。
