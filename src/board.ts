/**
 * @fileoverview The games board: masthead, category chips and the grid of game cards.
 *
 * The board only draws. It reads state from and reports clicks to a {@link BoardHost},
 * which is the plugin, so the same board can sit in a tab or in a note.
 */

import { setIcon } from "obsidian";
import { parseKey } from "./dates";
import type { Game } from "./types";

/** State and actions a board needs from its owner. */
export interface BoardHost {
	/** Title of the masthead. */
	readonly title: string;
	/** Games in board order. */
	readonly games: Game[];
	/** Whether games already played today are hidden. */
	readonly unplayedOnly: boolean;

	/**
	 * Returns the current game day.
	 *
	 * @return The day key, e.g. `2026-11-15`.
	 */
	today(): string;

	/**
	 * Tells whether a game was played today.
	 *
	 * @param id The game's ID.
	 * @return True when the game is marked played.
	 */
	isPlayed(id: string): boolean;

	/**
	 * Returns the share text saved for a game today.
	 *
	 * @param id The game's ID.
	 * @return The saved text, or undefined when there is none.
	 */
	result(id: string): string | undefined;

	/**
	 * Counts the days in a row a game has been played.
	 *
	 * @param id The game's ID.
	 * @return The streak in days.
	 */
	gameStreak(id: string): number;

	/**
	 * Counts the days in a row with at least one game played.
	 *
	 * @return The streak in days.
	 */
	dayStreak(): number;

	/**
	 * Marks a game played or unplayed today.
	 *
	 * @param id The game's ID.
	 * @param played The new state.
	 */
	setPlayed(id: string, played: boolean): Promise<void>;

	/**
	 * Shows or hides games already played today.
	 *
	 * @param value True to hide played games.
	 */
	setUnplayedOnly(value: boolean): Promise<void>;

	/**
	 * Opens a game.
	 *
	 * @param game The game to open.
	 * @param evt The click that opened it, if any; Cmd/Ctrl swaps where it opens.
	 */
	openGame(game: Game, evt?: MouseEvent): Promise<void>;

	/** Opens the first game not played yet today. */
	playNext(): Promise<void>;

	/**
	 * Opens the form for today's result of a game.
	 *
	 * @param game The game whose result to edit.
	 */
	editResult(game: Game): void;

	/**
	 * Opens the game form.
	 *
	 * @param game The game to edit; omit to add a new one.
	 */
	editGame(game?: Game): void;
}

/** How a board is drawn. */
export interface BoardOptions {
	/** Draw a one-line header instead of the masthead, for embedding in a note. */
	compact: boolean;
	/** Show only this category and hide the category chips. */
	category?: string;
}

/**
 * Creates an element inside a parent.
 *
 * @param tag The element's tag name.
 * @param cls Class names, or an empty string for none.
 * @param parent The element to append to.
 * @param text Optional text content.
 * @return The new element.
 */
function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls: string,
	parent: HTMLElement,
	text?: string,
): HTMLElementTagNameMap[K] {
	return parent.createEl(tag, { cls: cls || undefined, text });
}

/**
 * Creates a Lucide icon inside a parent.
 *
 * @param parent The element to append to.
 * @param name The Lucide icon name, e.g. `play`.
 * @param cls Class names of the icon's wrapper.
 * @return The wrapper holding the icon.
 */
function icon(parent: HTMLElement, name: string, cls = "dg-icon"): HTMLElement {
	const span = el("span", cls, parent);
	setIcon(span, name);
	return span;
}

/**
 * Creates a button with an optional icon before its label.
 *
 * @param parent The element to append to.
 * @param cls Class names of the button.
 * @param label The button text, or an empty string for an icon-only button.
 * @param iconName Optional Lucide icon name.
 * @return The new button.
 */
function button(parent: HTMLElement, cls: string, label: string, iconName?: string): HTMLButtonElement {
	const b = el("button", cls, parent);
	b.type = "button";
	if (iconName) icon(b, iconName);
	if (label) el("span", "", b, label);
	return b;
}

/**
 * Returns the host name of a URL without a leading `www.`.
 *
 * @param url The URL to read.
 * @return The host name, or an empty string when the URL is invalid or empty.
 */
export function domainOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

