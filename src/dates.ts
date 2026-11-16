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

/** Streak lengths computed in one pass over the play history. */
export interface Streaks {
	/** Game ID to the days in a row that game was played. Games with no streak are absent. */
	perGame: Map<string, number>;
	/** Days in a row with at least one game played. */
	anyGame: number;
}

/**
 * Counts every game's streak, and the streak of days with any game played, in one pass.
 *
 * Walks back one day at a time from today and stops once every streak has ended,
 * so the cost grows with the longest streak, not with the number of games times
 * the history. A streak that ended yesterday is still alive until today is over.
 *
 * @param today The day key of the current game day.
 * @param plays Day key to the IDs of the games played that day.
 * @return The streak of each game and of any game.
 */
export function computeStreaks(today: string, plays: Record<string, string[]>): Streaks {
	const perGame = new Map<string, number>();
	const todays = new Set(plays[today] ?? []);
	const yesterday = addDays(today, -1);

	// Games whose streak is still running as we walk back; a game can start on today or yesterday.
	const counting = new Set<string>();
	for (const id of todays) counting.add(id);
	for (const id of plays[yesterday] ?? []) counting.add(id);
	for (const id of counting) perGame.set(id, todays.has(id) ? 1 : 0);

	let anyGame = todays.size > 0 ? 1 : 0;
	let anyAlive = true;
	for (let day = yesterday, guard = 0; (counting.size > 0 || anyAlive) && guard < 10_000; guard++) {
		const played = new Set(plays[day] ?? []);
		for (const id of counting) {
			if (played.has(id)) perGame.set(id, (perGame.get(id) ?? 0) + 1);
			else counting.delete(id);
		}
		if (anyAlive && played.size > 0) anyGame++;
		else anyAlive = false;
		day = addDays(day, -1);
	}
	for (const [id, days] of perGame) if (days === 0) perGame.delete(id);
	return { perGame, anyGame };
}
