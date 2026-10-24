import type { FeatureDefinition } from "../core/feature.ts";
import {
  chatInputSelectors,
  readChatInput,
  writeChatInput,
} from "../core/chat-input.ts";

export const MESSAGE_CONTEXT_ACTION_FALLBACK_ID = "message-context-action-fallback";

const ACTION_LABELS = ["回复", "+1"] as const;
export type MessageContextAction = (typeof ACTION_LABELS)[number];

// Douyu uses both labels in different rooms/rollouts.  They represent the
// same official capability; a Chinese label must not trigger our fallback.
const OFFICIAL_ACTION_LABELS: Record<MessageContextAction, readonly string[]> = {
  "回复": ["回复"],
  "+1": ["+1", "加一"],
};

export interface FallbackActionPresentation {
  label: string;
  buttonClass: string;
  iconClass: string;
}

const FALLBACK_ACTION_PRESENTATION: Record<MessageContextAction, FallbackActionPresentation> = {
  "回复": {
    label: "回复",
    buttonClass: "labelfisrt-407af4 danmuMenuReplyButton-f2de67",
    iconClass: "danmuMenuIcon-bd4b11 danmuMenuReplyIcon-c5a916",
  },
  "+1": {
    label: "加一",
    buttonClass: "labelfisrt-407af4 danmuMenuAddOneButton-ab0d98",
    iconClass: "danmuMenuIcon-bd4b11 danmuMenuAddOneIcon-45cfa0",
  },
};

// The current floating card is ordered as: 赞, 举报, 加一, 回复, 收藏.
// Missing fallback actions are inserted at their canonical slot, never blindly
// appended after 收藏.
const ACTION_POSITION: Record<string, number> = {
  "赞": 0,
  "举报": 1,
  "+1": 2,
  "加一": 2,
  "回复": 3,
  "收藏": 4,
};

export const messageContextActionSelectors = {
  barrageItem: ["#js-barrage-list .Barrage-listItem:not(.is-extendBarrage)"],
  floatingBarrageItem: ["#comment-higher-container [data-comment-uuid]"],
  messageItem: [
    "#js-barrage-list .Barrage-listItem:not(.is-extendBarrage)",
    "#comment-higher-container [data-comment-uuid]",
  ],
  barrageAuthor: [".Barrage-nickName.js-nick:not(.is-colon)"],
  barrageContent: [".Barrage-content"],
  actionPanel: ["#comment-dzjy-container"],
} as const;

export const MESSAGE_CONTEXT_ACTION_FALLBACK_CSS = `
[data-dwe-message-action] {
  cursor: pointer;
  user-select: none;
}
`;

type Capability = "unknown" | "missing";

export interface MessageSnapshot {
  item: HTMLElement;
  author: string;
  text: string;
  roomPath: string;
  identity: string | null;
}

export function shouldInjectAction(officialPresent: boolean, capability: Capability): boolean {
  return !officialPresent && capability === "missing";
}

export function sameMessageTarget(
  snapshot: MessageSnapshot,
  item: { isConnected: boolean },
  roomPath: string,
  identity: string | null,
): boolean {
  return snapshot.item === item && snapshot.item.isConnected && snapshot.roomPath === roomPath && snapshot.identity === identity;
}

interface InputSelectionSnapshot {
  value: string;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
  editableSelection?: { anchor: number; focus: number };
}

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style?.display !== "none" && style?.visibility !== "hidden";
}

export function isDouyuLiveRoomPath(locationLike: Pick<Location, "hostname" | "pathname">): boolean {
  return locationLike.hostname === "www.douyu.com" && /^\/\d+$/.test(locationLike.pathname);
}

function currentRoomPath(document: Document): string | null {
  const locationLike = document.defaultView?.location;
  return locationLike && isDouyuLiveRoomPath(locationLike) ? locationLike.pathname : null;
}

function identityKey(document: Document): string | null {
  const identity = document.querySelector<HTMLElement>(
    [
      "#js-header [data-uid]",
      "#js-header [data-user-id]",
      ".Header-user [data-uid]",
      ".Header-user [data-user-id]",
      ".UserInfo[data-uid]",
      ".UserInfo[data-user-id]",
      "[data-dwe-identity]",
    ].join(","),
  );
  if (!identity) return null;
  return identity.dataset.uid ?? identity.dataset.userId ?? identity.dataset.dweIdentity ?? null;
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").trim();
}