/** Draws the games board into an element and redraws it on demand. */
export class GamesBoard {
	/** Category picked with the chips, or `all`. */
	private category: string;

	/**
	 * @param root The element the board draws into; its children are replaced.
	 * @param host Where the board reads state from and sends actions to.
	 * @param opts How the board is drawn.
	 */
	constructor(
		private readonly root: HTMLElement,
		private readonly host: BoardHost,
		private readonly opts: BoardOptions,
	) {
		this.category = opts.category ?? "all";
	}

	/** Redraws the whole board from the host's current state. */
	render(): void {
		this.root.replaceChildren();
		const page = el("div", "dg-page" + (this.opts.compact ? " is-compact" : ""), this.root);
		const { host } = this;
		const games = this.opts.category ? host.games.filter((g) => g.category === this.opts.category) : host.games;
		const played = games.filter((g) => host.isPlayed(g.id)).length;

		if (this.opts.compact) this.renderCompactHeader(page, games, played);
		else this.renderMasthead(page, games, played);

		if (games.length === 0) {
			const empty = el("div", "dg-empty", page);
			el("div", "dg-empty-title", empty, "No games yet");
			button(empty, "dg-tool", "Add a game", "plus").onclick = () => host.editGame();
			return;
		}

		if (!this.opts.category) this.renderChips(page, games);

		const visible = games.filter(
			(g) => (this.category === "all" || g.category === this.category) && !(host.unplayedOnly && host.isPlayed(g.id)),
		);
		if (visible.length === 0) {
			const empty = el("div", "dg-empty", page);
			el("div", "dg-empty-title", empty, "All played for today");
			el("div", "dg-empty-sub", empty, "New puzzles tomorrow.");
			return;
		}

		const grid = el("section", "dg-grid", page);
		for (const game of visible) this.renderCard(grid, game);
	}

	/**
	 * Draws the full masthead: date, title, status line, progress bar and tools.
	 *
	 * @param page The board's page element.
	 * @param games The games on this board.
	 * @param played How many of them are played today.
	 */
	private renderMasthead(page: HTMLElement, games: Game[], played: number): void {
		const { host } = this;
		const head = el("header", "dg-masthead", page);
		const date = parseKey(host.today()).toLocaleDateString(undefined, {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
		});
		el("div", "dg-dateline", head, date);
		el("h1", "dg-title", head, host.title);

		const status = el("div", "dg-status", head);
		const parts = [`${games.length} ${games.length === 1 ? "game" : "games"}`, `${played} of ${games.length} played today`];
		el("span", "", status, parts.join(" · "));
		const days = host.dayStreak();
		if (days > 0) {
			el("span", "dg-status-sep", status, "·");
			const streak = el("span", "dg-status-streak", status);
			icon(streak, "flame");
			el("span", "", streak, `${days}-day streak`);
		}

		this.renderProgress(head, games);

		const tools = el("div", "dg-tools", head);
		const next = button(tools, "dg-tool", "Play next", "play");
		next.disabled = played === games.length;
		next.onclick = () => void host.playNext();
		const unplayed = button(tools, "dg-tool" + (host.unplayedOnly ? " is-active" : ""), "Unplayed only", "eye");
		unplayed.onclick = () => void host.setUnplayedOnly(!host.unplayedOnly);
		button(tools, "dg-tool", "Add game", "plus").onclick = () => host.editGame();
	}

	/**
	 * Draws the one-line header used by compact boards.
	 *
	 * @param page The board's page element.
	 * @param games The games on this board.
	 * @param played How many of them are played today.
	 */
	private renderCompactHeader(page: HTMLElement, games: Game[], played: number): void {
		const { host } = this;
		const head = el("header", "dg-compact-head", page);
		el("span", "dg-compact-title", head, host.title);
		el("span", "dg-status", head, `${played} of ${games.length} played`);
		this.renderProgress(head, games);
		const next = button(head, "dg-tool", "Play next", "play");
		next.disabled = played === games.length;
		next.onclick = () => void host.playNext();
	}

