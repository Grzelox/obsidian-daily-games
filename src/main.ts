/**
 * @fileoverview Plugin entry point: state, commands, the board tab and the `daily-games` code block.
 */

import { ItemView, MarkdownRenderChild, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { GamesBoard, type BoardHost, type BoardOptions } from "./board";
import { appendToDailyNote } from "./dailyNote";
import { addDays, computeStreaks, dayKey, parseKey, type Streaks } from "./dates";
import { resultBlock } from "./markdown";
import { GameModal, ResultModal } from "./modals";
import { isGameId, safeWebUrl, sanitizeData } from "./sanitize";
import { DailyGamesSettingTab } from "./settings";
import { blankGame, newGameId, type Game, type PluginData } from "./types";

/** View type of the board tab. */
const VIEW_TYPE = "daily-games-view";

/** View type registered by the Web viewer core plugin. */
const WEB_VIEWER = "webviewer";

/** Days of play history kept in the data file; also the longest streak that can be counted. */
const KEEP_PLAY_DAYS = 1100;

/** Days of pasted results kept in the data file; results also live in the daily notes. */
const KEEP_RESULT_DAYS = 400;

/** How often to check whether a new game day has started, in milliseconds. */
const DAY_CHECK_MS = 60_000;

/** The Daily Games plugin; also the {@link BoardHost} of every board it draws. */
export default class DailyGamesPlugin extends Plugin implements BoardHost {
	/** Everything saved to the data file. */
	state!: PluginData;

	/** Boards currently open, redrawn whenever state changes. */
	private boards = new Set<GamesBoard>();

	/** Game day the boards were last drawn for. */
	private lastDay = "";

	/** Streaks for {@link lastDay}, shared by all boards until state changes. */
	private streaks: (Streaks & { day: string }) | null = null;

	/** Pending writes of the data file, run one after another so they never overlap. */
	private saveQueue: Promise<void> = Promise.resolve();

	/** Web viewer tab each game last opened in, reused when the game is opened again. */
	private gameLeaves = new Map<string, WorkspaceLeaf>();

	/** Whether Web viewer turned out to be off; avoids flashing an empty tab on every click. */
	private webViewerMissing = false;

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

		// Boards in background tabs skip redraws; catch them up when they come into view.
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.renderStale()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.renderStale()));

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

	/** Forgets the boards and tabs; Obsidian removes the views and code blocks itself. */
	onunload(): void {
		this.boards.clear();
		this.gameLeaves.clear();
	}

	/**
	 * Reloads state when the data file changes outside Obsidian, e.g. through sync.
	 *
	 * A file that can't be read leaves the current state in place.
	 */
	async onExternalSettingsChange(): Promise<void> {
		try {
			await this.loadState();
			this.refresh();
		} catch (e) {
			console.error("Daily games: could not reload the data file", e);
		}
	}

	/**
	 * Loads and validates the data file, then drops history past the retention limits.
	 *
	 * A missing or unreadable file gives the default state.
	 */
	private async loadState(): Promise<void> {
		let raw: unknown = null;
		try {
			raw = await this.loadData();
		} catch (e) {
			console.error("Daily games: could not read the data file; starting from defaults", e);
		}
		const state = sanitizeData(raw);
		const today = dayKey(new Date(), state.settings.dayStartsAt);
		const playCutoff = addDays(today, -KEEP_PLAY_DAYS);
		const resultCutoff = addDays(today, -KEEP_RESULT_DAYS);
		for (const day of Object.keys(state.plays)) if (day < playCutoff) delete state.plays[day];
		for (const day of Object.keys(state.results)) if (day < resultCutoff) delete state.results[day];
		this.state = state;
		this.streaks = null;
	}

	/**
	 * Redraws every board, then saves state to the data file.
	 *
	 * The redraw comes first so clicks feel instant; writes are queued so two
	 * quick changes never write the file at the same time.
	 */
	async saveAndRefresh(): Promise<void> {
		this.refresh();
		this.saveQueue = this.saveQueue
			.then(() => this.saveData(this.state))
			.catch((e) => {
				console.error("Daily games: could not save", e);
				new Notice("Daily games couldn't save your changes. See the console.");
			});
		await this.saveQueue;
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

	/** Recomputes streaks and redraws every visible board; hidden boards are marked stale. */
	refresh(): void {
		this.streaks = null;
		for (const board of this.boards) {
			if (board.isShown()) board.render();
			else board.stale = true;
		}
	}

	/** Redraws boards that missed an update while hidden and are visible now. */
	private renderStale(): void {
		for (const board of this.boards) if (board.stale && board.isShown()) board.render();
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

	/**
	 * Returns today's streaks, computing them once per change for all boards.
	 *
	 * @return The cached streaks.
	 */
	private currentStreaks(): Streaks {
		const today = this.today();
		if (this.streaks?.day !== today) this.streaks = { day: today, ...computeStreaks(today, this.state.plays) };
		return this.streaks;
	}

	/** @inheritDoc */
	gameStreak(id: string): number {
		return this.currentStreaks().perGame.get(id) ?? 0;
	}

	/** @inheritDoc */
	dayStreak(): number {
		return this.currentStreaks().anyGame;
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
	 * @param id The game's ID; malformed IDs are ignored.
	 * @param played The new state.
	 */
	private markPlayed(day: string, id: string, played: boolean): void {
		if (!isGameId(id)) return;
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
	 * Only `http:` and `https:` links are opened; a game without one opens its
	 * form instead, so a link can be added.
	 *
	 * @param game The game to open.
	 * @param evt The click that opened it, if any; Cmd/Ctrl swaps where it opens.
	 */
	async openGame(game: Game, evt?: MouseEvent): Promise<void> {
		const url = safeWebUrl(game.url);
		if (!url) {
			this.editGame(game);
			return;
		}
		const swap = !!evt && (evt.metaKey || evt.ctrlKey);
		const wantViewer = (this.state.settings.openIn === "webviewer") !== swap;
		if (!(wantViewer && (await this.openInWebViewer(game.id, url)))) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
		if (this.state.settings.markPlayedOnOpen && !this.isPlayed(game.id)) await this.setPlayed(game.id, true);
	}

	/**
	 * Opens a URL in a Web viewer tab, reusing the tab the game last opened in.
	 *
	 * When the Web viewer core plugin is off its view type doesn't exist and the
	 * tab opens as another view; the tab is closed, the user told, and later
	 * clicks go straight to the browser until a Web viewer tab exists again.
	 *
	 * @param gameId The game being opened.
	 * @param url The page to open.
	 * @return True when the page opened in Web viewer.
	 */
	private async openInWebViewer(gameId: string, url: string): Promise<boolean> {
		const { workspace } = this.app;
		const viewerLeaves = workspace.getLeavesOfType(WEB_VIEWER);
		if (this.webViewerMissing && viewerLeaves.length === 0) return false;

		const previous = this.gameLeaves.get(gameId);
		const leaf = previous && viewerLeaves.includes(previous) ? previous : workspace.getLeaf("tab");
		await leaf.setViewState({ type: WEB_VIEWER, active: true, state: { url, navigate: true } });
		if (leaf.view.getViewType() !== WEB_VIEWER) {
			leaf.detach();
			this.webViewerMissing = true;
			new Notice("Web viewer is turned off, so games open in your browser.");
			return false;
		}
		this.webViewerMissing = false;
		this.gameLeaves.set(gameId, leaf);
		await workspace.revealLeaf(leaf);
		return true;
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
			const written = await appendToDailyNote(
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
