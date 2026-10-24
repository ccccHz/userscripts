import type { GmRequest } from './daily-automation.ts';
import { validUid } from './user-blocking.ts';

export const OFFICIAL_FOLLOW_SYNC_KEY = 'douyu-web-enhancer:official-follow-sync';
export const FOLLOW_SYNC_LIMIT = 5000;
export interface OfficialFollowUser { uid: string; nickname: string; safeUid: string }
export interface OfficialFollowAccount { uid: string; nickname: string; safeUid: string; updatedAt: number; checkedAt?: number; users: OfficialFollowUser[]; excluded: string[] }
export interface OfficialFollowState { schemaVersion: 1; enabled: boolean; accounts: OfficialFollowAccount[] }
export interface OfficialFollowPreview { account: OfficialFollowAccount; added: number; removed: number; overlap: number; excluded: number; baseAt: number }
export interface OfficialFollowView { enabled: boolean; busy: boolean; nickname: string; count: number; updatedAt: number; excluded: number; error: string; preview: { nickname: string; count: number; added: number; removed: number; overlap: number; excluded: number } | null }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const safeUid = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9]{6,32}$/.test(value);
export function currentFollowAccountUid(cookie: string): string | null {
  const match = /(?:^|;)\s*acf_uid=([^;]*)/.exec(cookie);
  try { const uid = decodeURIComponent(match?.[1] ?? ''); return validUid(uid) ? uid : null; } catch { return null; }
}
export function normalizeOfficialFollowState(value: unknown): OfficialFollowState {
  const source = object(value);
  const accounts: OfficialFollowAccount[] = [];
  if (source.schemaVersion === 1 && Array.isArray(source.accounts) && source.accounts.length <= 10) {
    for (const entry of source.accounts) {
      const account = object(entry);
      if (!validUid(String(account.uid ?? '')) || !safeUid(account.safeUid) || !Array.isArray(account.users) || account.users.length > FOLLOW_SYNC_LIMIT || !Array.isArray(account.excluded) || account.excluded.length > FOLLOW_SYNC_LIMIT) continue;
      const users: OfficialFollowUser[] = [];
      for (const item of account.users) {
        const user = object(item);
        if (!validUid(String(user.uid ?? '')) || !safeUid(user.safeUid) || typeof user.nickname !== 'string') break;
        users.push({ uid: String(user.uid), safeUid: user.safeUid, nickname: user.nickname.slice(0, 128) });
      }
      if (users.length !== account.users.length || new Set(users.map(user => user.uid)).size !== users.length || account.excluded.some(uid => typeof uid !== 'string' || !validUid(uid))) continue;
      const updatedAt = typeof account.updatedAt === 'number' && Number.isFinite(account.updatedAt) ? Math.max(0, account.updatedAt) : 0;
      accounts.push({ uid: String(account.uid), safeUid: account.safeUid, nickname: typeof account.nickname === 'string' ? account.nickname.slice(0, 128) : '', updatedAt, checkedAt: typeof account.checkedAt === 'number' && Number.isFinite(account.checkedAt) ? Math.max(0, account.checkedAt) : updatedAt, users, excluded: [...new Set(account.excluded as string[])] });
    }
  }
  return { schemaVersion: 1, enabled: source.schemaVersion === 1 && source.enabled === true, accounts };
}
export function effectiveFollowUids(manual: readonly string[], state: OfficialFollowState, owner: string | null): string[] {
  const account = state.enabled ? state.accounts.find(item => item.uid === owner) : undefined;
  const excluded = new Set(account?.excluded);
  return [...new Set([...manual, ...(account?.users.filter(user => !excluded.has(user.uid)).map(user => user.uid) ?? [])])];
}
export function previewOfficialFollows(account: OfficialFollowAccount, previous: OfficialFollowAccount | undefined, manual: readonly string[]): OfficialFollowPreview {
  const old = new Set(previous?.users.map(user => user.uid));
  const next = new Set(account.users.map(user => user.uid));
  const manualSet = new Set(manual);
  const exclusions = new Set(previous?.excluded);
  return { account: { ...account, excluded: [...exclusions] }, added: account.users.filter(user => !old.has(user.uid)).length, removed: [...old].filter(uid => !next.has(uid)).length, overlap: account.users.filter(user => manualSet.has(user.uid)).length, excluded: account.users.filter(user => exclusions.has(user.uid)).length, baseAt: previous?.updatedAt ?? 0 };
}
export async function readOfficialFollowList(request: GmRequest, owner: string, readOwner: () => string | null, now = () => Date.now()): Promise<OfficialFollowAccount> {
  if (!validUid(owner) || owner !== readOwner()) throw new Error('请先登录当前斗鱼账号');
  const started = now();
  const get = (url: string): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
    if (now() - started > 90_000 || owner !== readOwner()) { reject(new Error('同步已停止：账号变化或查询耗时过长')); return; }
    request({ method: 'GET', url, responseType: 'json', timeout: 12_000,
      onload(response) {
        if (response.status !== 200) { reject(new Error('关注列表读取失败，请稍后重试')); return; }
        try { resolve(object(typeof response.response === 'string' ? JSON.parse(response.response) : response.response)); } catch { reject(new Error('关注列表返回格式异常')); }
      }, onerror() { reject(new Error('关注列表网络失败，请检查 yuba.douyu.com 脚本权限')); }, ontimeout() { reject(new Error('关注列表读取超时，原名单保留')); }, onabort() { reject(new Error('关注列表读取已取消')); },
    });
  });
  const identity = await get('https://yuba.douyu.com/wgapi/yubanc/api/user/getCenterInfo');
  const account = object(identity.data);
  if (Number(identity.error) !== 0 || String(account.uid) !== owner || !safeUid(account.safe_uid) || typeof account.nickname !== 'string') throw new Error('无法核对当前账号，原同步名单保留');
  const users: OfficialFollowUser[] = [];
  const seen = new Set<string>();
  let expectedPages: number | undefined;
  for (let page = 1; page <= FOLLOW_SYNC_LIMIT / 20; page++) {
    const response = await get(`https://yuba.douyu.com/wbapi/web/user/followList/${account.safe_uid}?page=${page}&limit=20`);
    const data = object(response.data);
    if (Number(response.status_code) !== 200 || data.forbidden !== 0) throw new Error('官方拒绝读取关注列表，原名单保留；鱼吧封禁或隐私限制可能影响该接口');
    if (!Number.isInteger(data.count_page) || Number(data.count_page) < 0 || Number(data.count_page) > FOLLOW_SYNC_LIMIT / 20 || !Array.isArray(data.list) || data.list.length > 20 || ![0, 1].includes(Number(data.is_end))) throw new Error('关注列表不完整或超过 5000 人，原名单保留');
    if (expectedPages === undefined) expectedPages = Number(data.count_page);
    if (expectedPages !== Number(data.count_page)) throw new Error('关注列表分页发生变化，请重新检查');
    for (const item of data.list) {
      const user = object(item); const uid = String(user.uid ?? '');
      if (!validUid(uid) || !safeUid(user.safe_uid) || typeof user.nickname !== 'string' || seen.has(uid)) throw new Error('关注列表用户身份或分页重复异常，原名单保留');
      seen.add(uid); users.push({ uid, nickname: user.nickname.slice(0, 128), safeUid: user.safe_uid });
    }
    if (Number(data.is_end) === 1) {
      if (page !== Math.max(1, expectedPages) || owner !== readOwner()) throw new Error('关注列表缺页或账号变化，原名单保留');
      return { uid: owner, nickname: account.nickname.slice(0, 128), safeUid: account.safe_uid, updatedAt: now(), checkedAt: now(), users, excluded: [] };
    }
    if (!data.list.length || page >= expectedPages) throw new Error('关注列表未完整结束，原名单保留');
  }
  throw new Error('关注列表超过 5000 人，原名单保留');
}

