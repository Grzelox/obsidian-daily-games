/**
 * @fileoverview Building the Markdown that results are written into the daily note as.
 *
 * Results are pasted from web pages, so they are written as inert code: nothing
 * in them can become an embed, a link, HTML or a code block another plugin runs.
 */

import { LIMITS, multiLine, singleLine } from "./sanitize";
import type { Game } from "./types";

/**
 * Escapes the characters that give text meaning in inline Markdown.
 *
 * @param text Text on a single line.
 * @return The text with Markdown punctuation backslash-escaped.
 */
export function escapeInline(text: string): string {
	return text.replace(/[\\`*_[\]{}()<>#+!|~=$%^]/g, "\\$&");
}

/**
 * Formats a game's result as a callout holding a plain-text code block.
 *
 * The code fence is longer than any run of backticks in the result, so the
 * result can't close it early, and the title is escaped and kept on one line.
 *
 * @param game The game the result belongs to.
 * @param text The pasted share text.
 * @return A `[!success]` callout titled with the game's emoji and name.
 */
export function resultBlock(game: Game, text: string): string {
	const title = escapeInline(singleLine(`${game.emoji} ${game.name}`, LIMITS.name + LIMITS.emoji + 1, "Game"));
	const body = multiLine(text, LIMITS.result);
	const longestRun = Math.max(0, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length));
	const fence = "`".repeat(Math.max(3, longestRun + 1));
	const lines = [`[!success] ${title}`, `${fence}text`, ...body.split("\n"), fence];
	return lines.map((line) => `> ${line}`).join("\n");
}

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
