const TOAST_ROOT_ID = "chz-auto-fans-continue-toast-root";
const TOAST_STYLE_ID = "chz-auto-fans-continue-toast-style";
const TOAST_TYPES = {
  info: { title: "提示", color: "#2563eb" },
  success: { title: "完成", color: "#16a34a" },
  warning: { title: "注意", color: "#f97316" },
  error: { title: "失败", color: "#dc2626" },
};

function getToastType(type) {
  return TOAST_TYPES[type] ? type : "info";
}

function ensureStyle(document) {
  if (!document?.head || document.getElementById(TOAST_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = TOAST_STYLE_ID;
  style.textContent = `
#${TOAST_ROOT_ID} {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
#${TOAST_ROOT_ID} .chz-auto-fans-toast {
  width: min(360px, calc(100vw - 32px));
  box-sizing: border-box;
  border-left: 4px solid var(--chz-toast-color);
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.96);
  color: #fff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
  padding: 10px 12px;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  pointer-events: auto;
  transition: opacity 160ms ease, transform 160ms ease;
}
#${TOAST_ROOT_ID} .chz-auto-fans-toast.is-leaving {
  opacity: 0;
  transform: translateY(6px);
}
#${TOAST_ROOT_ID} .chz-auto-fans-toast-title {
  font-weight: 700;
  margin-bottom: 2px;
}
#${TOAST_ROOT_ID} .chz-auto-fans-toast-message {
  overflow-wrap: anywhere;
}
`;
  document.head.appendChild(style);
}

function ensureRoot(document) {
  if (!document?.body) return null;

  let root = document.getElementById(TOAST_ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = TOAST_ROOT_ID;
  document.body.appendChild(root);
  return root;
}

export function createDomToastRenderer({
  document = globalThis.document,
  timeoutMs = 4500,
} = {}) {
  return {
    show({ type, message }) {
      const toastType = getToastType(type);
      ensureStyle(document);
      const root = ensureRoot(document);
      if (!root) return;

      const item = document.createElement("div");
      item.className = "chz-auto-fans-toast";
      item.style.setProperty("--chz-toast-color", TOAST_TYPES[toastType].color);

      const title = document.createElement("div");
      title.className = "chz-auto-fans-toast-title";
      title.textContent = TOAST_TYPES[toastType].title;

      const body = document.createElement("div");
      body.className = "chz-auto-fans-toast-message";
      body.textContent = String(message);

      item.append(title, body);
      root.appendChild(item);

      globalThis.setTimeout?.(() => {
        item.classList.add("is-leaving");
        globalThis.setTimeout?.(() => item.remove(), 180);
      }, timeoutMs);
    },
  };
}

export function createNotifier({
  renderer = createDomToastRenderer(),
  logger,
} = {}) {
  function notify(type, message) {
    const toastType = getToastType(type);
    const text = String(message);

    try {
      logger?.log?.("toast", toastType, text);
    } catch {
      // Toast logging must never interrupt the userscript.
    }

    try {
      renderer?.show?.({ type: toastType, message: text });
    } catch (error) {
      try {
        logger?.log?.("toast render failed", error);
      } catch {
        // Ignore secondary logging failures.
      }
    }
  }

  return {
    notify,
    info(message) {
      notify("info", message);
    },
    success(message) {
      notify("success", message);
    },
    warning(message) {
      notify("warning", message);
    },
    error(message) {
      notify("error", message);
    },
  };
}