export function isOfficialActionText(action: MessageContextAction, value: string): boolean {
  return OFFICIAL_ACTION_LABELS[action].includes(cleanText(value));
}

export function fallbackActionPresentation(action: MessageContextAction): FallbackActionPresentation {
  return FALLBACK_ACTION_PRESENTATION[action];
}

function isPureTextContent(content: HTMLElement): boolean {
  if (!cleanText(content.innerText || content.textContent || "")) return false;
  return !content.querySelector("img, video, audio, canvas, svg, iframe, a, [data-emoticon], [data-image]");
}

function authorForBarrageText(document: Document, text: string): string {
  const rows = [...document.querySelectorAll<HTMLElement>(messageContextActionSelectors.barrageItem.join(","))];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const content = rows[index].querySelector<HTMLElement>(messageContextActionSelectors.barrageContent.join(","));
    if (cleanText(content?.innerText || content?.textContent || "") !== text) continue;
    const author = rows[index].querySelector<HTMLElement>(messageContextActionSelectors.barrageAuthor.join(","));
    const value = cleanText(author?.innerText || author?.textContent || "");
    if (value) return value;
  }
  return "";
}

export function readMessageSnapshot(
  item: HTMLElement,
  roomPath: string,
  identity: string | null = null,
): MessageSnapshot | null {
  const isSideBarrage = item.matches(messageContextActionSelectors.barrageItem.join(","));
  const isFloatingBarrage = item.matches(messageContextActionSelectors.floatingBarrageItem.join(","));
  if (!isSideBarrage && !isFloatingBarrage) return null;
  if (item.matches(".is-self") || item.querySelector(".is-self")) return null;
  const authorElement = isSideBarrage
    ? item.querySelector<HTMLElement>(messageContextActionSelectors.barrageAuthor.join(","))
    : null;
  const content = isSideBarrage
    ? item.querySelector<HTMLElement>(messageContextActionSelectors.barrageContent.join(","))
    : item.querySelector<HTMLElement>("[class*='textWrap-']");
  const author = cleanText(authorElement?.innerText || authorElement?.textContent || "");
  const text = cleanText(content?.innerText || content?.textContent || "");
  if (!content || !isPureTextContent(content)) return null;
  return { item, author: author || authorForBarrageText(item.ownerDocument, text), text, roomPath, identity };
}

function actionElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(
    ".labelfisrt-407af4, button, a, [role=button], [data-action], [data-action-id]",
  )].filter(visible);
}

export function hasOfficialAction(panel: HTMLElement, label: MessageContextAction): boolean {
  return actionElements(panel).some((element) =>
    !element.hasAttribute("data-dwe-message-action")
      && isOfficialActionText(label, element.innerText || element.textContent || ""),
  );
}

/** Capture only the native +1 action; nested icon/label clicks must not reach its cooldown handler. */
export function interceptOfficialPlusOne(event: Event, panel: HTMLElement, send: () => void): boolean {
  if (event.type !== "click" && event.type !== "keydown") return false;
  const keyboard = event as KeyboardEvent;
  if (event.type === "keydown" && keyboard.key !== "Enter" && keyboard.key !== " ") return false;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;
  const action = actionElements(panel).find(element =>
    !element.hasAttribute("data-dwe-message-action")
      && element.contains(target)
      && isOfficialActionText("+1", element.innerText || element.textContent || ""),
  );
  if (!action) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!(event.type === "keydown" && keyboard.repeat)) send();
  return true;
}

function panelIsStable(panel: HTMLElement): boolean {
  // Douyu keeps this portal root at 0x0 while positioning the actual card above it.
  return panel.isConnected && actionElements(panel).length > 0;
}

function actionHost(panel: HTMLElement): HTMLElement {
  return panel.querySelector<HTMLElement>("[class*='btnsInner-']")
    ?? panel.querySelector<HTMLElement>(".labelfisrt-407af4")?.parentElement
    ?? panel;
}

function directActionElements(host: HTMLElement): HTMLElement[] {
  return [...host.children].filter((element): element is HTMLElement =>
    element instanceof HTMLElement
      && element.matches(".labelfisrt-407af4, button, a, [role=button], [data-action], [data-action-id]"),
  );
}

function actionPosition(element: HTMLElement): number | null {
  const label = cleanText(
    element.querySelector<HTMLElement>(".danmuMenuButtonLabel-9d78f6")?.innerText
      || element.innerText
      || element.textContent
      || "",
  );
  return Object.prototype.hasOwnProperty.call(ACTION_POSITION, label) ? ACTION_POSITION[label] : null;
}

