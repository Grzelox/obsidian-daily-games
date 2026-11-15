/**
 * @fileoverview Plugin entry point: state, commands, the board tab and the `daily-games` code block.
 */

import { ItemView, MarkdownRenderChild, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { GamesBoard, type BoardHost, type BoardOptions } from "./board";
import { appendResult, resultBlock } from "./dailyNote";
import { addDays, dayKey, parseKey, streak } from "./dates";
import { GameModal, ResultModal } from "./modals";
import { DailyGamesSettingTab } from "./settings";
import { blankGame, DEFAULT_GAMES, DEFAULT_SETTINGS, newGameId, type Game, type PluginData } from "./types";

/** View type of the board tab. */
const VIEW_TYPE = "daily-games-view";

/** View type registered by the Web viewer core plugin. */
const WEB_VIEWER = "webviewer";

/** Days of play history and results kept in the data file. */
const KEEP_DAYS = 400;

/** How often to check whether a new game day has started, in milliseconds. */
const DAY_CHECK_MS = 60_000;

/** The Daily Games plugin; also the {@link BoardHost} of every board it draws. */
export default class DailyGamesPlugin extends Plugin implements BoardHost {
	/** Everything saved to the data file. */
	state!: PluginData;

	/** Boards currently on screen, redrawn whenever state changes. */
	private boards = new Set<GamesBoard>();

	/** Game day the boards were last drawn for. */
	private lastDay = "";

	/** Whether the user was already told that Web viewer is off. */
	private warnedNoViewer = false;

	/** Loads state and registers the view, commands, code block and settings tab. */
	async onload(): Promise<void> {
		await this.loadState();

		this.registerView(VIEW_TYPE, (leaf) => new DailyGamesView(leaf, this));
		this.addRibbonIcon("dices", "Open daily games", () => void this.activateView());
		this.addCommand({ id: "open-board", name: "Open board", callback: () => void this.activateView() });
		this.addCommand({ id: "play-next", name: "Play next unplayed game", callback: () => void this.playNext() });

		this.registerMarkdownCodeBlockProcessor("daily-games", (source, el, ctx) => {
			ctx.addChild(new BoardBlock(el, this, parseBlockOptions(source)));
		});

		this.addSettingTab(new DailyGamesSettingTab(this.app, this));

		// Roll the boards over to a fresh day without a reload.
		this.lastDay = this.today();
		this.registerInterval(
			window.setInterval(() => {
				const day = this.today();
				if (day !== this.lastDay) {
					this.lastDay = day;
					this.refresh();
				}
			}, DAY_CHECK_MS),
		);
	}

	/** Forgets the boards; Obsidian removes the views and code blocks itself. */
	onunload(): void {
		this.boards.clear();
	}

	/**
	 * Reloads state when the data file changes outside Obsidian, e.g. through sync.
	 */
	async onExternalSettingsChange(): Promise<void> {
		await this.loadState();
		this.refresh();
	}

	/**
	 * Loads the data file, fills in defaults and drops history older than {@link KEEP_DAYS}.
	 */
	private async loadState(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		this.state = {
			settings: {
				...DEFAULT_SETTINGS,
				...raw.settings,
				games: (raw.settings?.games ?? DEFAULT_GAMES).map((g) => ({ ...g })),
			},
			plays: raw.plays ?? {},
			results: raw.results ?? {},
			unplayedOnly: raw.unplayedOnly ?? false,
		};
		const cutoff = addDays(this.today(), -KEEP_DAYS);
		for (const day of Object.keys(this.state.plays)) if (day < cutoff) delete this.state.plays[day];
		for (const day of Object.keys(this.state.results)) if (day < cutoff) delete this.state.results[day];
	}

	/** Saves state to the data file and redraws every board. */
	async saveAndRefresh(): Promise<void> {
		await this.saveData(this.state);
		this.refresh();
	}

	/**
	 * Starts redrawing a board on state changes and draws it now.
	 *
	 * @param board The board to keep up to date.
	 */
	registerBoard(board: GamesBoard): void {
		this.boards.add(board);
		board.render();
	}

	/**
	 * Stops redrawing a board.
	 *
	 * @param board The board that left the screen.
	 */
	unregisterBoard(board: GamesBoard): void {
		this.boards.delete(board);
	}

	/** Redraws every board on screen. */
	refresh(): void {
		for (const board of this.boards) board.render();
	}

	/** @inheritDoc */
	get title(): string {
		return this.state.settings.title;
	}

	/** @inheritDoc */
	get games(): Game[] {
		return this.state.settings.games;
	}

	/** @inheritDoc */
	get unplayedOnly(): boolean {
		return this.state.unplayedOnly;
	}

	/** @inheritDoc */
	today(): string {
		return dayKey(new Date(), this.state.settings.dayStartsAt);
	}

	/**
	 * Tells whether a game was played on a day.
	 *
	 * @param id The game's ID.
	 * @param day The day key; defaults to today.
	 * @return True when the game is marked played that day.
	 */
	isPlayed(id: string, day = this.today()): boolean {
		return this.state.plays[day]?.includes(id) ?? false;
	}

	/** @inheritDoc */
	result(id: string): string | undefined {
		return this.state.results[this.today()]?.[id];
	}

	/** @inheritDoc */
	gameStreak(id: string): number {
		return streak(this.today(), (day) => this.isPlayed(id, day));
	}

	/** @inheritDoc */
	dayStreak(): number {
		return streak(this.today(), (day) => (this.state.plays[day]?.length ?? 0) > 0);
	}

	/** @inheritDoc */
	async setPlayed(id: string, played: boolean): Promise<void> {
		this.markPlayed(this.today(), id, played);
		await this.saveAndRefresh();
	}

	/**
	 * Marks a game played or unplayed on a day, without saving.
	 *
	 * @param day The day key.
	 * @param id The game's ID.
	 * @param played The new state.
	 */
	private markPlayed(day: string, id: string, played: boolean): void {
		const ids = new Set(this.state.plays[day] ?? []);
		if (played) ids.add(id);
		else ids.delete(id);
		if (ids.size) this.state.plays[day] = [...ids];
		else delete this.state.plays[day];
	}

	/** @inheritDoc */
	async setUnplayedOnly(value: boolean): Promise<void> {
		this.state.unplayedOnly = value;
		await this.saveAndRefresh();
	}

	/**
	 * Opens a game in Web viewer or the browser, and marks it played if set to.
	 *
	 * A game without a link opens its form instead, so the link can be added.
	 *
	 * @param game The game to open.
	 * @param evt The click that opened it, if any; Cmd/Ctrl swaps where it opens.
	 */
	async openGame(game: Game, evt?: MouseEvent): Promise<void> {
		if (!game.url) {
			this.editGame(game);
			return;
		}
		const swap = !!evt && (evt.metaKey || evt.ctrlKey);
		const wantViewer = (this.state.settings.openIn === "webviewer") !== swap;
		if (!(wantViewer && (await this.openInWebViewer(game.url)))) {
			window.open(game.url, "_blank");
		}
		if (this.state.settings.markPlayedOnOpen && !this.isPlayed(game.id)) await this.setPlayed(game.id, true);
	}

	/**
	 * Opens a URL in a Web viewer tab.
	 *
	 * When the Web viewer core plugin is off, its view type doesn't exist and the
	 * tab opens as another view; the tab is then closed and the user told once.
	 *
	 * @param url The page to open.
	 * @return True when the page opened in Web viewer.
	 */
	private async openInWebViewer(url: string): Promise<boolean> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: WEB_VIEWER, active: true, state: { url, navigate: true } });
		if (leaf.view.getViewType() === WEB_VIEWER) return true;
		leaf.detach();
		if (!this.warnedNoViewer) {
			this.warnedNoViewer = true;
			new Notice("Web viewer is turned off, so games open in your browser.");
		}
		return false;
	}

	/** @inheritDoc */
	async playNext(): Promise<void> {
		const next = this.games.find((g) => g.url && !this.isPlayed(g.id));
		if (next) await this.openGame(next);
		else new Notice("Everything played for today.");
	}

	/**
	 * Opens the game form and saves the game when the form is submitted.
	 *
	 * @param game The game to edit; omit to add a new one.
	 * @param onSaved Called after the game is saved, e.g. to redraw the settings tab.
	 */
	editGame(game?: Game, onSaved?: () => void): void {
		const games = this.state.settings.games;
		const index = game ? games.findIndex((g) => g.id === game.id) : -1;
		new GameModal(this.app, game ?? blankGame(), index === -1, async (edited) => {
			if (index === -1) games.push({ ...edited, id: newGameId(edited.name) });
			else games[index] = { ...edited, id: games[index].id };
			await this.saveAndRefresh();
			onSaved?.();
		}).open();
	}

	/**
	 * Opens the result form for a game and saves what is pasted.
	 *
	 * Saving a result also marks the game played. The first result of the day is
	 * added to the daily note; later edits are not, so the note gets no duplicates.
	 *
	 * @param game The game whose result to edit.
	 */
	editResult(game: Game): void {
		const day = this.today();
		const previous = this.state.results[day]?.[game.id] ?? "";
		new ResultModal(this.app, game, previous, async (text) => {
			const dayResults = (this.state.results[day] ??= {});
			if (text) dayResults[game.id] = text;
			else delete dayResults[game.id];
			if (!Object.keys(dayResults).length) delete this.state.results[day];
			if (text) this.markPlayed(day, game.id, true);
			await this.saveAndRefresh();

			if (text && !previous && this.state.settings.logToDailyNote) {
				await this.addResultToDailyNote(day, game, text);
			}
		}).open();
	}

	/**
	 * Adds a result to the daily note and tells the user when that isn't possible.
	 *
	 * @param day The day key the result belongs to.
	 * @param game The game the result belongs to.
	 * @param text The pasted share text.
	 */
	private async addResultToDailyNote(day: string, game: Game, text: string): Promise<void> {
		try {
			const written = await appendResult(
				this.app.vault,
				parseKey(day),
				this.state.settings.dailyNoteHeading,
				resultBlock(game, text),
			);
			if (!written) new Notice("Result saved. Turn on the Daily notes core plugin to also add it to your daily note.");
		} catch (e) {
			console.error("Daily games: could not write to the daily note", e);
			new Notice("Result saved, but adding it to the daily note failed. See the console.");
		}
	}

	/** Shows the board tab, opening it if it isn't open yet. */
	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}
}

