import { notificationCenter } from "./notification-center.ts";
export type NoticeType = "info" | "success" | "warning" | "error";
export interface Notifier { info(message: string): void; success(message: string): void; warning(message: string): void; error(message: string): void }
export function createNotifier(document: Document, logger: Pick<Console, "log"> = console, timeoutMs = 4500): Notifier {
  const center = notificationCenter(document);
  const notify = (type: NoticeType, message: string): void => { logger.log("toast",type,message); center.show({title:({info:"提示",success:"完成",warning:"注意",error:"失败"})[type],text:message,source:"general",duration:timeoutMs}); };
  return {info:message=>notify("info",message),success:message=>notify("success",message),warning:message=>notify("warning",message),error:message=>notify("error",message)};
}
