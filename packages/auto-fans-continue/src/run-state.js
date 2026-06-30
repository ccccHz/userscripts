export const CHECKED_DATE_KEY = "Ex_DailyAuto_LastTime";

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
