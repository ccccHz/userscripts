import assert from 'node:assert/strict';
import test from 'node:test';
import { currentFollowAccountUid, normalizeOfficialFollowState, effectiveFollowUids, previewOfficialFollows, readOfficialFollowList, OfficialFollowSync } from '../packages/douyu-web-enhancer/src/features/official-follow-sync.ts';
import { UserBlockHistory } from '../packages/douyu-web-enhancer/src/features/user-block-history.ts';

const member = uid => ({ uid: String(uid), nickname: `user ${uid}`, safeUid: `safeId${uid}` });
const account = (ids = [2, 3], at = 1000) => ({ uid: '1', nickname: 'owner', safeUid: 'ownerId1', updatedAt: at, users: ids.map(member), excluded: [] });
const identity = { error: 0, data: { uid: 1, nickname: 'owner', safe_uid: 'ownerId1' } };
const page = (ids, end = 1, pages = 1) => ({ status_code: 200, data: { forbidden: 0, count_page: pages, is_end: end, list: ids.map(id => ({ uid: id, nickname: `user ${id}`, safe_uid: `safeId${id}` })) } });
const api = responses => details => details.onload({ status: 200, response: responses.shift() });

test('manual overlap, per-account pause, exclusion and official unfollow do not erase manual ownership', () => {
  assert.equal(currentFollowAccountUid('x=1; acf_uid=123; y=2'), '123');
  assert.equal(currentFollowAccountUid('acf_uid=001'), null);
  const state = normalizeOfficialFollowState({ schemaVersion: 1, enabled: true, accounts: [account()] });
  assert.deepEqual(effectiveFollowUids(['2', '4'], state, '1'), ['2', '4', '3']);
  assert.deepEqual(effectiveFollowUids(['2'], state, '99'), ['2']);
  assert.deepEqual(effectiveFollowUids(['2'], { ...state, enabled: false }, '1'), ['2']);
  const next = previewOfficialFollows(account([3, 5], 2000), state.accounts[0], ['2', '3']);
  assert.equal(next.added, 1); assert.equal(next.removed, 1); assert.equal(next.overlap, 1);
  assert.deepEqual(effectiveFollowUids(['2'], { ...state, accounts: [next.account] }, '1'), ['2', '3', '5']);
  state.accounts[0].excluded = ['3'];
  assert.deepEqual(effectiveFollowUids(['2'], state, '1'), ['2']);
});
test('bulk name refresh uses the most recent pending name even at the same millisecond', async () => {
  const history = new UserBlockHistory(null, 50);
  await history.setRules([{ uid: '2', roomId: null }]);
  history.rememberNickname('2', 'old', 1000);
  await history.flush();
  history.rememberNickname('2', 'new', 1000);
  history.rememberNickname('2', 'old', 1000);
  assert.equal(history.snapshot()[0].nickname, 'old');
  history.dispose();
});

test('reader verifies owner then merges all pages; rejects forbidden, changed account, duplicate or incomplete pages', async () => {
  const first = Array.from({ length: 20 }, (_, i) => i + 2);
  const seen = [];
  const responses = [identity, page(first, 0, 2), page([22], 1, 2)];
  const result = await readOfficialFollowList(details => { seen.push(details); api(responses)(details); }, '1', () => '1', () => 1000);
  assert.equal(result.users.length, 21);
  assert.equal(seen[0].url, 'https://yuba.douyu.com/wgapi/yubanc/api/user/getCenterInfo');
  assert.ok(seen.every(details => details.method === 'GET'));
  assert.match(seen[2].url, /followList\/ownerId1\?page=2&limit=20$/);
  await assert.rejects(readOfficialFollowList(api([identity, { status_code: 200, data: { forbidden: 1 } }]), '1', () => '1'), /官方拒绝/);
  await assert.rejects(readOfficialFollowList(api([identity, page(first, 0, 2), page([2], 1, 2)]), '1', () => '1'), /重复/);
  await assert.rejects(readOfficialFollowList(api([identity, page(first, 1, 2)]), '1', () => '1'), /缺页/);
  await assert.rejects(readOfficialFollowList(api([identity, page(first, 0, 2), page([22], 1, 3)]), '1', () => '1'), /分页发生变化/);
  await assert.rejects(readOfficialFollowList(api([{ ...identity, data: { ...identity.data, uid: 99 } }]), '1', () => '1'), /核对当前账号/);
  let owner = '1';
  await assert.rejects(readOfficialFollowList(details => { details.onload({ status: 200, response: identity }); owner = '99'; }, '1', () => owner), /账号变化/);
});

