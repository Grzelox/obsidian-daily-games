/**
 * @fileoverview Tests for game days and streaks.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, computeStreaks, dayKey } from "../src/dates";

const today = "2026-11-15";
const ago = (n: number) => addDays(today, -n);

describe("dayKey", () => {
	it("counts the hours before dayStartsAt as the previous day", () => {
		assert.equal(dayKey(new Date(2026, 10, 15, 3, 0), 4), "2026-11-14");
		assert.equal(dayKey(new Date(2026, 10, 15, 4, 0), 4), "2026-11-15");
	});
});

describe("addDays", () => {
	it("crosses month and year boundaries", () => {
		assert.equal(addDays("2026-03-01", -1), "2026-02-28");
		assert.equal(addDays("2026-12-31", 1), "2027-01-01");
	});
});

describe("computeStreaks", () => {
	it("counts consecutive days per game and for any game", () => {
		const plays = {
			[today]: ["a", "b"],
			[ago(1)]: ["a"],
			[ago(2)]: ["a", "b"],
			[ago(3)]: ["c"],
		};
		const { perGame, anyGame } = computeStreaks(today, plays);
		assert.equal(perGame.get("a"), 3);
		assert.equal(perGame.get("b"), 1);
		assert.equal(perGame.get("c"), undefined);
		assert.equal(anyGame, 4);
	});

	it("keeps a streak alive until today is over", () => {
		const plays = { [today]: ["a"], [ago(1)]: ["b"], [ago(2)]: ["b"] };
		const { perGame, anyGame } = computeStreaks(today, plays);
		assert.equal(perGame.get("b"), 2);
		assert.equal(anyGame, 3);
		assert.equal(computeStreaks(today, { [ago(1)]: ["b"] }).anyGame, 1);
	});

	it("ends streaks after a missed day", () => {
		const { perGame, anyGame } = computeStreaks(today, { [ago(2)]: ["a"], [ago(3)]: ["a"] });
		assert.equal(perGame.size, 0);
		assert.equal(anyGame, 0);
	});

	it("stays fast for long streaks", () => {
		const plays: Record<string, string[]> = {};
		const ids = Array.from({ length: 30 }, (_, i) => `game-${i}`);
		for (let i = 0; i < 1100; i++) plays[ago(i)] = ids;
		const start = performance.now();
		const { perGame, anyGame } = computeStreaks(today, plays);
		const ms = performance.now() - start;
		assert.equal(anyGame, 1100);
		assert.equal(perGame.get("game-0"), 1100);
		assert.ok(ms < 100, `took ${ms.toFixed(1)} ms`);
	});
});