	/**
	 * Draws the progress bar: one segment per game, filled in its colour once played.
	 *
	 * @param parent The element to append the bar to.
	 * @param games The games on this board.
	 */
	private renderProgress(parent: HTMLElement, games: Game[]): void {
		const bar = el("div", "dg-progress", parent);
		for (const game of games) {
			const segment = el("span", "dg-progress-seg" + (this.host.isPlayed(game.id) ? " is-done" : ""), bar);
			segment.setCssProps({ "--dg-accent": game.color || "var(--interactive-accent)" });
			segment.title = game.name;
		}
	}

	/**
	 * Draws the category chips, each with the number of games left to play.
	 *
	 * Draws nothing when the games use fewer than two categories.
	 *
	 * @param page The board's page element.
	 * @param games The games on this board.
	 */
	private renderChips(page: HTMLElement, games: Game[]): void {
		const categories = [...new Set(games.map((g) => g.category).filter(Boolean))];
		if (categories.length < 2) return;
		const chips = el("nav", "dg-chips", page);
		const chip = (key: string, label: string, list: Game[]) => {
			const b = button(chips, "dg-chip" + (this.category === key ? " is-active" : ""), label);
			const left = list.filter((g) => !this.host.isPlayed(g.id)).length;
			if (left > 0) el("span", "dg-chip-count", b, String(left));
			b.onclick = () => {
				this.category = key;
				this.render();
			};
		};
		chip("all", "Everything", games);
		for (const category of categories) chip(category, category, games.filter((g) => g.category === category));
	}

	/**
	 * Draws one game card: cover, status, name, description, result and actions.
	 *
	 * @param grid The grid to append the card to.
	 * @param game The game to draw.
	 */
	private renderCard(grid: HTMLElement, game: Game): void {
		const { host } = this;
		const played = host.isPlayed(game.id);
		const hasUrl = !!game.url;
		const card = el("article", "dg-card" + (played ? " is-played" : "") + (hasUrl ? "" : " is-unset"), grid);
		card.setCssProps({ "--dg-accent": game.color || "#888888" });

		// A game without a link opens its form instead, so the link can be added.
		const open = (evt: MouseEvent) => {
			evt.preventDefault();
			if (hasUrl) void host.openGame(game, evt);
			else host.editGame(game);
		};

		const cover = el("a", "dg-cover", card);
		cover.href = game.url || "#";
		cover.setAttribute("aria-label", hasUrl ? `Play ${game.name}` : `Add a link for ${game.name}`);
		cover.onclick = open;
		if (game.image) {
			const img = el("img", "dg-cover-img", cover);
			img.src = game.image;
			img.alt = "";
			img.loading = "lazy";
		} else {
			el("span", "dg-emoji", cover, game.emoji || game.name.charAt(0).toUpperCase());
		}
		if (game.category) el("span", "dg-badge", cover, game.category);
		if (played) icon(cover, "check", "dg-stamp");
		const hover = el("span", "dg-play", cover);
		icon(hover, hasUrl ? "play" : "link");
		el("span", "", hover, hasUrl ? "Play" : "Add link");

		const body = el("div", "dg-body", card);
		const meta = el("div", "dg-meta", body);
		el("span", "dg-pill", meta, played ? "Played" : hasUrl ? "To play" : "No link");
		const days = host.gameStreak(game.id);
		if (days > 0) {
			const streak = el("span", "dg-streak", meta);
			streak.title = `${days}-day streak`;
			icon(streak, "flame");
			el("span", "", streak, String(days));
		}

		const name = el("h3", "dg-name", body);
		const link = el("a", "", name, game.name);
		link.href = game.url || "#";
		link.onclick = open;
		if (game.blurb) el("p", "dg-blurb", body, game.blurb);
		const domain = domainOf(game.url);
		if (domain) el("div", "dg-domain", body, domain);

		const result = host.result(game.id);
		if (result) {
			const saved = el("div", "dg-result", body, result);
			saved.title = "Edit result";
			saved.onclick = () => host.editResult(game);
		}

		const actions = el("div", "dg-actions", body);
		const toggle = button(actions, "dg-tool", played ? "Unmark" : "Mark played", played ? "rotate-ccw" : "check");
		toggle.onclick = () => void host.setPlayed(game.id, !played);
		if (!result) button(actions, "dg-tool", "Add result", "clipboard-paste").onclick = () => host.editResult(game);
	}
}