interface SyncOptions {
  request: GmRequest; owner(): string | null; manual(): readonly string[];
  read(): Promise<unknown>; write(state: OfficialFollowState): Promise<void>;
  lock<T>(action: () => Promise<T>): Promise<T>;
  changed(): Promise<void>; now?: () => number;
}
/** One bounded check, atomic commit and an account-scoped exclusion list. */
export class OfficialFollowSync {
  state: OfficialFollowState = { schemaVersion: 1, enabled: false, accounts: [] };
  #preview: OfficialFollowPreview | null = null;
  #busy = false;
  #error = '';
  readonly #options: SyncOptions;
  constructor(options: SyncOptions) { this.#options = options; }
  account(): OfficialFollowAccount | undefined { return this.state.accounts.find(item => item.uid === this.#options.owner()); }
  async reload(): Promise<void> { this.state = normalizeOfficialFollowState(await this.#options.read()); }
  view(): OfficialFollowView {
    const account = this.account(); const preview = this.#preview?.account.uid === this.#options.owner() ? this.#preview : null;
    return { enabled: this.state.enabled, busy: this.#busy, nickname: account?.nickname ?? '', count: account?.users.length ?? 0, updatedAt: account?.updatedAt ?? 0, excluded: account?.excluded.length ?? 0, error: this.#error, preview: preview ? { nickname: preview.account.nickname, count: preview.account.users.length, added: preview.added, removed: preview.removed, overlap: preview.overlap, excluded: preview.excluded } : null };
  }
  async #change(change: (state: OfficialFollowState) => OfficialFollowState): Promise<void> {
    await this.#options.lock(async () => {
      const latest = normalizeOfficialFollowState(await this.#options.read());
      const next = change(latest);
      await this.#options.write(next); this.state = next;
    });
    await this.#options.changed();
  }
  setEnabled(enabled: boolean): Promise<void> { return this.#change(state => ({ ...state, enabled })); }
  async exclude(uid: string, excluded: boolean): Promise<void> {
    if (!validUid(uid)) throw new Error('无法识别用户 UID');
    const owner = this.#options.owner();
    await this.#change(state => ({ ...state, accounts: state.accounts.map(account => {
      if (account.uid !== owner || (excluded && !account.users.some(user => user.uid === uid))) return account;
      const next = excluded ? [...new Set([...account.excluded, uid])] : account.excluded.filter(item => item !== uid);
      if (next.length > FOLLOW_SYNC_LIMIT) throw new Error('排除名单已满');
      return { ...account, excluded: next };
    }) }));
  }
  async restoreExcluded(): Promise<void> { const owner = this.#options.owner(); await this.#change(state => ({ ...state, accounts: state.accounts.map(account => account.uid === owner ? { ...account, excluded: [] } : account) })); }
  discard(): void { this.#preview = null; }
  async check(automatic = false): Promise<void> {
    if (this.#busy) return;
    if (automatic && (!this.state.enabled || !this.account() || (this.#options.now?.() ?? Date.now()) - (this.account()!.checkedAt ?? this.account()!.updatedAt) < 86_400_000)) return;
    const owner = this.#options.owner();
    if (!owner) { this.#error = '请先登录当前斗鱼账号'; await this.#options.changed(); return; }
    this.#busy = true; this.#error = ''; this.#preview = null; await this.#options.changed();
    try {
      await this.#options.lock(async () => {
        await this.reload();
        const previous = this.account();
        const now = this.#options.now?.() ?? Date.now();
        if (automatic && (!this.state.enabled || !previous || now - (previous.checkedAt ?? previous.updatedAt) < 86_400_000)) return;
        // Persist the attempt under the same cross-tab lock, including failures.
        if (previous) {
          const attempted = { ...this.state, accounts: this.state.accounts.map(item => item.uid === owner ? { ...item, checkedAt: now } : item) };
          await this.#options.write(attempted); this.state = attempted;
        }
        const account = await readOfficialFollowList(this.#options.request, owner, this.#options.owner, this.#options.now);
        const preview = previewOfficialFollows(account, previous, this.#options.manual());
        this.#preview = preview;
        // First import, empty lists and substantial removals require review.
        if (automatic && previous && account.users.length > 0 && preview.removed <= Math.max(5, Math.floor(previous.users.length / 10))) {
          const next = this.#replace(this.state, preview);
          await this.#options.write(next); this.state = next; this.#preview = null;
        }
      });
    } catch (error) { this.#error = error instanceof Error ? error.message : '关注同步失败，原名单保留'; }
    finally { this.#busy = false; await this.#options.changed(); }
  }
  #replace(state: OfficialFollowState, preview: OfficialFollowPreview): OfficialFollowState {
    if (this.#options.owner() !== preview.account.uid) throw new Error('账号已变化，请重新检查');
    const previous = state.accounts.find(item => item.uid === preview.account.uid);
    if ((previous?.updatedAt ?? 0) !== preview.baseAt) throw new Error('其他页面已更新名单，请重新检查');
    if (!previous && state.accounts.length >= 10) throw new Error('已保存 10 个账号，无法添加更多同步账号');
    return { ...state, accounts: [...state.accounts.filter(item => item.uid !== preview.account.uid), { ...preview.account, excluded: previous?.excluded ?? [] }] };
  }
  async apply(): Promise<void> {
    const preview = this.#preview;
    if (!preview || this.#busy) throw new Error('请先检查关注列表');
    await this.#change(state => this.#replace(state, preview)); this.#preview = null;
    await this.#options.changed();
  }
}