test('sync previews first, persists only on apply, preserves snapshot on failure and excludes across subsequent syncs', async () => {
  let disk = { schemaVersion: 1, enabled: false, accounts: [] };
  let responses = [identity, page([2, 3])];
  let changes = 0;
  const sync = new OfficialFollowSync({ request: details => api(responses)(details), owner: () => '1', manual: () => ['2'], read: async () => structuredClone(disk), write: async next => { disk = structuredClone(next); }, lock: action => action(), changed: async () => { changes++; }, now: () => 2000 });
  await sync.reload(); await sync.check(true); assert.equal(responses.length, 2);
  await sync.check(); assert.equal(sync.view().preview.overlap, 1); assert.equal(disk.accounts.length, 0);
  await sync.apply(); assert.equal(disk.accounts[0].users.length, 2); assert.equal(disk.enabled, false);
  await sync.setEnabled(true); await sync.exclude('3', true);
  assert.deepEqual(effectiveFollowUids(['2'], disk, '1'), ['2']);
  responses = [identity, page([2, 3, 4])]; await sync.check(); await sync.apply();
  assert.deepEqual(disk.accounts[0].excluded, ['3']);
  const before = structuredClone(disk);
  responses = [identity, { status_code: 403 }]; await sync.check();
  assert.match(sync.view().error, /官方拒绝/); assert.deepEqual(disk, before);
  await sync.restoreExcluded(); assert.deepEqual(disk.accounts[0].excluded, []);
  assert.ok(changes > 0);
});

test('empty or large automatic removals need preview; account change and concurrent snapshot invalidate apply', async () => {
  let owner = '1', clock = 100_000_000;
  let disk = { schemaVersion: 1, enabled: true, accounts: [account(Array.from({ length: 20 }, (_, i) => i + 2))] };
  let responses = [identity, page([])];
  const sync = new OfficialFollowSync({ request: details => api(responses)(details), owner: () => owner, manual: () => [], read: async () => structuredClone(disk), write: async next => { disk = next; }, lock: action => action(), changed: async () => {}, now: () => clock });
  await sync.reload(); await sync.check(true); assert.equal(disk.accounts[0].users.length, 20); assert.equal(sync.view().preview.removed, 20);
  owner = '99'; await assert.rejects(sync.apply(), /账号已变化/); assert.equal(sync.view().preview, null);
  owner = '1'; disk.accounts[0].updatedAt = 2000; await assert.rejects(sync.apply(), /其他页面/);
  sync.discard(); responses = [identity, page([2, 3])]; await sync.check(); await sync.apply();
  clock += 86_400_001; responses = [identity, page([2, 3, 4])]; await sync.check(true);
  assert.equal(sync.view().preview, null); assert.equal(disk.accounts[0].users.length, 3);
  await sync.check(true); assert.equal(sync.view().error, '');
});

test('two tabs serialize checks; a failed automatic attempt also enforces the 24-hour cooldown', async () => {
  let disk = { schemaVersion: 1, enabled: true, accounts: [account()] };
  let clock = 100_000_000, calls = 0;
  let queue = Promise.resolve();
  const lock = action => { const run = queue.then(action); queue = run.catch(() => {}); return run; };
  const make = () => new OfficialFollowSync({
    request: details => { calls++; details.onload({ status: 200, response: details.url.endsWith('getCenterInfo') ? identity : { status_code: 403 } }); },
    owner: () => '1', manual: () => [], read: async () => structuredClone(disk), write: async next => { disk = structuredClone(next); }, lock, changed: async () => {}, now: () => clock,
  });
  const a = make(), b = make(); await Promise.all([a.reload(), b.reload()]);
  await Promise.all([a.check(true), b.check(true)]);
  assert.equal(calls, 2); assert.deepEqual(disk.accounts[0].users, account().users);
  clock += 1000; await a.check(true); assert.equal(calls, 2);
  clock += 86_400_000; await a.check(true); assert.equal(calls, 4);
});