function createSeparator(document: Document, label: MessageContextAction): HTMLElement {
  const separator = document.createElement("p");
  separator.className = "sugun-e3fbf6";
  separator.dataset.dweMessageSeparator = label;
  separator.textContent = "|";
  return separator;
}

function getInputSelection(input: HTMLElement): InputSelectionSnapshot {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return {
      value: readChatInput(input),
      start: input.selectionStart,
      end: input.selectionEnd,
      direction: input.selectionDirection,
    };
  }
  const selection = input.ownerDocument.getSelection();
  let editableSelection: InputSelectionSnapshot["editableSelection"];
  if (selection?.anchorNode && selection.focusNode && input.contains(selection.anchorNode) && input.contains(selection.focusNode)) {
    const offset = (node: Node, end: number): number => {
      const range = input.ownerDocument.createRange();
      range.selectNodeContents(input);
      range.setEnd(node, end);
      return range.toString().length;
    };
    editableSelection = { anchor: offset(selection.anchorNode, selection.anchorOffset), focus: offset(selection.focusNode, selection.focusOffset) };
  }
  return { value: readChatInput(input), start: null, end: null, direction: null, editableSelection };
}

function restoreInputSelection(input: HTMLElement, snapshot: InputSelectionSnapshot): void {
  writeChatInput(input, snapshot.value);
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const start = snapshot.start ?? snapshot.value.length;
    const end = snapshot.end ?? start;
    input.setSelectionRange(start, end, snapshot.direction ?? "none");
  } else if (snapshot.editableSelection) {
    const selection = input.ownerDocument.getSelection();
    const node = input.firstChild ?? input;
    const length = node === input ? 0 : node.textContent?.length ?? 0;
    const clamp = (value: number): number => Math.max(0, Math.min(length, value));
    selection?.setBaseAndExtent(node, clamp(snapshot.editableSelection.anchor), node, clamp(snapshot.editableSelection.focus));
  }
}

export function replyText(author: string, text: string): string {
  return `@${author}：${text}`;
}

function setReplyInput(document: Document, value: string): boolean {
  const input = document.querySelector<HTMLElement>(chatInputSelectors.chatInput.join(","));
  if (!input) return false;
  writeChatInput(input, value);
  input.focus();
  return true;
}

function sendOnceAndRestoreDraft(document: Document, text: string, draft?: { input: HTMLElement; selection: InputSelectionSnapshot } | null): "sent" | "failed" {
  const input = document.querySelector<HTMLElement>(chatInputSelectors.chatInput.join(","));
  const sendButton = document.querySelector<HTMLElement>(chatInputSelectors.chatSendButton.join(","));
  if (!input || !sendButton || sendButton.getAttribute("aria-disabled") === "true" || ("disabled" in sendButton && (sendButton as HTMLButtonElement).disabled)) return "failed";
  const snapshot = draft?.input === input && draft.selection.value === readChatInput(input)
    ? draft.selection : getInputSelection(input);
  writeChatInput(input, text);
  const restore = () => restoreInputSelection(input, snapshot);
  const view = document.defaultView;
  try { sendButton.click(); }
  finally {
    if (view) view.setTimeout(restore, 0);
    else restore();
  }
  return "sent";
}

function customButton(panel: HTMLElement, label: MessageContextAction, onClick: () => void): HTMLElement {
  const existing = [...panel.querySelectorAll<HTMLElement>("[data-dwe-message-action]")]
    .find((element) => element.dataset.dweMessageAction === label);
  if (existing) {
    existing.onclick = onClick;
    return existing;
  }
  const presentation = fallbackActionPresentation(label);
  const button = panel.ownerDocument.createElement("div");
  button.className = presentation.buttonClass;
  button.dataset.dweMessageAction = label;
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  button.onclick = onClick;
  button.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) onClick();
    }
  };

  const content = panel.ownerDocument.createElement("span");
  content.className = "danmuMenuButtonContent-d2e371";
  const icon = panel.ownerDocument.createElement("span");
  icon.className = presentation.iconClass;
  const buttonLabel = panel.ownerDocument.createElement("span");
  buttonLabel.className = "danmuMenuButtonLabel-9d78f6";
  buttonLabel.textContent = presentation.label;
  content.append(icon, buttonLabel);
  button.append(content);

  const host = actionHost(panel);
  const targetPosition = ACTION_POSITION[presentation.label];
  const actions = directActionElements(host);
  const reference = actions.find((element) => {
    const position = actionPosition(element);
    return position !== null && position > targetPosition;
  });

  if (reference) {
    const previous = reference.previousElementSibling;
    if (previous?.matches(".sugun-e3fbf6")) {
      host.insertBefore(button, reference);
    } else if (actions[0] === reference) {
      host.insertBefore(button, reference);
    } else {
      host.insertBefore(createSeparator(panel.ownerDocument, label), reference);
      host.insertBefore(button, reference);
    }
    host.insertBefore(createSeparator(panel.ownerDocument, label), reference);
  } else if (actions.length > 0) {
    const last = host.lastElementChild;
    if (last?.matches(".sugun-e3fbf6")) {
      host.append(button);
    } else {
      host.append(createSeparator(panel.ownerDocument, label), button);
    }
  } else {
    host.append(button);
  }
  return button;
}

