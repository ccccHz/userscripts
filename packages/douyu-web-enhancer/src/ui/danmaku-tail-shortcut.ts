import type { ObserverHub } from "../core/observer-hub.ts";

/** Small, replaceable shortcut beside the native chat controls. */
export function mountDanmakuTailShortcut(options: {
  document: Document;
  observerHub: ObserverHub;
  enabled(): boolean;
  open(): void;
}): { refresh(): void; dispose(): void } {
  const { document, observerHub, enabled, open } = options;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dwe-chat-control dwe-danmaku-tail-shortcut";
  button.textContent = "尾";
  button.title = "弹幕小尾巴设置";
  button.setAttribute("aria-label", "弹幕小尾巴设置");
  button.addEventListener("click", open);
  const refresh = (): void => {
    const toolbar = document.querySelector<HTMLElement>(".Barrage-toolbar");
    if (toolbar && button.parentElement !== toolbar) toolbar.append(button);
    button.setAttribute("aria-pressed", String(enabled()));
  };
  const unsubscribe = observerHub.subscribe(refresh);
  refresh();
  return { refresh, dispose() { unsubscribe(); button.removeEventListener("click", open); button.remove(); } };
}
