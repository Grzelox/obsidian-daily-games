/**
 * @fileoverview Tests for the Markdown written into the daily note.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeInline, insertUnderHeading, resultBlock } from "../src/markdown";
import type { Game } from "../src/types";

const game: Game = {
	id: "spotle-movies",
	name: "Spotle Movies",
	url: "https://spotle.movie/",
	emoji: "🎬",
	color: "#d19a66",
	category: "Movies",
	blurb: "",
	image: "",
};

describe("resultBlock", () => {
	it("writes the result as plain text inside a callout", () => {
		assert.equal(
			resultBlock(game, "Spotle Movies #142\n🟨🟥🟩🟩 4/10"),
			["> [!success] 🎬 Spotle Movies", "> ```text", "> Spotle Movies #142", "> 🟨🟥🟩🟩 4/10", "> ```"].join("\n"),
		);
	});

	it("keeps code fences, embeds and HTML inert", () => {
		const hostile = "```dataviewjs\napp.vault.adapter.remove('x')\n```\n![x](https://evil.example/p.png)\n<img src=x onerror=alert(1)>";
		const block = resultBlock(game, hostile);
		const lines = block.split("\n");
		// The fence is longer than any backtick run in the result, so nothing inside can close it.
		assert.equal(lines[1], "> ````text");
		assert.equal(lines[lines.length - 1], "> ````");
		assert.ok(lines.every((line) => line.startsWith("> ")));
	});

	it("keeps the title on one line and escapes it", () => {
		const block = resultBlock({ ...game, name: "Evil\n## Heading ![x](y)" }, "ok");
		const [title] = block.split("\n");
		assert.equal(title, "> [!success] 🎬 Evil \\#\\# Heading \\!\\[x\\]\\(y\\)");
	});

	it("normalises Windows line endings", () => {
		assert.ok(!resultBlock(game, "a\r\nb").includes("\r"));
	});
});

describe("escapeInline", () => {
	it("escapes Markdown punctuation", () => {
		assert.equal(escapeInline("[[Note]] *x* `y` <b>"), "\\[\\[Note\\]\\] \\*x\\* \\`y\\` \\<b\\>");
	});
});

describe("insertUnderHeading", () => {
	const block = "> [!success] x";

	it("adds the heading to an empty note", () => {
		assert.equal(insertUnderHeading("", "## Daily games", block), `## Daily games\n\n${block}\n`);
	});

	it("adds the heading at the end when missing", () => {
		assert.equal(insertUnderHeading("# Today\n\nText\n", "## Daily games", block), `# Today\n\nText\n\n## Daily games\n\n${block}\n`);
	});

	it("appends to the end of an existing section", () => {
		assert.equal(
			insertUnderHeading("## Daily games\n\n> old\n\n## Notes\nhi", "## Daily games", block),
			`## Daily games\n\n> old\n\n${block}\n\n## Notes\nhi`,
		);
	});
});
