/**
 * @fileoverview Game-day arithmetic on YYYY-MM-DD day keys in local time.
 */

/**
 * Pads a number to two digits.
 *
 * @param n The number to pad.
 * @return The number as a string of at least two digits.
 */
function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * Formats a date as a day key.
 *
 * @param date The date to format, read in local time.
 * @return The day key, e.g. `2026-11-15`.
 */
function format(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Returns the game day a moment belongs to.
 *
 * Before `dayStartsAt` o'clock the moment still counts as the previous day,
 * so a late-night session belongs to the day it started on.
 *
 * @param date The moment to classify.
 * @param dayStartsAt Hour (0–6) at which a new game day starts.
 * @return The day key of the game day.
 */
export function dayKey(date: Date, dayStartsAt = 0): string {
	return format(new Date(date.getTime() - dayStartsAt * 3_600_000));
}

/**
 * Parses a day key into a date at local midnight.
 *
 * @param key A day key in YYYY-MM-DD form.
 * @return The date at the start of that day.
 */
export function parseKey(key: string): Date {
	const [year, month, day] = key.split("-").map(Number);
	return new Date(year, month - 1, day);
}

/**
 * Moves a day key by a number of days.
 *
 * @param key The day key to start from.
 * @param n Days to add; negative to go back.
 * @return The resulting day key.
 */
export function addDays(key: string, n: number): string {
	const date = parseKey(key);
	date.setDate(date.getDate() + n);
	return format(date);
}

/**
 * Counts the consecutive days, ending today, on which `hit` is true.
 *
 * A streak that ended yesterday is still alive until today is over, so the
 * count starts from yesterday when today has no hit yet.
 *
 * @param today The day key of the current game day.
 * @param hit Whether a given day counts towards the streak.
 * @return The length of the streak in days.
 */
export function streak(today: string, hit: (day: string) => boolean): number {
	let day = hit(today) ? today : addDays(today, -1);
	let count = 0;
	while (hit(day) && count < 10_000) {
		count++;
		day = addDays(day, -1);
	}
	return count;
}
