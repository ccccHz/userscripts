import type { ObserverHub } from "./observer-hub.ts";
import {
  chatInputSelectors,
  closestChatInput,
  normalizeChatMessage,
  readChatInput,
} from "./chat-input.ts";

export interface PendingChatSend {
  id: number;
  message: string;
  normalizedMessage: string;
  submittedAt: number;
  timedOut: boolean;
  scope: string | null;
}

export interface ChatSubmission {
  message: string;
  normalizedMessage: string;
  submittedAt: number;
  scope: string | null;
}

interface ChatSubmissionListenerOptions {
  document: Document;
  now?: () => number;
  getScope?: () => string | null;
  onSubmitted: (submission: ChatSubmission) => void;
}

interface ChatSendTrackerOptions {
  document: Document;
  observerHub: ObserverHub;
  timeoutMs?: number;
  retentionMs?: number;
  now?: () => number;
  getScope?: () => string | null;
  onAttempt?: (attempt: PendingChatSend) => void;
  onConfirmed?: (attempt: PendingChatSend, delayed: boolean, item: Element) => void;
  onUnconfirmed?: (attempt: PendingChatSend) => void;
  onExpired?: (attempt: PendingChatSend) => void;
}

export class PendingChatSends {
  readonly #items: PendingChatSend[] = [];
  #nextId = 1;

  add(message: string, submittedAt: number, scope: string | null = null): PendingChatSend | null {
    const normalizedMessage = normalizeChatMessage(message);
    if (!normalizedMessage) return null;
    const item = {
      id: this.#nextId,
      message: message.trim(),
      normalizedMessage,
      submittedAt,
      timedOut: false,
      scope,
    };
    this.#nextId += 1;
    this.#items.push(item);
    return item;
  }

  markUnconfirmed(id: number): PendingChatSend | null {
    const item = this.#items.find((candidate) => candidate.id === id);
    if (!item) return null;
    item.timedOut = true;
    return item;
  }

  confirm(message: string, scope: string | null = null): PendingChatSend | null {
    const normalizedMessage = normalizeChatMessage(message);
    const index = this.#items.findIndex(
      (candidate) =>
        candidate.normalizedMessage === normalizedMessage &&
        candidate.scope === scope,
    );
    if (index < 0) return null;
    return this.#items.splice(index, 1)[0] ?? null;
  }

  remove(id: number): void {
    const index = this.#items.findIndex((candidate) => candidate.id === id);
    if (index >= 0) this.#items.splice(index, 1);
  }

  clear(): void {
    this.#items.length = 0;
  }

  get size(): number {
    return this.#items.length;
  }
}

function isOwnBarrage(item: Element): boolean {
  return item.matches(".is-self") || Boolean(item.querySelector(".is-self"));
}

export function createChatSubmissionListener({
  document,
  now = Date.now,
  getScope,
  onSubmitted,
}: ChatSubmissionListenerOptions): () => void {
  const submit = (input: HTMLElement): void => {
    const message = readChatInput(input);
    const normalizedMessage = normalizeChatMessage(message);
    if (!normalizedMessage) return;
    onSubmitted({
      message: message.trim(),
      normalizedMessage,
      submittedAt: now(),
      scope: getScope?.() ?? null,
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) return;
    const target = event.target instanceof Element ? event.target : null;
    const input = closestChatInput(target);
    if (input) submit(input);
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(chatInputSelectors.chatSendButton.join(","));
    if (!button) return;
    const input = document.querySelector<HTMLElement>(
      chatInputSelectors.chatInput.join(","),
    );
    if (input) submit(input);
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("click", onClick, true);
  };
}

export function createChatSendTracker({
  document,
  observerHub,
  timeoutMs = 2_000,
  retentionMs = 30_000,
  now = Date.now,
  getScope,
  onAttempt,
  onConfirmed,
  onUnconfirmed,
  onExpired,
}: ChatSendTrackerOptions): () => void {
  const pending = new PendingChatSends();
  const seenItems = new WeakSet<Element>();
  const timers = new Map<number, { timeout: number; expiry: number }>();
  let acceptingEchoes = false;

  const clearAttemptTimers = (id: number): void => {
    const pair = timers.get(id);
    if (!pair) return;
    clearTimeout(pair.timeout);
    clearTimeout(pair.expiry);
    timers.delete(id);
  };

  const stopListening = createChatSubmissionListener({
    document,
    now,
    getScope,
    onSubmitted: (submission) => {
      const attempt = pending.add(
        submission.message,
        submission.submittedAt,
        submission.scope,
      );
      if (!attempt) return;
      onAttempt?.(attempt);
      const timeout = window.setTimeout(() => {
        const item = pending.markUnconfirmed(attempt.id);
        if (item) onUnconfirmed?.(item);
      }, timeoutMs);
      const expiry = window.setTimeout(() => {
        pending.remove(attempt.id);
        timers.delete(attempt.id);
        onExpired?.(attempt);
      }, retentionMs);
      timers.set(attempt.id, { timeout, expiry });
    },
  });

  const scan = (): void => {
    for (const item of document.querySelectorAll(
      chatInputSelectors.barrageItem.join(","),
    )) {
      if (seenItems.has(item)) continue;
      seenItems.add(item);
      if (!acceptingEchoes || !isOwnBarrage(item)) continue;
      const content = item.querySelector(chatInputSelectors.barrageContent.join(","));
      const message = content instanceof HTMLElement
        ? content.innerText
        : content?.textContent ?? "";
      const attempt = pending.confirm(message, getScope?.() ?? null);
      if (!attempt) continue;
      clearAttemptTimers(attempt.id);
      try {
        onConfirmed?.(attempt, attempt.timedOut, item);
      } catch (error) {
        console.error("[douyu-web-enhancer] 弹幕发送回显处理失败", error);
      }
    }
  };

  scan();
  acceptingEchoes = true;
  const stopWatching = observerHub.subscribe(scan);

  return () => {
    stopListening();
    stopWatching();
    for (const pair of timers.values()) {
      clearTimeout(pair.timeout);
      clearTimeout(pair.expiry);
    }
    timers.clear();
    pending.clear();
  };
}
