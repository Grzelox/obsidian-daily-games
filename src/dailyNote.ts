/**
 * @fileoverview Writing game results into the daily note of the Daily notes core plugin.
 */

import { TFile, Vault, moment, normalizePath } from "obsidian";
import { appHasDailyNotesPluginLoaded, createDailyNote, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { insertUnderHeading } from "./markdown";

/** The part of a moment.js date this file uses. */
interface DayMoment {
	/**
	 * Formats the date with moment.js tokens.
	 *
	 * @param format A moment.js format such as `YYYY-MM-DD`.
	 * @return The formatted date.
	 */
	format(format: string): string;
}

/**
 * Obsidian's bundled moment.js, typed by hand.
 *
 * Obsidian's typings take moment's types from the `moment` package, which isn't
 * always installed where the plugin is checked; without it every call is `any`.
 */
const toMoment = moment as unknown as (date: Date) => DayMoment;

/** {@link createDailyNote}, typed by hand for the same reason as {@link toMoment}. */
const createNote = createDailyNote as unknown as (date: DayMoment) => Promise<TFile | undefined>;

/**
 * Appends a block of Markdown to the daily note for a day.
 *
 * Builds the note's path from the Daily notes settings instead of scanning the
 * daily notes folder, and creates the note from the user's template when it
 * doesn't exist yet.
 *
 * @param vault The vault holding the daily notes.
 * @param day The game day the block belongs to.
 * @param heading The heading the block goes under.
 * @param block The Markdown to append.
 * @return False when the Daily notes core plugin is off, true once written.
 */
export async function appendToDailyNote(vault: Vault, day: Date, heading: string, block: string): Promise<boolean> {
	if (!appHasDailyNotesPluginLoaded()) return false;
	const date = toMoment(day);
	const { folder, format } = getDailyNoteSettings();
	const path = normalizePath(`${folder ?? ""}/${date.format(format || "YYYY-MM-DD")}.md`);
	const file = vault.getFileByPath(path) ?? (await createNote(date));
	if (!file) throw new Error(`Could not create the daily note ${path}`);
	await vault.process(file, (content) => insertUnderHeading(content, heading, block));
	return true;
}
