import type { DouyuUserMessage } from "../core/douyu-user-messages.ts";
import { notificationCenter, type NotificationCenter } from "../core/notification-center.ts";
export class UserFollowReminders {
  readonly center: NotificationCenter;
  constructor(document: Document, _changed: () => void) { this.center = notificationCenter(document); }
  unread(uid: string): number { return this.center.inbox.unread(uid); }
  markRead(uid: string): void { this.center.inbox.markUserRead(uid); }
  sync(uids: readonly string[], remindersEnabled: boolean): void { this.center.clear("follow", remindersEnabled ? uids : []); }
  record(message: DouyuUserMessage, roomName: string, show: boolean, eventLabel?: string, preview = false): void {
    if (!show) return;
    this.center.show({title:`${message.nickname || `UID ${message.uid}`} · ${roomName || "直播间"} · ${message.roomId} · ${eventLabel ?? (message.kind === "chatmsg" ? "发言" : message.kind === "uenter" ? "进场" : "礼物")}`,text:message.kind === "uenter" ? "进入直播间" : message.text,source:eventLabel ? "room" : "follow",uid:message.uid,roomId:message.roomId,...(!eventLabel ? {kind:message.kind,nickname:message.nickname}:{}),duration:15000,preview});
  }
  clear(roomEventsOnly = false): void { if (roomEventsOnly) this.center.clear("room"); else { this.center.clear("follow"); this.center.clear("room"); } }
  dispose(): void { this.center.dispose(); }
}
