/**
 * @fileoverview Validation of everything read from the data file or typed into forms.
 *
 * The data file can arrive through sync from another device and game links are
 * often pasted from the web, so none of it is trusted: every field is checked
 * for type, length and format, and anything invalid falls back to a default.
 */

import { DEFAULT_GAMES, DEFAULT_SETTINGS, newGameId, type Game, type OpenIn, type PluginData, type Settings } from "./types";

/** Longest accepted value of each text field, in characters. */
export const LIMITS = {
	title: 80,
	heading: 120,
	name: 80,
	emoji: 16,
	category: 40,
	blurb: 200,
	url: 2048,
	result: 4000,
	games: 200,
} as const;

/** Colour used when a game's colour is missing or invalid. */
export const FALLBACK_COLOR = "#888888";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MARKDOWN_HEADING = /^#{1,6} \S/;
const OPEN_IN: readonly OpenIn[] = ["webviewer", "browser"];

/**
 * Tells whether a value is a plain object (not null and not an array).
 *
 * @param value The value to check.
 * @return True for objects that can be read field by field.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes control characters other than tab and newline.
 *
 * @param value The text to clean.
 * @return The text without control characters.
 */
function stripControl(value: string): string {
	// eslint-disable-next-line no-control-regex -- matching control characters is the point
	return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, "");
}

/**
 * Cleans a single-line text field.
 *
 * @param value The raw value; anything but a string gives the fallback.
 * @param max The longest accepted length.
 * @param fallback The value used when the result is empty.
 * @return The text on one line, trimmed and cut to `max` characters.
 */
export function singleLine(value: unknown, max: number, fallback = ""): string {
	if (typeof value !== "string") return fallback;
	const text = stripControl(value.replace(/\s+/g, " ")).trim().slice(0, max).trim();
	return text || fallback;
}

/**
 * Cleans a multi-line text field such as a pasted result.
 *
 * @param value The raw value; anything but a string gives an empty string.
 * @param max The longest accepted length.
 * @return The text with `\n` line endings, no control characters, trimmed and cut to `max`.
 */
export function multiLine(value: unknown, max: number): string {
	if (typeof value !== "string") return "";
	return stripControl(value.replace(/\r\n?/g, "\n")).trim().slice(0, max).trimEnd();
}

/**
 * Accepts only absolute `http:` and `https:` links without embedded credentials.
 *
 * Blocks `javascript:`, `file:`, `data:`, `obsidian:` and other schemes that could
 * run code or open local files when clicked.
 *
 * @param value The raw value.
 * @param protocols The accepted protocols.
 * @return The normalised link, or an empty string when the link is not accepted.
 */
export function safeWebUrl(value: unknown, protocols: readonly string[] = ["http:", "https:"]): string {
	if (typeof value !== "string") return "";
	const input = value.trim();
	if (!input || input.length > LIMITS.url) return "";
	try {
		const url = new URL(input);
		if (!protocols.includes(url.protocol) || url.username || url.password) return "";
		return url.href;
	} catch {
		return "";
	}
}

/**
 * Accepts only `https:` image links, so cover images never load over plain HTTP or from local files.
 *
 * @param value The raw value.
 * @return The normalised link, or an empty string when the link is not accepted.
 */
export function safeImageUrl(value: unknown): string {
	return safeWebUrl(value, ["https:"]);
}

/**
 * Turns what a user typed into a link, adding `https://` when no scheme is given.
 *
 * @param value What the user typed, e.g. `krillion.io`.
 * @param image Whether the link is for a cover image, which must be `https:`.
 * @return The accepted link, or an empty string when it is not a web link.
 */
