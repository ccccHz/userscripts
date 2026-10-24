import type { ObserverHub } from "../core/observer-hub.ts";
import type { StyleRegistry } from "../core/styles.ts";
import { validUid, type UserBlockingState } from "./user-blocking.ts";
import type { UserFollowingState } from "./user-following.ts";

const ID = "user-block-shortcuts";
const ROW = "data-dwe-user-block-shortcut";
const USER_CARDS = ".NormalCard, .DiamondsFansCard, .SupremeCard, .GiftHallCard";

interface ShortcutOptions {
  document: Document;
  observerHub: ObserverHub;
  styles: StyleRegistry;
  getRoomId: () => string | null;
  getState: () => UserBlockingState;
  getFollowingState: () => UserFollowingState;
  setFollowing: (uid: string, add: boolean, nickname: string) => Promise<void>;
  setRule: (uid: string, roomId: string | null, add: boolean, nickname?: string) => Promise<void>;
}

export function uidFromOfficialProfileLink(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.hostname !== "yuba.douyu.com" || url.pathname !== "/wbapi/web/jumpusercenter") return null;
    const uid = url.searchParams.get("id") ?? "";
    return validUid(uid) ? uid : null;
  } catch { return null; }
}

const CSS = `
[${ROW}] { box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; font: var(--dwe-card-font, 12px/1.4 sans-serif); color: var(--dwe-card-color, inherit); background: transparent; }
[${ROW}] button { box-sizing: border-box; appearance: none; cursor: pointer; flex: 1; min-width: 0; margin: 0; border: var(--dwe-card-border, 1px solid currentColor); border-radius: var(--dwe-card-radius, 3px); padding: var(--dwe-card-padding, 6px 8px); color: var(--dwe-card-color, inherit); background: var(--dwe-card-background, transparent); font: inherit; text-align: center; }
[${ROW}] button:hover { color: #ff5d23; border-color: currentColor; }
[${ROW}] button:focus-visible { outline: 2px solid #ff5d23; outline-offset: 2px; }
[${ROW}] button:disabled { cursor: wait; opacity: .6; }
[${ROW}] [data-dwe-scope] { display: flex; width: 100%; gap: 6px; }
[${ROW}] [data-dwe-scope][hidden] { display: none; }
[${ROW}] [data-dwe-feedback] { width: 100%; line-height: 1.5; font-size: 12px; color: inherit; }
[${ROW}] [data-dwe-feedback]:empty { display: none; }
`;

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return element.isConnected && rect.width > 0 && rect.height > 0;
}

function currentCardUid(card: HTMLElement, baseUrl: string): string | null {
  const name = card.querySelector<HTMLAnchorElement>("a.GiftHallCard-name[href*='jumpusercenter?id='], a.NormalCard-name[href*='jumpusercenter?id='], a.SupremeCard-name[href*='jumpusercenter?id='], a.DiamondsFansCard-name[href*='jumpusercenter?id=']");
  return name ? uidFromOfficialProfileLink(name.href, baseUrl) : null;
}