function removeCustomButtons(document: Document): void {
  document.querySelectorAll("[data-dwe-message-action]").forEach((element) => element.remove());
  document.querySelectorAll("[data-dwe-message-separator]").forEach((element) => element.remove());
}

function removeCustomButton(panel: HTMLElement, label: MessageContextAction): void {
  panel.querySelectorAll<HTMLElement>(`[data-dwe-message-action="${label}"]`).forEach((element) => {
    element.previousElementSibling?.matches(`[data-dwe-message-separator="${label}"]`)
      ? element.previousElementSibling.remove()
      : undefined;
    element.nextElementSibling?.matches(`[data-dwe-message-separator="${label}"]`)
      ? element.nextElementSibling.remove()
      : undefined;
    element.remove();
  });
}

function isSameTarget(snapshot: MessageSnapshot, item: Element, roomPath: string, identity: string | null): boolean {
  return sameMessageTarget(snapshot, item, roomPath, identity);
}

export const messageContextActionFallbackFeature: FeatureDefinition = {
  id: MESSAGE_CONTEXT_ACTION_FALLBACK_ID,
  start({ diagnostics, document, observerHub, styles }) {
    const removeStyle = styles.add(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, MESSAGE_CONTEXT_ACTION_FALLBACK_CSS);
    const capability: Record<MessageContextAction, Capability> = { "回复": "unknown", "+1": "unknown" };
    let snapshot: MessageSnapshot | null = null;
    let roomPath: string | null = null;
    let identity: string | null = identityKey(document);
    let lastPanel: HTMLElement | null = null;
    let submittingPlusOne = false;
    let pendingDraft: { input: HTMLElement; selection: InputSelectionSnapshot } | null = null;

    const clearTarget = (): void => {
      snapshot = null;
      lastPanel = null;
      pendingDraft = null;
      removeCustomButtons(document);
    };

    const sendPlusOne = (): void => {
      if (submittingPlusOne) return;
      const path = currentRoomPath(document);
      const account = identityKey(document);
      const current = snapshot && path && isSameTarget(snapshot, snapshot.item, path, account)
        ? readMessageSnapshot(snapshot.item, path, account) : null;
      if (!snapshot || !current || current.text !== snapshot.text) {
        diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "degraded", { detail: "加一未发送：目标弹幕已失效，请重新打开卡片" });
        return;
      }
      submittingPlusOne = true;
      try {
        if (sendOnceAndRestoreDraft(document, current.text, pendingDraft) === "failed") {
          diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "degraded", { detail: "加一未发送：输入框或发送按钮不可用" });
        }
      } catch {
        diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "degraded", { detail: "加一发送未确认，已恢复草稿；不会自动重试" });
      } finally {
        submittingPlusOne = false;
        pendingDraft = null;
      }
    };

    const scan = (): void => {
      const nextRoomPath = currentRoomPath(document);
      const nextIdentity = identityKey(document);
      if (nextRoomPath !== roomPath || nextIdentity !== identity) {
        roomPath = nextRoomPath;
        identity = nextIdentity;
        capability["回复"] = "unknown";
        capability["+1"] = "unknown";
        clearTarget();
      }
      if (roomPath) {
        const floatingItem = document.querySelector<HTMLElement>(messageContextActionSelectors.floatingBarrageItem.join(","));
        const floatingSnapshot = floatingItem ? readMessageSnapshot(floatingItem, roomPath, identity) : null;
        if (floatingSnapshot) snapshot = floatingSnapshot;
      }
      if (!roomPath || !snapshot || !isSameTarget(snapshot, snapshot.item, roomPath, identity)) {
        removeCustomButtons(document);
        diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, roomPath ? "waiting" : "degraded", {
          detail: roomPath ? "等待合格弹幕悬浮卡片" : "仅作用于 www.douyu.com 数字直播页",
        });
        return;
      }
      const panel = document.querySelector<HTMLElement>(messageContextActionSelectors.actionPanel.join(","));
      if (!panel || !panelIsStable(panel)) {
        if (lastPanel && !panel) clearTarget();
        diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "waiting", { detail: "等待弹幕操作区稳定渲染" });
        return;
      }
      if (lastPanel !== panel) {
        lastPanel = panel;
        removeCustomButtons(document);
      }
      for (const label of ACTION_LABELS) {
        if (hasOfficialAction(panel, label)) {
          removeCustomButton(panel, label);
          continue;
        }
        if (label === "回复" && !snapshot.author) continue;
        capability[label] = "missing";
        if (!shouldInjectAction(false, capability[label])) continue;
        const action = label === "回复"
          ? () => { if (!setReplyInput(document, replyText(snapshot?.author ?? "", snapshot?.text ?? ""))) diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "degraded", { detail: "回复失败：弹幕输入框不可用" }); }
          : sendPlusOne;
        customButton(panel, label, action);
      }
      diagnostics.update(MESSAGE_CONTEXT_ACTION_FALLBACK_ID, "active", {
        detail: `加一统一使用普通发送；${hasOfficialAction(panel, "回复") ? "保留官方回复" : "补齐缺失回复"}`,
        selector: messageContextActionSelectors.actionPanel[0],
      });
    };

    const onContextMenu = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(messageContextActionSelectors.messageItem.join(",")) : null;
      if (!target || !roomPath) return;
      const next = readMessageSnapshot(target, roomPath, identity);
      if (!next) {
        clearTarget();
        return;
      }
      snapshot = next;
      lastPanel = null;
      scan();
    };

    const onMessageHover = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(messageContextActionSelectors.messageItem.join(",")) : null;
      if (!target || !roomPath) return;
      const next = readMessageSnapshot(target, roomPath, identity);
      if (!next) {
        clearTarget();
        return;
      }
      snapshot = next;
      scan();
    };

    const onClick = (event: Event): void => {
      // Our nested normal-send click must not clear the still-open +1 target.
      if (submittingPlusOne) return;
      const target = event.target instanceof Element ? event.target : null;
      const panel = target?.closest<HTMLElement>(messageContextActionSelectors.actionPanel.join(","));
      if (panel) {
        if (snapshot && currentRoomPath(document)) interceptOfficialPlusOne(event, panel, sendPlusOne);
        return;
      }
      if (target?.closest(messageContextActionSelectors.messageItem.join(","))) return;
      clearTarget();
    };

    const rememberDraft = (event: Event): void => {
      if (!snapshot || !currentRoomPath(document)) return;
      const target = event.target instanceof Element ? event.target : null;
      const panel = target?.closest<HTMLElement>(messageContextActionSelectors.actionPanel.join(","));
      if (!target || !panel || !actionElements(panel).some(action => action.contains(target) && isOfficialActionText("+1", action.innerText || action.textContent || ""))) return;
      const input = document.querySelector<HTMLElement>(chatInputSelectors.chatInput.join(","));
      if (input) pendingDraft = { input, selection: getInputSelection(input) };
    };

    const onKeydown = (event: Event): void => {
      if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === " ") rememberDraft(event);
      const target = event.target instanceof Element ? event.target : null;
      const panel = target?.closest<HTMLElement>(messageContextActionSelectors.actionPanel.join(","));
      if (panel && snapshot && currentRoomPath(document)) interceptOfficialPlusOne(event, panel, sendPlusOne);
    };

    roomPath = currentRoomPath(document);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("mouseover", onMessageHover, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);
    // Preserve the editable selection before the browser moves it onto the clicked label.
    document.addEventListener("mousedown", rememberDraft, true);
    const stopWatching = observerHub.subscribe(scan);
    scan();

    return () => {
      stopWatching();
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("mouseover", onMessageHover, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeydown, true);
      document.removeEventListener("mousedown", rememberDraft, true);
      clearTarget();
      removeStyle();
    };
  },
};