export function linkFromInput(value: string, image = false): string {
	const input = value.trim();
	if (!input) return "";
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`;
	return image ? safeImageUrl(withScheme) : safeWebUrl(withScheme);
}

/**
 * Accepts only hex colours, so a colour can't smuggle `url(...)` or other CSS into the page.
 *
 * @param value The raw value.
 * @param fallback The colour used when the value is not accepted.
 * @return A hex colour such as `#e06c75`.
 */
export function safeColor(value: unknown, fallback = FALLBACK_COLOR): string {
	return typeof value === "string" && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}

/**
 * Tells whether a value is a well-formed game ID.
 *
 * IDs are lowercase slugs, which also rules out keys like `__proto__`.
 *
 * @param value The value to check.
 * @return True when the value can be used as a game ID.
 */
export function isGameId(value: unknown): value is string {
	return typeof value === "string" && GAME_ID.test(value);
}

/**
 * Cleans one game.
 *
 * @param raw The raw game.
 * @return The game with every field valid, or null when `raw` isn't an object.
 */
export function sanitizeGame(raw: unknown): Game | null {
	if (!isRecord(raw)) return null;
	const name = singleLine(raw.name, LIMITS.name, "Untitled game");
	return {
		id: isGameId(raw.id) ? raw.id : newGameId(name),
		name,
		url: safeWebUrl(raw.url),
		emoji: singleLine(raw.emoji, LIMITS.emoji),
		color: safeColor(raw.color),
		category: singleLine(raw.category, LIMITS.category),
		blurb: singleLine(raw.blurb, LIMITS.blurb),
		image: safeImageUrl(raw.image),
	};
}

/**
 * Cleans a list of games, dropping invalid entries and fixing duplicate IDs.
 *
 * @param raw The raw list.
 * @return The cleaned games, at most {@link LIMITS.games} of them.
 */
function sanitizeGames(raw: unknown[]): Game[] {
	const seen = new Set<string>();
	const games: Game[] = [];
	for (const entry of raw.slice(0, LIMITS.games)) {
		const game = sanitizeGame(entry);
		if (!game) continue;
		if (seen.has(game.id)) game.id = newGameId(game.name);
		seen.add(game.id);
		games.push(game);
	}
	return games;
}

/**
 * Cleans the settings.
 *
 * @param raw The raw settings.
 * @return Valid settings; missing or invalid fields take their defaults.
 */
function sanitizeSettings(raw: unknown): Settings {
	const s = isRecord(raw) ? raw : {};
	const heading = singleLine(s.dailyNoteHeading, LIMITS.heading);
	return {
		title: singleLine(s.title, LIMITS.title, DEFAULT_SETTINGS.title),
		games: Array.isArray(s.games) ? sanitizeGames(s.games) : DEFAULT_GAMES.map((g) => ({ ...g })),
		openIn: OPEN_IN.includes(s.openIn as OpenIn) ? (s.openIn as OpenIn) : DEFAULT_SETTINGS.openIn,
		markPlayedOnOpen: typeof s.markPlayedOnOpen === "boolean" ? s.markPlayedOnOpen : DEFAULT_SETTINGS.markPlayedOnOpen,
		dayStartsAt:
			Number.isInteger(s.dayStartsAt) && (s.dayStartsAt as number) >= 0 && (s.dayStartsAt as number) <= 6
				? (s.dayStartsAt as number)
				: DEFAULT_SETTINGS.dayStartsAt,
		logToDailyNote: typeof s.logToDailyNote === "boolean" ? s.logToDailyNote : DEFAULT_SETTINGS.logToDailyNote,
		dailyNoteHeading: MARKDOWN_HEADING.test(heading) ? heading : DEFAULT_SETTINGS.dailyNoteHeading,
	};
}

/**
 * Cleans the play history.
 *
 * @param raw The raw history.
 * @return Day keys mapped to unique, well-formed game IDs.
 */
function sanitizePlays(raw: unknown): Record<string, string[]> {
	const plays: Record<string, string[]> = {};
	if (!isRecord(raw)) return plays;
	for (const [day, ids] of Object.entries(raw)) {
		if (!DAY_KEY.test(day) || !Array.isArray(ids)) continue;
		const valid = [...new Set(ids.filter(isGameId))];
		if (valid.length) plays[day] = valid;
	}
	return plays;
}

/**
 * Cleans the saved results.
 *
 * @param raw The raw results.
 * @return Day keys mapped to game IDs mapped to non-empty result text.
 */
function sanitizeResults(raw: unknown): Record<string, Record<string, string>> {
	const results: Record<string, Record<string, string>> = {};
	if (!isRecord(raw)) return results;
	for (const [day, byGame] of Object.entries(raw)) {
		if (!DAY_KEY.test(day) || !isRecord(byGame)) continue;
		const valid: Record<string, string> = {};
		for (const [id, text] of Object.entries(byGame)) {
			const clean = multiLine(text, LIMITS.result);
			if (isGameId(id) && clean) valid[id] = clean;
		}
		if (Object.keys(valid).length) results[day] = valid;
	}
	return results;
}

/**
 * Cleans the whole data file.
 *
 * Never throws: a missing, corrupt or hostile file gives a valid state with defaults.
 *
 * @param raw What `loadData()` returned.
 * @return A state the plugin can use safely.
 */
export function sanitizeData(raw: unknown): PluginData {
	const data = isRecord(raw) ? raw : {};
	return {
		settings: sanitizeSettings(data.settings),
		plays: sanitizePlays(data.plays),
		results: sanitizeResults(data.results),
		unplayedOnly: data.unplayedOnly === true,
	};
}
