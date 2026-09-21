export type NoticeType = "info" | "success" | "warning" | "error";

const TOAST_ROOT_ID = "douyu-web-enhancer-toast-root";
const TOAST_STYLE_ID = "douyu-web-enhancer-toast-style";
const TOAST_TYPES: Record<NoticeType, { title: string; color: string }> = {
  info: { title: "提示", color: "#2563eb" },
  success: { title: "完成", color: "#16a34a" },
  warning: { title: "注意", color: "#f97316" },
  error: { title: "失败", color: "#dc2626" },
};

function ensureStyle(document: Document): void {
  if (!document.head || document.getElementById(TOAST_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TOAST_STYLE_ID;
  style.textContent = `
#${TOAST_ROOT_ID} { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647 !important;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none; isolation: isolate; transform: translateZ(0); }
#${TOAST_ROOT_ID} .dwe-toast { width: min(360px, calc(100vw - 32px)); box-sizing: border-box;
  border-left: 4px solid var(--dwe-toast-color); border-radius: 6px; background: rgba(17, 24, 39, .96);
  color: #fff; box-shadow: 0 12px 32px rgba(0, 0, 0, .24); padding: 10px 12px;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; pointer-events: auto;
  transition: opacity 160ms ease, transform 160ms ease; }
#${TOAST_ROOT_ID} .dwe-toast.is-leaving { opacity: 0; transform: translateY(6px); }
#${TOAST_ROOT_ID} .dwe-toast-title { font-weight: 700; margin-bottom: 2px; }
#${TOAST_ROOT_ID} .dwe-toast-message { overflow-wrap: anywhere; }
`;
  document.head.appendChild(style);
}

function ensureRoot(document: Document): HTMLElement | null {
  const host = document.fullscreenElement ?? document.body;
  if (!host) return null;
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
  }
  host.appendChild(root);
  return root;
}

export interface Notifier {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export function createNotifier(
  document: Document,
  logger: Pick<Console, "log"> = console,
  timeoutMs = 4_500,
): Notifier {
  document.addEventListener("fullscreenchange", () => ensureRoot(document));

  const notify = (type: NoticeType, message: string): void => {
    logger.log("toast", type, message);
    try {
      ensureStyle(document);
      const root = ensureRoot(document);
      if (!root) return;
      const item = document.createElement("div");
      item.className = "dwe-toast";
      item.style.setProperty("--dwe-toast-color", TOAST_TYPES[type].color);
      const title = document.createElement("div");
      title.className = "dwe-toast-title";
      title.textContent = TOAST_TYPES[type].title;
      const body = document.createElement("div");
      body.className = "dwe-toast-message";
      body.textContent = message;
      item.append(title, body);
      root.appendChild(item);

      let remaining = timeoutMs;
      let startedAt = Date.now();
      let timer = window.setTimeout(close, remaining);
      function close(): void {
        item.classList.add("is-leaving");
        window.setTimeout(() => item.remove(), 180);
      }
      item.addEventListener("mouseenter", () => {
        window.clearTimeout(timer);
        remaining -= Date.now() - startedAt;
      });
      item.addEventListener("mouseleave", () => {
        startedAt = Date.now();
        timer = window.setTimeout(close, Math.max(0, remaining));
      });
    } catch (error) {
      logger.log("toast render failed", error);
    }
  };

  return {
    info: (message) => notify("info", message),
    success: (message) => notify("success", message),
    warning: (message) => notify("warning", message),
    error: (message) => notify("error", message),
  };
}
