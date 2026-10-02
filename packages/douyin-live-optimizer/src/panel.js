import { SETTING_GROUPS } from "./settings.js";

const STATUS_TEXT = { running: "正在应用", waiting: "等待播放器", done: "已检查", unavailable: "尚未确认，可重试", idle: "" };

export function createSettingsPanel({ document, window, settingsStore, retry, registerMenuCommand } = {}) {
  const host = document.createElement("div");
  host.dataset.douyinLiveOptimizerPanel = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;inset:0;z-index:2147483647;font:14px/1.5 system-ui,sans-serif;color:#edf0f7}
      :host([hidden]){display:none!important}*{box-sizing:border-box}button,input{font:inherit}
      .mask{position:absolute;inset:0;background:#0009;display:grid;place-items:center;padding:20px}
      .panel{width:420px;max-width:100%;max-height:85vh;overflow:auto;background:#20232b;border:1px solid #424754;border-radius:12px;box-shadow:0 16px 64px #0008}
      header{position:sticky;top:0;background:#20232b;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #383d48}
      h1{font-size:17px;margin:0}h2{font-size:13px;color:#aeb6c9;margin:16px 0 8px}main{padding:0 20px 16px}
      label{display:flex;gap:14px;justify-content:space-between;align-items:center;padding:10px 0;cursor:pointer}
      .text{flex:1}small{display:block;color:#aeb6c9;font-size:12px;margin-top:3px}input{accent-color:#fa537d;width:18px;height:18px;flex-shrink:0}
      button{color:inherit;background:#333946;border:1px solid #515b6c;border-radius:6px;padding:6px 10px;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #fa537d;outline-offset:3px}
      footer{padding:12px 20px;border-top:1px solid #383d48}footer p{font-size:12px;color:#aeb6c9;margin:8px 0 0}
      .status{color:#e2b76f}.close{font-size:18px;padding:2px 9px}
    </style>
    <div class="mask"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title">
      <header><h1 id="title">抖音直播优化</h1><button class="close" aria-label="关闭设置">×</button></header>
      <main></main><footer><button class="retry">重新检查当前播放器</button><p class="storage"></p><p>设置按当前域名保存。画质和声音关闭后保留当前状态。</p><p class="entry"></p></footer>
    </section></div>`;
  const controls = new Map();
  for (const group of SETTING_GROUPS) {
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    shadow.querySelector("main").append(heading);
    for (const item of group.items) {
      const row = document.createElement("label");
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = item.label;
      if (item.hint) {
        const hint = document.createElement("small");
        hint.textContent = item.hint;
        text.append(hint);
      }
      const status = document.createElement("small");
      status.className = "status";
      status.setAttribute("aria-live", "polite");
      text.append(status);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => settingsStore.set(item.key, input.checked));
      row.append(text, input);
      shadow.querySelector("main").append(row);
      controls.set(item.key, { input, status });
    }
  }
  function render() {
    const values = settingsStore.get();
    controls.forEach(({ input }, key) => { input.checked = values[key]; });
    shadow.querySelector(".storage").textContent = settingsStore.isPersisted()
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
      const focusable = [...shadow.querySelectorAll("button,input")];
      const current = focusable.indexOf(shadow.activeElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && current === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    }
  };
  window.addEventListener("keydown", keyboard, true);
  document.addEventListener("fullscreenchange", mount);
  const unsubscribe = settingsStore.subscribe(render);
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
    destroy() {
      destroyed = true;
      unsubscribe();
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("fullscreenchange", mount);
      host.remove();
    },
  };
}
