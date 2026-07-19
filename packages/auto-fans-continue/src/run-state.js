export const CHECKED_DATE_KEY = "Ex_DailyAuto_LastTime";
export const RUNNING_LOCK_KEY = "Ex_DailyAuto_RunningLock";
export const RUNNING_LOCK_TTL_MS = 10 * 60 * 1000;

export function checkDateEquals(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function getLastCheckedDay(storage) {
    const storedValue = storage.getItem(CHECKED_DATE_KEY);
    const fallbackDate = new Date("2000-01-01T00:00:00");
    if (!storedValue) return fallbackDate;

    const storedDate = new Date(storedValue);
    return Number.isNaN(storedDate.getTime()) ? fallbackDate : storedDate;
}

export function shouldRunToday(storage, today = new Date()) {
    return !checkDateEquals(getLastCheckedDay(storage), today);
}

export function markChecked(storage, date = new Date()) {
    storage.setItem(CHECKED_DATE_KEY, date.toISOString());
}

function parseLock(storedValue) {
    if (!storedValue) return null;

    try {
        return JSON.parse(storedValue);
    } catch {
        return null;
    }
}

function createLockToken(date) {
    return `${date.toISOString()}-${Math.random().toString(36).slice(2)}`;
}

export function acquireRunningLock(
    storage,
    now = new Date(),
    ttlMs = RUNNING_LOCK_TTL_MS,
) {
    const storedLock = parseLock(storage.getItem(RUNNING_LOCK_KEY));
    const lockedAt = new Date(storedLock?.lockedAt ?? "");
    const hasActiveLock =
        storedLock?.token &&
        !Number.isNaN(lockedAt.getTime()) &&
        now.getTime() - lockedAt.getTime() <= ttlMs;

    if (hasActiveLock) return null;

    const token = createLockToken(now);
    storage.setItem(
        RUNNING_LOCK_KEY,
        JSON.stringify({ token, lockedAt: now.toISOString() }),
    );
    return token;
}

export function releaseRunningLock(storage, token) {
    const storedLock = parseLock(storage.getItem(RUNNING_LOCK_KEY));
    if (storedLock?.token !== token) return;

    storage.removeItem(RUNNING_LOCK_KEY);
}