/**
 * Reads the options of a `daily-games` code block.
 *
 * Each line is `key: value`; unknown keys are ignored.
 *
 * @param source The code block's content.
 * @return The board options.
 */
function parseBlockOptions(source: string): BoardOptions {
	const opts: BoardOptions = { compact: false };
	for (const line of source.split("\n")) {
		const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
		if (!match) continue;
		const [, key, value] = match;
		if (key === "compact") opts.compact = value === "true";
		if (key === "category") opts.category = value;
	}
	return opts;
}

/** A board drawn in place of a `daily-games` code block. */
class BoardBlock extends MarkdownRenderChild {
	/** The board drawn into the block. */
	private board: GamesBoard;

	/**
	 * @param el The element the code block renders into.
	 * @param plugin The plugin that owns the board.
	 * @param opts How the board is drawn.
	 */
	constructor(
		el: HTMLElement,
		private readonly plugin: DailyGamesPlugin,
		opts: BoardOptions,
	) {
		super(el);
		this.board = new GamesBoard(el, plugin, opts);
	}

	/** Draws the board and keeps it up to date. */
	onload(): void {
		this.plugin.registerBoard(this.board);
	}

	/** Stops updating the board once the block leaves the screen. */
	onunload(): void {
		this.plugin.unregisterBoard(this.board);
	}
}

/** The board in its own tab. */
class DailyGamesView extends ItemView {
	/** The board drawn into the tab, while it is open. */
	private board: GamesBoard | null = null;

	/**
	 * @param leaf The workspace leaf holding the view.
	 * @param plugin The plugin that owns the board.
	 */
	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: DailyGamesPlugin,
	) {
		super(leaf);
	}

	/** @inheritDoc */
	getViewType(): string {
		return VIEW_TYPE;
	}

	/** @inheritDoc */
	getDisplayText(): string {
		return this.plugin.title;
	}

	/** @inheritDoc */
	getIcon(): string {
		return "dices";
	}

	/** Draws the board and keeps it up to date. */
	async onOpen(): Promise<void> {
		this.contentEl.addClass("dg-view");
		this.board = new GamesBoard(this.contentEl, this.plugin, { compact: false });
		this.plugin.registerBoard(this.board);
	}

	/** Stops updating the board once the tab closes. */
	async onClose(): Promise<void> {
		if (this.board) this.plugin.unregisterBoard(this.board);
		this.board = null;
	}
}
