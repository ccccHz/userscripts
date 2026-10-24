import { NotificationInbox, type NoticeRecord } from "./notification-inbox.ts";
interface Card { element: HTMLElement; remaining: number; started: number; timer?: ReturnType<typeof setTimeout>; source: NoticeRecord["source"]; uid?: string }
export interface NoticeInput { title: string; text: string; source: NoticeRecord["source"]; uid?: string; roomId?: string; kind?: NoticeRecord["kind"]; nickname?: string; duration?: number; preview?: boolean; summary?: boolean }
const centers = new WeakMap<Document, NotificationCenter>();
export function notificationCenter(document: Document): NotificationCenter {
  let center = centers.get(document);
  if (!center) { center = new NotificationCenter(document); centers.set(document, center); }
  return center;
}
export class NotificationCenter {
  readonly inbox: NotificationInbox;
  readonly root: HTMLDivElement;
  readonly #summary: HTMLElement;
  readonly #cards: Card[] = [];
  #hovered = false;
  #overflow = 0;
  #hiddenCount = 0;
  #returnCount = 0;
  #disposed = false;
  readonly document: Document;
  constructor(document: Document, storage?: Pick<Storage, "getItem" | "setItem"> | null) {
    this.document = document;
    if (storage === undefined) { try { storage = document.defaultView?.localStorage ?? null; } catch { storage = null; } }
    this.inbox = new NotificationInbox(storage, () => document.dispatchEvent(new Event("dwe-settings-changed")));
    this.root = document.createElement("div"); this.root.setAttribute("data-dwe-follow-reminders", "");
    this.root.setAttribute("data-dwe-notifications", "unified-v1");
    this.root.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));pointer-events:auto";
    const shadow = this.root.attachShadow({mode:"open"});
    const style = document.createElement("style");
    style.textContent = ":host{font:13px/1.5 system-ui;color:#f3f4f6}article{position:relative;box-sizing:border-box;margin-top:8px;padding:12px 34px 12px 14px;background:#24262e;border:1px solid #525967;border-left:3px solid #8caeff;border-radius:10px;box-shadow:0 4px 18px #0005;overflow-wrap:anywhere}strong{display:block}p{margin:5px 0 0;max-height:90px;overflow:auto}button{position:absolute;right:7px;top:7px;background:transparent;border:0;color:#ddd;font-size:18px;cursor:pointer}.summary{position:absolute;bottom:100%;left:0;background:#24262e;border-radius:6px;padding:3px 10px;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}.summary:empty{display:none}";
    this.#summary = document.createElement("div"); this.#summary.className = "summary";
    shadow.append(style, this.#summary);
    this.root.onpointerenter = () => { if (this.#hovered) return; this.#hovered = true; this.#pause(); };
    this.root.onpointerleave = () => { if (!this.#hovered) return; this.#hovered = false; if (!this.#cards.length) { this.root.remove(); this.#overflow = 0; this.#returnCount = 0; this.#renderSummary(); } this.#resume(); };
    document.addEventListener("fullscreenchange", this.#mount);
    document.addEventListener("visibilitychange", this.#visibility);
  }
  #mount = (): void => { if (this.#cards.length) (this.document.fullscreenElement ?? this.document.body)?.append(this.root); };
  #pause(): void { for (const card of this.#cards) { if (card.timer !== undefined) { clearTimeout(card.timer); card.timer = undefined; card.remaining = Math.max(0, card.remaining - (Date.now() - card.started)); } } }
  #resume(): void { if (this.document.hidden || this.#hovered) return; for (const card of this.#cards) { if (card.timer !== undefined) continue; card.started = Date.now(); card.timer = setTimeout(() => { card.timer = undefined; if (!this.#hovered && !this.document.hidden) this.#remove(card); }, card.remaining); } }
  #visibility = (): void => {
    if (this.document.hidden) { this.#pause(); return; }
    const count = this.#hiddenCount; this.#hiddenCount = 0;
    if (count) {
      if (this.#hovered || this.#cards.length >= 3) { this.#returnCount += count; this.#renderSummary(); }
      else this.show({title:"提醒汇总", text:`离开期间有 ${count} 条新提醒（仅统计本页实际收到的提醒）`,source:"general",preview:true,summary:true});
    }
    this.#resume();
  };
  show(input: NoticeInput): void {
    if (this.#disposed) return;
    if (!input.preview && input.source === "follow" && input.uid && input.kind && this.inbox.followMode(input.uid,input.kind) === "off") return;
    const watching = !this.document.hidden && this.document.hasFocus();
    const retainUnread = !input.preview && !watching && this.inbox.retainsUnread(input);
    if (!input.preview) this.inbox.add({title:input.title,text:input.text,source:input.source,...(input.kind ? {kind:input.kind}:{}),...(input.nickname ? {nickname:input.nickname}:{}),...(input.uid ? {uid:input.uid}:{}),...(input.roomId ? {roomId:input.roomId}:{})}, retainUnread);
    if (this.document.hidden) { if (retainUnread) this.#hiddenCount++; return; }
    if (this.#hovered || this.#cards.length >= 3) { if (retainUnread) { this.#overflow++; this.#renderSummary(); } return; }
    const element = this.document.createElement("article"); element.setAttribute("role","status");
    const title = this.document.createElement("strong"); title.textContent = `${input.summary ? "汇总 · " : input.preview ? "预览 · " : ""}${input.title}`;
    const body = this.document.createElement("p"); body.textContent = input.text;
    const close = this.document.createElement("button"); close.type="button"; close.textContent="×"; close.setAttribute("aria-label","关闭提醒");
    const card: Card = {element,remaining:input.duration ?? 4500,started:Date.now(),source:input.source,...(input.uid ? {uid:input.uid}:{})};
    close.onclick = () => this.#remove(card); element.append(title,body,close); this.root.shadowRoot!.append(element); this.#cards.push(card); this.#mount(); this.#resume();
  }
  #renderSummary(): void { this.#summary.textContent = [this.#returnCount ? `离开期间有 ${this.#returnCount} 条新提醒` : "", this.#overflow ? `还有 ${this.#overflow} 条 · 请查看记录` : ""].filter(Boolean).join("；"); }
  #remove(card: Card): void {
    const index = this.#cards.indexOf(card); if (index < 0) return;
    clearTimeout(card.timer); this.#cards.splice(index,1); card.element.remove();
    if (!this.#cards.length && !this.#hovered) { this.root.remove(); this.#overflow = 0; this.#returnCount = 0; this.#renderSummary(); }
  }
  clear(source?: NoticeRecord["source"], uids?: readonly string[]): void { for (const card of [...this.#cards]) if ((!source || card.source === source) && (!uids || !card.uid || !uids.includes(card.uid))) this.#remove(card); }
  dispose(): void { this.#disposed = true; this.clear(); this.root.remove(); this.document.removeEventListener("fullscreenchange",this.#mount); this.document.removeEventListener("visibilitychange",this.#visibility); centers.delete(this.document); }
}
