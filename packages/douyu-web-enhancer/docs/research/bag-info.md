# 背包只读信息增强：调研与实施契约

日期：2026-09-27。用户确认优先推进；实现已落在独立 `bag-info` 分支，验证期间保持包版本 `0.10.10` 与 `userscript.publish=false`。

## 当前页面证据

在已登录 Codex `@Browser` 房间 52 打开原生背包，仅查看、悬停，未点击任何礼物使用/赠送。
本页无 enhancer DEV 标记，因此是原生调研，不构成新脚本验收。

- 入口：`#js-backpack-enter`。
- 外层：`#js-gift-expandPanel.BackpackExpandPanel.is-show`。
- 头部：`.BackpackExpandPanel-backpackHeader`，本次仅显示“我的背包”。
- 列表：`.BackpackExpandPanel-giftListWrap` → `.ToolBarBackpack-giftList`。
- 礼物项：`.ToolbarBackpack-giftItem`，带 `data-proptype`、`data-propid`、`data-index`。
- 子层为 `--name`、`--count`、`--flags`、`--hoverMask`；本次网格未展示常驻剩余期限或总价值/总亲密度。
- 存在 `is-disabled` 项，不能因为禁用就从背包统计中任意删掉。
- 悬停未获得与 `expiry` 相互验证的剩余期限文案；不能断言官方任何界面都不提供期限。

## 只读接口

归档 `ExpandTool/ExpandTool_ClearBag.js` 定义 `getBagGifts`，请求
`GET /japi/prop/backpack/web/v5?rid=<roomId>`。当前同源单次读取房间 52：HTTP 200、
`error:0`、`msg:success`，无需复制 Cookie 或扩大 userscript 权限。

返回 `data.list/totalNum/unlockLevel/validNum`；礼物含 `id/propType/count/expiry/met/price/intimate/isValuable`，
另有 `exp/batchInfo/priceType/description/description2/intro/devote` 等字段，功能只读取必要字段。
不将用户完整背包清单、账号标识或凭据写入仓库。

单位证据：归档将 `price` 除以 100；当前某礼物 `price:20` 与原生标价 `0.2 鱼翅` 一致，
但这只验证该样本的标价换算，不证明所有道具、币种或可兑现价值。
当前一次成功样本中 `isValuable` 仍以 0 为主；自动化用非零脱敏夹具覆盖统计，真实非零自然样本仍未覆盖，不能宣称价值统计已完成自然样本验收。
`expiry` 是剩余天数提示，不是 Unix 时间戳，不能复用归档 `expiry - 1`。
当前 API 样本的 `exp` 为 `0/1/2`；官方详情组件把它渲染为“经验+”，不是期限字段，不能按 Unix 秒解释。
精确期限字段是 `met`：官方组件将 `met` 乘 1000 后交给 `new Date`；`met=-1` 为“永久有效”。
`intimate` 汇总不应冒充带当期 BUFF 的实际到账收益。

### 2026-09-27 官方消费路径与最小脱敏样本

已登录内置 `@Browser` 房间 52 通过页面上下文只读调用一次同源接口，未读取或复制 Cookie、令牌或完整库存：

- 响应为 HTTP 200、`error:0`、`msg:"success"`，`totalNum:60`、`validNum:60`。
- 最小字段样本：`id=5/propType=2/count=1/exp=2/expiry=31/met=1793030649`；
  `id=23/propType=2/count=2/exp=1/expiry=18/met=1791956514`。
- `id=23` 的 `batchInfo` 仅含批量选项 `99/233/520/1314/6666`，每项只有 `batchNum/name`，没有 `exp/expiry/met`。
- `met` 示例按本地时区转换为 `2026-10-27 00:04:09`、`2026-10-14 13:41:54`；这与官方秒转毫秒路径一致。

官方公开包及关键消费代码：

