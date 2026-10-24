import { SETTING_GROUPS } from "./settings.js";
import { PLAYER_PREFERENCES } from "./player-preferences.js";

const STATUS_TEXT = { running: "正在应用", waiting: "等待播放器", done: "已检查", unavailable: "尚未确认，可重试", idle: "" };

export function createSettingsPanel({ document, window, settingsStore, preferences, retry, registerMenuCommand } = {}) {
  const host = document.createElement("div");
  host.dataset.douyinLiveOptimizerPanel = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;inset:0;z-index:2147483647;font:14px/1.5 system-ui,sans-serif;color:#edf0f7}
      :host([hidden]){display:none!important}*{box-sizing:border-box}button,input,select{font:inherit}
      .mask{position:absolute;inset:0;background:#0009;display:grid;place-items:center;padding:20px}
      .panel{width:420px;max-width:100%;max-height:85vh;overflow:auto;background:#20232b;border:1px solid #424754;border-radius:12px;box-shadow:0 16px 64px #0008}
      header{position:sticky;top:0;background:#20232b;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #383d48}
      h1{font-size:17px;margin:0}h2{font-size:13px;color:#aeb6c9;margin:16px 0 8px}main{padding:0 20px 16px}
      label{display:flex;gap:14px;justify-content:space-between;align-items:center;padding:10px 0;cursor:pointer}
      .text{flex:1}small{display:block;color:#aeb6c9;font-size:12px;margin-top:3px}input{accent-color:#fa537d;width:18px;height:18px;flex-shrink:0}
      button{color:inherit;background:#333946;border:1px solid #515b6c;border-radius:6px;padding:6px 10px;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #fa537d;outline-offset:3px}
      footer{padding:12px 20px;border-top:1px solid #383d48}footer p{font-size:12px;color:#aeb6c9;margin:8px 0 0}
      .status{color:#e2b76f}.close{font-size:18px;padding:2px 9px}
      select{max-width:150px;color:inherit;background:#333946;border:1px solid #515b6c;border-radius:6px;padding:6px}select:focus-visible{outline:2px solid #fa537d;outline-offset:3px}.saved{color:#8fd8be}
    </style>
    <div class="mask"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title">
      <header><h1 id="title">抖音直播优化</h1><button class="close" aria-label="关闭设置">×</button></header>
      <main></main><footer><button class="retry">重新检查当前播放器</button><p class="storage"></p><p>记忆模式保存原生控件的选择，进房时恢复；固定模式保持指定状态；不接管交给平台。同域标签共享设置。</p><p class="entry"></p></footer>
    </section></div>`;
  const controls = new Map();
  const groups = SETTING_GROUPS.map((group) => ({ ...group, items: [...group.items] }));
  if (preferences) {
    groups.find((group) => group.name === "弹幕").items.push({ key: "danmakuEnabled", label: "画面弹幕" });
    groups.push({ name: "布局状态", items: [
      { key: "webFullscreen", label: "网页全屏" }, { key: "chatCollapsed", label: "右侧聊天栏" },
    ] });
  }
  for (const group of groups) {
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    shadow.querySelector("main").append(heading);
    for (const item of group.items) {
      const row = document.createElement("label");
      const text = document.createElement("span");
      text.className = "text";
      const policy = preferences && PLAYER_PREFERENCES[item.key];
      text.textContent = policy?.label || item.label;
      if (item.hint && !policy) {
        const hint = document.createElement("small");
        hint.textContent = item.hint;
        text.append(hint);
      }
      const status = document.createElement("small");
      status.className = "status";
      status.setAttribute("aria-live", "polite");
      text.append(status);
      const input = document.createElement(policy ? "select" : "input");
      const saved = document.createElement("small");
      saved.className = "saved";
      if (policy) {
        input.setAttribute("aria-label", policy.label + "模式");
        for (const [value, label] of [["remember", "记住上次状态"], ["on", policy.on], ["off", policy.off], ["unmanaged", "不接管"]]) {
          if (!label) continue;
          const option = document.createElement("option"); option.value = value; option.textContent = label; input.append(option);
        }
        input.addEventListener("change", () => preferences.setMode(item.key, input.value));
        text.append(saved);
      } else {
        input.type = "checkbox";
        input.addEventListener("change", () => settingsStore.set(item.key, input.checked));
      }
      row.append(text, input);
      shadow.querySelector("main").append(row);
      controls.set(item.key, { input, status, saved, policy });
    }
  }
  function render() {
    const values = settingsStore.get();
    controls.forEach(({ input, saved, policy }, key) => {
      if (policy) {
        const record = preferences.get(key); input.value = record.mode;
        saved.textContent = record.mode === "remember" ? describeState(key, record.state) : "";
      } else input.checked = values[key];
    });
    shadow.querySelector(".storage").textContent = settingsStore.isPersisted() && (!preferences || preferences.isPersisted())
      ? "修改立即保存；屏蔽操作可能需要等待播放器就绪。" : "本地存储不可用：本次设置只对当前页面有效。";
  }
  let previousFocus;
  let destroyed = false;
  function mount() {
    const fullscreen = document.fullscreenElement;
    const target = (fullscreen?.tagName !== "VIDEO" && fullscreen) || document.body || document.documentElement;
    if (host.parentElement !== target) target.append(host);
  }
  async function open() {
    if (destroyed) return;
    if (host.hidden) previousFocus = document.activeElement;
    // Native video fullscreen cannot render a DOM panel inside the video.
    // Exit only in response to the user's explicit settings-open action.
    if (document.fullscreenElement?.tagName === "VIDEO") {
      try { await document.exitFullscreen(); }
      catch { console.warn("userscript: douyin settings require leaving native video fullscreen"); return; }
    }
    if (destroyed) return;
    mount();
    render();
    host.hidden = false;
    shadow.querySelector(".close").focus();
  }
  function close() { host.hidden = true; previousFocus?.focus?.(); }
  host.hidden = true;
  mount();
  shadow.querySelector(".close").addEventListener("click", close);
  shadow.querySelector(".mask").addEventListener("click", (event) => { if (event.target.className === "mask") close(); });
  shadow.querySelector(".retry").addEventListener("click", retry);
  const keyboard = (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyO") { event.preventDefault(); host.hidden ? open() : close(); }
    if (host.hidden) return;
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const focusable = [...shadow.querySelectorAll("button,input,select")];
      const current = focusable.indexOf(shadow.activeElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    }
  };
  window.addEventListener("keydown", keyboard, true);
  document.addEventListener("fullscreenchange", mount);
  const unsubscribe = settingsStore.subscribe(render);
  const unsubscribePreferences = preferences?.subscribe(render);
  let menuRegistered = false;
  if (registerMenuCommand) {
    try {
      registerMenuCommand("抖音直播优化 · 设置", open, { id: "douyin-live-optimizer:settings" });
      menuRegistered = true;
    } catch (error) {
      // A menu API failure must not interrupt player automation or its teardown.
      console.warn("userscript: douyin settings menu unavailable", error?.name || "Error");
    }
  }
  shadow.querySelector(".entry").textContent = menuRegistered
    ? "可从油猴菜单打开；快捷键 Alt + Shift + O。"
    : registerMenuCommand ? "油猴菜单注册失败；可用 Alt + Shift + O 打开设置。"
      : "开发预览：Alt + Shift + O 打开。油猴菜单入口待权限确认。";
  render();
  return {
    open,
    setStatus(key, status) { const control = controls.get(key); if (control) control.status.textContent = STATUS_TEXT[status] || ""; },
    setMethod(key, method) {
      const control = controls.get(key);
      if (control) control.input.dataset.method = method || "";
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      unsubscribePreferences?.();
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("fullscreenchange", mount);
      host.remove();
    },
  };
}

function describeState(key, state) {
  if (state === null) return "尚未记忆；首次读取到状态后保存。";
  if (key === "audio") return `已记忆：${state.muted ? "静音，" : ""}音量 ${Math.round(state.volume * 100)}%`;
  if (key === "quality") return `已记忆：${({ origin: "原画", uhd: "蓝光", hd: "超清", sd: "高清", ld: "标清", auto: "自动" })[state]}`;
  if (key === "danmakuFilters") return `已记忆：送礼${state.gift ? "显示" : "隐藏"}，福袋${state.lucky ? "显示" : "隐藏"}`;
  if (key === "chatCollapsed") return `已记忆：${state ? "收起" : "展开"}`;
  if (key === "giftEffects") return `已记忆：${state ? "屏蔽" : "显示"}`;
  return `已记忆：${state ? "开启" : "关闭"}`;
}
