export const chatInputSelectors = {
  chatInput: [".ChatSend-txt"],
  chatSendButton: [".ChatSend-button"],
  barrageList: ["#js-barrage-list"],
  barrageItem: ["#js-barrage-list .Barrage-listItem"],
  barrageContent: [".Barrage-content"],
  sendFeedbackHost: [".ChatSend", ".Barrage-toolbar"],
} as const;

export function normalizeChatMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isChatInput(element: Element | null): element is HTMLElement {
  return Boolean(element?.matches(chatInputSelectors.chatInput.join(",")));
}

export function closestChatInput(element: Element | null): HTMLElement | null {
  const match = element?.closest(chatInputSelectors.chatInput.join(","));
  return match ? (match as HTMLElement) : null;
}

export function readChatInput(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  return element.innerText ?? element.textContent ?? "";
}

function dispatchInput(element: HTMLElement): void {
  const EventConstructor = element.ownerDocument.defaultView?.Event ?? Event;
  element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
}

export function writeChatInput(element: HTMLElement, value: string): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.setSelectionRange(value.length, value.length);
  } else {
    element.textContent = value;
    const selection = element.ownerDocument.getSelection();
    if (selection) {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  dispatchInput(element);
}

export function hasCollapsedChatInputCaret(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.selectionStart !== null && element.selectionStart === element.selectionEnd;
  }
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1 || !selection.isCollapsed) return false;
  return element.contains(selection.getRangeAt(0).startContainer);
}

export function isCaretAtBoundary(
  element: HTMLElement,
  boundary: "start" | "end",
): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const position = element.selectionStart;
    if (position === null || position !== element.selectionEnd) return false;
    return boundary === "start" ? position === 0 : position === element.value.length;
  }

  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1 || !selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return false;
  const prefix = element.ownerDocument.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(range.startContainer, range.startOffset);
  const position = prefix.toString().length;
  const length = element.innerText?.length ?? element.textContent?.length ?? 0;
  return boundary === "start" ? position === 0 : position === length;
}