- [`common_1e9102a.js`](https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/common_1e9102a.js)：`BackpackServices.returnExpireData` 使用 `new Date(e)`；`met` 由详情组件乘 `1000` 后传入。
- [`toolbar_0c1a0ae.js`](https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/toolbar_0c1a0ae.js)：`PropDataServices.reqPropList()` 读取 `/japi/prop/backpack/web/v5`，成功后只做图片字段兼容转换。
- [`BackpackWrap_7835162_1cfc218.js`](https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/BackpackWrap_7835162_1cfc218.js)：`expiry` 只在 1–7 天范围显示“今/明/N天”角标。
- [`popup_b8cba54_f858588.js`](https://shark2.douyucdn.cn/front-publish/live-next-master/js/room/popup_b8cba54_f858588.js)：详情读取 `met` 作为精确期限，读取 `exp` 作为“经验+”，`batchInfo` 作为数量选项。

## 归档行为与需要说明的调整

归档 `BagInfo/BagInfo.js` 在打开背包后读接口：

- 各项叠加 `expiry - 1` 的数字，无清晰单位；
- `isValuable == 1` 的项累计 `price × count / 100`，标为“总价值”；
- 全项累计 `intimate × count`，标为“总亲密度”；
- 同文件加入“清空背包”，实际调用赠送接口送出全部礼物，本轮明确不迁移。

建议保留只读核心，但在确认后做以下窄调整：

1. 用 `(propType,id)` 对应 DOM 的 `(data-proptype,data-propid)`，不按数组位置硬配；
   对重复同键/多批次须证明聚合规则，不能选第一个或猜测。
2. 期限优先使用 `met`：`-1` 永久、有效正数按 Unix 秒转本地日期；`<= now` 显示已到期；
   不足 1 小时/约 N 小时/约 N 天角标向上取整，悬浮显示准确本地日期。缺失/无效时只 fallback 到
   `expiry` 的今天/明天/N 天提示；不把 `exp` 当期限，也不把向上取整当完整剩余时间。
3. 头部保留“总价值/总亲密度”概念，说明价值计入条件和亲密度基础口径；数据不足显示未知而非假零。
4. 独立只读设置与可撤销追加节点，不覆写原头部 innerHTML，不影响原礼物操作。
5. 打开时按需单次获取、关闭只清理插件节点并复用当前房间缓存，重开不重复插入；失败保留原生背包，
   换房取消并丢弃旧响应；无常驻轮询，不刷新请求制造统计。

## 2026-09-27：最新构建真实页面验收

使用最新 `dist` 的 DEV 入口刷新已登录 `@Browser` 房间 `https://www.douyu.com/52`，控制中心显示 `v0.10.10`，并确认“背包只读信息”默认开启。打开原生背包后，头部显示“总价值：0.00 鱼翅 · 总亲密度：5”；悬浮提示说明价值按可计入道具的鱼翅单价与数量汇总，亲密度按道具标注数值汇总且不含活动加成。四个可见道具均显示由 `met` 转换出的精确中文日期，且与页面上下文只读接口样本一致。

随后在控制中心关闭该开关，状态变为“已停用”，关闭背包后重新打开不再注入摘要；恢复开关后再次打开，摘要和逐项期限重新出现。正常验证路径未点击“使用”、充值、关注或发送；但在一次使用过期 AX 索引打开控制中心的误触中，页面实际送出了 1 个“赞”，已停止继续页面操作并在验证记录中如实登记。截图仅作为本地验收证据，不写入仓库。

未覆盖：自然重复 `(propType,id)` 多批次、业务错误响应和空背包的真实异常页；这些路径已有自动化夹具或安全降级实现，仍保留为后续自然验证项。

## 待确认与执行路径

- UI：头部汇总 + 礼物项期限；控制中心独立开关，默认开启，沿用归档自动展示体验。
- 统计：只汇总 `isValuable==1` 的 `price*count/100` 并明确鱼翅口径；亲密度显示基础估算、不叠加未知 BUFF。
- 期限：以 `met` 为精确期限，`expiry` 仅作保守 fallback；`exp` 是经验值，永不进入期限计算。
- 映射：按 `(propType,id)` 匹配 DOM 的 `(data-proptype,data-propid)`；重复同键且期限不同则显示期限未知，
  不把某一条期限套给整项或各批次。
- 尚未发现背包增强的既有独立负责任务；本轮实现已由当前 `bag-info` 分支承接，未与简洁模式提示清理并行写入同一 checkout。
- 后续只需在自然出现异常数据或重复批次时补证据；不通过赠送礼物制造刷新样本，未覆盖类型保持待验证。