export function mountUserBlockShortcuts(options: ShortcutOptions): () => void {
  const { document, observerHub, styles, getRoomId, getState, setRule, getFollowingState, setFollowing } = options;
  const removeStyle = styles.add(ID, CSS);
  let lastRoomId = getRoomId();
  let openTarget: { uid: string; roomId: string } | null = null;
  const removeRows = (): void => {
    document.querySelectorAll(`[${ROW}]`).forEach((element) => element.remove());
  };
  const setText = (element: HTMLElement, value: string): void => {
    if (element.textContent !== value) element.textContent = value;
  };

  const updateRow = (host: HTMLElement, uid: string, roomId: string): void => {
    let row = host.querySelector<HTMLElement>(`[${ROW}]`);
    if (!row) {
      row = document.createElement("div");
      row.setAttribute(ROW, "card");
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = "增强屏蔽";
      open.setAttribute("aria-expanded", "false");
      const follow = document.createElement("button");
      follow.type = "button";
      follow.dataset.dweFollow = "";
      const scope = document.createElement("div");
      scope.dataset.dweScope = "";
      scope.hidden = true;
      for (const value of ["room", "all"] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.dweBlockScope = value;
        scope.append(button);
      }
      const feedback = document.createElement("span");
      feedback.dataset.dweFeedback = "";
      row.append(open, follow, scope, feedback);
      host.append(row);
    }
    // Match the live card's native action appearance, including skin and theme.
    // Compare before writing so our shared observer cannot trigger itself forever.
    const nativeButton = host.querySelector<HTMLElement>(".GiftHallCard-action .GiftHallCard-btn, .NormalCard-action .NormalCard-btn, .DiamondsFansCard-btn, .SupremeCard-action .SupremeCard-btn")
      ?? [...host.querySelectorAll<HTMLAnchorElement>("a")].find(element => element.textContent?.trim() === "屏蔽用户");
    if (nativeButton && document.defaultView) {
      const native = document.defaultView.getComputedStyle(nativeButton);
      const values = { font: native.font, color: native.color, border: native.border,
        radius: native.borderRadius, padding: native.padding, background: native.backgroundColor };
      for (const [key, value] of Object.entries(values)) {
        const property = `--dwe-card-${key}`;
        if (row.style.getPropertyValue(property) !== value) row.style.setProperty(property, value);
      }
    }
    if (row.dataset.dweUid !== uid || row.dataset.dweRoomId !== roomId) {
      row.dataset.dweUid = uid;
      row.dataset.dweRoomId = roomId;
      row.querySelector<HTMLElement>("[data-dwe-feedback]")!.textContent = "";
      row.querySelector<HTMLElement>("[data-dwe-scope]")!.hidden = true;
      row.querySelector<HTMLButtonElement>("button")!.setAttribute("aria-expanded", "false");
    }
    const expanded = openTarget?.uid === uid && openTarget.roomId === roomId;
    row.querySelector<HTMLElement>("[data-dwe-scope]")!.hidden = !expanded;
    row.querySelector<HTMLButtonElement>("button")!.setAttribute("aria-expanded", String(expanded));
    setText(row.querySelector<HTMLButtonElement>("[data-dwe-follow]")!, getFollowingState().uids.includes(uid) ? "取消增强关注" : "增强关注");
    for (const button of row.querySelectorAll<HTMLButtonElement>("[data-dwe-block-scope]")) {
      const scopeRoomId = button.dataset.dweBlockScope === "all" ? null : roomId;
      const exists = getState().rules.some((rule) => rule.uid === uid && rule.roomId === scopeRoomId);
      setText(button, `${scopeRoomId === null ? "所有房间" : "本房间"}：${exists ? "取消屏蔽" : "屏蔽"}`);
    }
  };

  const scan = (): void => {
    const roomId = getRoomId();
    if (roomId !== lastRoomId) {
      lastRoomId = roomId;
      openTarget = null;
      removeRows();
    }
    if (!roomId) { removeRows(); return; }
    for (const card of document.querySelectorAll<HTMLElement>(USER_CARDS)) {
      const uid = visible(card) ? currentCardUid(card, document.baseURI) : null;
      const content = card.querySelector<HTMLElement>(".NormalCard-content, .DiamondsFansCard-main, .SupremeCard-main, .GiftHallCard-main");
      if (uid && content) updateRow(content, uid, roomId);
      else card.querySelector(`[${ROW}]`)?.remove();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>(`[${ROW}] button`) : null;
    if (button) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = button.closest<HTMLElement>(`[${ROW}]`)!;
      const uid = row.dataset.dweUid ?? "";
      const roomId = row.dataset.dweRoomId ?? "";
      if (!validUid(uid) || !roomId || roomId !== getRoomId()) return;
      if (button.hasAttribute("data-dwe-follow")) {
        const card = row.closest<HTMLElement>(USER_CARDS);
        if (!card || currentCardUid(card, document.baseURI) !== uid) return;
        const nickname = card.querySelector(".NormalCard-name, .DiamondsFansCard-name, .SupremeCard-name, .GiftHallCard-name")?.textContent?.trim() ?? "";
        const add = !getFollowingState().uids.includes(uid);
        button.disabled = true;
        void setFollowing(uid, add, nickname).then(() => {
          row.querySelector<HTMLElement>("[data-dwe-feedback]")!.textContent = add ? "已关注，记录后续消息" : "已取消增强关注";
          scan();
        }).catch((error: unknown) => {
          row.querySelector<HTMLElement>("[data-dwe-feedback]")!.textContent = error instanceof Error ? error.message : "保存失败";
        }).finally(() => { button.disabled = false; });
        return;
      }
      if (!button.dataset.dweBlockScope) {
        openTarget = openTarget?.uid === uid && openTarget.roomId === roomId
          ? null : { uid, roomId };
        scan();
        return;
      }
      const card = row.closest<HTMLElement>(USER_CARDS);
      const liveUid = card ? currentCardUid(card, document.baseURI) : null;
      const nickname = card?.querySelector(".NormalCard-name, .DiamondsFansCard-name, .SupremeCard-name, .GiftHallCard-name")?.textContent?.trim() ?? "";
      const feedback = row.querySelector<HTMLElement>("[data-dwe-feedback]")!;
      if (liveUid !== uid) {
        feedback.textContent = "目标已变化，请重新打开菜单";
        return;
      }
      const ruleRoomId = button.dataset.dweBlockScope === "all" ? null : roomId;
      const exists = getState().rules.some((rule) => rule.uid === uid && rule.roomId === ruleRoomId);
      button.disabled = true;
      void setRule(uid, ruleRoomId, !exists, nickname).then(() => {
        feedback.textContent = exists ? "已取消本机规则" : "已保存，后续弹幕生效";
        scan();
      }).catch((error: unknown) => {
        feedback.textContent = error instanceof Error ? error.message : "保存失败";
      }).finally(() => { button.disabled = false; });
      return;
    }
  };

  document.defaultView?.addEventListener("click", onClick, true);
  document.addEventListener("dwe-settings-changed", scan);
  const unsubscribe = observerHub.subscribe(scan);
  scan();
  return () => {
    unsubscribe();
    document.defaultView?.removeEventListener("click", onClick, true);
    document.removeEventListener("dwe-settings-changed", scan);
    removeRows();
    removeStyle();
  };
}
