import type { ObserverHub } from "../core/observer-hub.ts";
import type { ChatSpeedSnapshot } from "./user-following.ts";

/** Only edits placeholder attributes; never touches the draft or input handlers. */
export function mountChatSpeedPlaceholder(document: Document, observerHub: ObserverHub,
  snapshot: () => ChatSpeedSnapshot): { refresh(): void; dispose(): void } {
  const owned = new Map<HTMLElement, Map<string, { original: string | null; written: string }>>();
  const restore = (element: HTMLElement, attributes: Map<string, { original: string | null; written: string }>): void => {
    for (const [name, value] of attributes) {
      if (element.getAttribute(name) !== value.written) continue;
      if (value.original === null) element.removeAttribute(name);
      else element.setAttribute(name, value.original);
    }
  };
  const refresh = (): void => {
    const speed = snapshot();
    for (const [element, attributes] of owned) {
      if (!speed.enabled || !speed.roomId || !element.isConnected) { restore(element, attributes); owned.delete(element); }
    }
    if (!speed.enabled || !speed.roomId) return;
    const text = speed.instantRate === null ? "弹幕时速：采样中"
      : `弹幕时速：${speed.instantRate}条/分${speed.observedSeconds < 5 ? "（采样中）" : ""}`;
    for (const element of document.querySelectorAll<HTMLElement>(".ChatSend-txt")) {
      const attributes = owned.get(element) ?? new Map();
      owned.set(element, attributes);
      const names = element.tagName === "INPUT" || element.tagName === "TEXTAREA"
        ? ["placeholder"] : ["data-placeholder"];
      for (const name of names) {
        const current = element.getAttribute(name);
        const previous = attributes.get(name);
        const original = !previous || current !== previous.written ? current : previous.original;
        attributes.set(name, { original, written: text });
        if (current !== text) element.setAttribute(name, text);
      }
    }
  };
  const unsubscribe = observerHub.subscribe(refresh);
  refresh();
  return { refresh, dispose() { unsubscribe(); for (const [element, attributes] of owned) restore(element, attributes); owned.clear(); } };
}
