/**
 * @fileoverview Tests for validation of the data file and form input.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkFromInput, safeColor, safeImageUrl, safeWebUrl, sanitizeData, sanitizeGame } from "../src/sanitize";
import { DEFAULT_GAMES, DEFAULT_SETTINGS } from "../src/types";

describe("safeWebUrl", () => {
	it("accepts http and https links", () => {
		assert.equal(safeWebUrl("https://krillion.io"), "https://krillion.io/");
		assert.equal(safeWebUrl("http://example.com/a?b=1"), "http://example.com/a?b=1");
	});

	it("rejects schemes that run code or open local files", () => {
		for (const url of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			" javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"file:///etc/passwd",
			"obsidian://open?vault=x",
			"vbscript:x",
			"app://local/x",
		]) {
			assert.equal(safeWebUrl(url), "", url);
		}
	});

	it("rejects credentials, relative links and non-strings", () => {
		assert.equal(safeWebUrl("https://user:pass@example.com"), "");
		assert.equal(safeWebUrl("/relative"), "");
		assert.equal(safeWebUrl(42), "");
		assert.equal(safeWebUrl("https://x.com/" + "a".repeat(3000)), "");
	});
});

describe("safeImageUrl", () => {
	it("accepts only https", () => {
		assert.equal(safeImageUrl("https://x.com/a.png"), "https://x.com/a.png");
		assert.equal(safeImageUrl("http://x.com/a.png"), "");
	});
});

describe("linkFromInput", () => {
	it("adds https:// when no scheme is typed", () => {
		assert.equal(linkFromInput("krillion.io"), "https://krillion.io/");
	});

	it("keeps rejecting dangerous schemes", () => {
		assert.equal(linkFromInput("javascript:alert(1)"), "");
		assert.equal(linkFromInput("http://x.com/a.png", true), "");
	});
});

describe("safeColor", () => {
	it("accepts hex colours only", () => {
		assert.equal(safeColor("#e06c75"), "#e06c75");
		assert.equal(safeColor("#abc"), "#abc");
		assert.equal(safeColor("url(https://evil.example/p.gif)"), "#888888");
		assert.equal(safeColor("red; background: url(x)"), "#888888");
		assert.equal(safeColor("var(--x)", "#000000"), "#000000");
	});
});

describe("sanitizeGame", () => {
	it("cleans every field", () => {
		const game = sanitizeGame({
			id: "Bad Id!",
			name: "  Line\none  ",
			url: "javascript:alert(1)",
			emoji: "🎬",
			color: "url(x)",
			category: 5,
			blurb: "x".repeat(500),
			image: "http://insecure.example/a.png",
		});
		assert.ok(game);
		assert.match(game.id, /^line-one-[a-z0-9]{1,4}$/);
		assert.equal(game.name, "Line one");
		assert.equal(game.url, "");
		assert.equal(game.color, "#888888");
		assert.equal(game.category, "");
		assert.equal(game.blurb.length, 200);
		assert.equal(game.image, "");
	});

	it("gives a name to unnamed games and ignores non-objects", () => {
		assert.equal(sanitizeGame({})?.name, "Untitled game");
		assert.equal(sanitizeGame("nope"), null);
		assert.equal(sanitizeGame(null), null);
	});
});

describe("sanitizeData", () => {
	it("returns defaults for missing or corrupt files", () => {
		for (const raw of [null, undefined, "x", 42, [], { settings: "x", plays: "x", results: 7 }]) {
			const data = sanitizeData(raw);
			assert.deepEqual(
				data.settings.games.map((g) => g.id),
				DEFAULT_GAMES.map((g) => g.id),
			);
			assert.deepEqual(data.plays, {});
			assert.deepEqual(data.results, {});
			assert.equal(data.unplayedOnly, false);
		}
	});

	it("keeps an empty game list the user chose", () => {
		assert.deepEqual(sanitizeData({ settings: { games: [] } }).settings.games, []);
	});

	it("validates settings fields", () => {
		const { settings } = sanitizeData({
			settings: {
				title: 123,
				openIn: "shell",
				markPlayedOnOpen: "yes",
				dayStartsAt: 99,
				logToDailyNote: false,
				dailyNoteHeading: "not a heading",
				games: [],
			},
		});
		assert.equal(settings.title, DEFAULT_SETTINGS.title);
		assert.equal(settings.openIn, DEFAULT_SETTINGS.openIn);
		assert.equal(settings.markPlayedOnOpen, DEFAULT_SETTINGS.markPlayedOnOpen);
		assert.equal(settings.dayStartsAt, DEFAULT_SETTINGS.dayStartsAt);
		assert.equal(settings.logToDailyNote, false);
		assert.equal(settings.dailyNoteHeading, DEFAULT_SETTINGS.dailyNoteHeading);
	});

	it("drops malformed history and prototype keys", () => {
		const raw = JSON.parse(
			'{"plays":{"2026-11-15":["krillion","krillion","__proto__",3],"__proto__":["x"],"bad":["krillion"],"2026-11-14":"x"},' +
				'"results":{"2026-11-15":{"krillion":"🟩\\r\\n🟨","__proto__":"x","farflung":""},"__proto__":{"a":"b"}}}',
		);
		const data = sanitizeData(raw);
		assert.deepEqual(Object.keys(data.plays), ["2026-11-15"]);
		assert.deepEqual(data.plays["2026-11-15"], ["krillion"]);
		assert.deepEqual(Object.keys(data.results), ["2026-11-15"]);
		assert.deepEqual(data.results["2026-11-15"], { krillion: "🟩\n🟨" });
		assert.equal(({} as Record<string, unknown>).x, undefined);
	});

	it("fixes duplicate game IDs", () => {
		const games = sanitizeData({ settings: { games: [{ id: "a", name: "A" }, { id: "a", name: "B" }] } }).settings.games;
		assert.equal(games.length, 2);
		assert.notEqual(games[0].id, games[1].id);
	});
});
