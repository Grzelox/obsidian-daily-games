/**
 * @fileoverview Writing game results into the daily note of the Daily notes core plugin.
 */

import { Vault, moment, normalizePath } from "obsidian";
import { appHasDailyNotesPluginLoaded, createDailyNote, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { insertUnderHeading } from "./markdown";

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
	const date = moment(day);
	const { folder, format } = getDailyNoteSettings();
	const path = normalizePath(`${folder ?? ""}/${date.format(format || "YYYY-MM-DD")}.md`);
	const file = vault.getFileByPath(path) ?? (await createDailyNote(date));
	if (!file) throw new Error(`Could not create the daily note ${path}`);
	await vault.process(file, (content) => insertUnderHeading(content, heading, block));
	return true;
}
