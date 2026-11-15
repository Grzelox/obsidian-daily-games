/**
 * @fileoverview Writing game results into the daily note of the Daily notes core plugin.
 */

import { Vault, moment } from "obsidian";
import {
	appHasDailyNotesPluginLoaded,
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
} from "obsidian-daily-notes-interface";
import type { Game } from "./types";

/**
 * Inserts a block of Markdown at the end of the section under a heading.
 *
 * The section ends at the next heading of the same or a higher level. When the
 * heading is missing, it is added at the end of the note with the block under it.
 *
 * @param content The note's Markdown.
 * @param heading The heading line, e.g. `## Daily games`.
 * @param block The Markdown to insert.
 * @return The note's new Markdown.
 */
export function insertUnderHeading(content: string, heading: string, block: string): string {
	const target = heading.trim();
	const lines = content.split("\n");
	const level = target.match(/^#+/)?.[0].length ?? 0;
	const index = lines.findIndex((line) => line.trim() === target);
	if (index === -1) {
		const trimmed = content.replace(/\s+$/, "");
		return (trimmed ? trimmed + "\n\n" : "") + target + "\n\n" + block + "\n";
	}

	let end = lines.length;
	for (let i = index + 1; i < lines.length; i++) {
		const match = lines[i].match(/^(#+)\s/);
		if (match && (level === 0 || match[1].length <= level)) {
			end = i;
			break;
		}
	}
	// Insert above the blank lines that close the section, not below them.
	let insertAt = end;
	while (insertAt > index + 1 && lines[insertAt - 1].trim() === "") insertAt--;

	const rest = lines.slice(end);
	const out = [...lines.slice(0, insertAt), "", ...block.split("\n"), ...(rest.length ? ["", ...rest] : [])];
	return out.join("\n") + (rest.length ? "" : "\n");
}

/**
 * Formats a game's result as a callout.
 *
 * @param game The game the result belongs to.
 * @param text The pasted share text.
 * @return A `[!success]` callout titled with the game's emoji and name.
 */
export function resultBlock(game: Game, text: string): string {
	const title = `${game.emoji ? game.emoji + " " : ""}${game.name}`;
	const body = text
		.trim()
		.split("\n")
		.map((line) => `> ${line}`);
	return [`> [!success] ${title}`, ...body].join("\n");
}

/**
 * Appends a result block to the daily note for a day.
 *
 * Creates the daily note from the user's template when it doesn't exist yet.
 *
 * @param vault The vault holding the daily notes.
 * @param day The game day the result belongs to.
 * @param heading The heading the block goes under.
 * @param block The Markdown to append.
 * @return False when the Daily notes core plugin is off, true once written.
 */
export async function appendResult(vault: Vault, day: Date, heading: string, block: string): Promise<boolean> {
	if (!appHasDailyNotesPluginLoaded()) return false;
	const date = moment(day);
	const file = getDailyNote(date, getAllDailyNotes()) ?? (await createDailyNote(date));
	await vault.process(file, (content) => insertUnderHeading(content, heading, block));
	return true;
}
