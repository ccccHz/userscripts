# DouyuEx 功能迁移清单

`features.json` 是迁移范围的事实来源，不代表承诺复制旧项目全部功能。每项功能先确认
用户价值和旧行为，再决定重写、合并、延后或放弃。

状态含义：

- `inventory`：已登记，尚未设计。
- `planned`：范围和优先级已确认。
- `implementing`：正在实现。
- `verifying`：代码完成，等待真实页面验证。
- `done`：实现和真实页面验证均完成。
- `deferred`：有价值但当前不做。
- `rejected`：明确不迁移，并记录原因。

优先级从 `P0` 到 `P3`。涉及账号请求、反检测或外部网络的功能必须先完成单独风险评估，
不能因为旧项目存在对应代码就直接迁移。

当前已冻结、可直接执行的专项契约：

- [直播时移控制](live-timeshift-controls-contract.md)
- [自动最高画质](highest-quality-contract.md)
- [弹幕右键缺失操作补全](message-context-action-fallback-contract.md)
