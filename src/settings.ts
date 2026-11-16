/**
 * @fileoverview The plugin's settings tab: options and the list of games.
 *
 * Uses Obsidian's declarative settings API, so every option is drawn by
 * Obsidian and shows up in the settings search.
 */

import { App, PluginSettingTab, debounce, type SettingDefinitionItem } from "obsidian";
import { domainOf } from "./board";
import type DailyGamesPlugin from "./main";
import { LIMITS, isMarkdownHeading, singleLine } from "./sanitize";
import { DEFAULT_SETTINGS, type Game } from "./types";

/** Settings edited through the tab's controls. */
type SettingKey = "title" | "openIn" | "markPlayedOnOpen" | "dayStartsAt" | "logToDailyNote" | "dailyNoteHeading";

/** Options of the "New day starts at" dropdown: hour to label. */
const DAY_START_OPTIONS: Record<string, string> = Object.fromEntries(
	Array.from({ length: 7 }, (_, hour) => [String(hour), hour === 0 ? "Midnight" : `${hour}:00`]),
);

/** Settings tab with the plugin's options and a reorderable list of games. */
export class DailyGamesSettingTab extends PluginSettingTab {
	/** Saves typed text after a pause, so typing doesn't write the data file on every key. */
	private readonly saveSoon = debounce(() => void this.plugin.saveAndRefresh(), 500, true);

	/**
	 * @param app The Obsidian app.
	 * @param plugin The plugin whose settings the tab edits.
	 */
	constructor(
		app: App,
		private readonly plugin: DailyGamesPlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Describes the tab: the options, then the list of games.
	 *
	 * @return The setting definitions Obsidian draws and indexes for search.
	 */
	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		const games = this.plugin.state.settings.games;
		return [
			{
				name: "Title",
				desc: "Shown at the top of the board and on its tab.",
				control: {
					type: "text",
					key: "title",
					defaultValue: DEFAULT_SETTINGS.title,
					validate: (value) => (singleLine(value, LIMITS.title) ? undefined : "Enter a title."),
				},
			},
			{
				name: "Open games in",
				desc: "Web viewer opens a tab inside Obsidian (needs the Web viewer core plugin). Cmd/Ctrl-click a card for the other one.",
				aliases: ["browser", "web viewer"],
				control: {
					type: "dropdown",
					key: "openIn",
					options: { webviewer: "Obsidian web viewer", browser: "Default browser" },
				},
			},
			{
				name: "Mark played when opened",
				desc: "Off: tick games yourself with Mark played.",
				control: { type: "toggle", key: "markPlayedOnOpen" },
			},
			{
				name: "New day starts at",
				desc: "For late nights: before this hour still counts as yesterday.",
				aliases: ["midnight", "reset"],
				control: { type: "dropdown", key: "dayStartsAt", options: DAY_START_OPTIONS },
			},
			{
				name: "Add results to the daily note",
				desc: "Pasted results go under a heading in today's daily note (needs the Daily notes core plugin).",
				control: { type: "toggle", key: "logToDailyNote" },
			},
			{
				name: "Daily note heading",
				desc: "A Markdown heading such as ## Daily games.",
				control: {
					type: "text",
					key: "dailyNoteHeading",
					placeholder: DEFAULT_SETTINGS.dailyNoteHeading,
					validate: (value) =>
						isMarkdownHeading(singleLine(value, LIMITS.heading)) ? undefined : "Start with one to six # and a space.",
				},
			},
			{
				type: "list",
				heading: "Games",
				emptyState: "No games yet. Add one with +.",
				addItem: { name: "Add game", action: () => this.plugin.editGame(undefined, () => this.update()) },
				onReorder: (from, to) => void this.moveGame(from, to),
				onDelete: (index) => void this.removeGame(index),
				items: games.map((game) => ({
					name: `${game.emoji} ${game.name}`.trim(),
					desc: [game.category, domainOf(game.url) || "No link yet"].filter(Boolean).join(" · "),
					aliases: [game.category, game.url].filter(Boolean),
					render: (setting) => {
						setting.addExtraButton((b) =>
							b
								.setIcon("pencil")
								.setTooltip("Edit")
								.onClick(() => this.editGame(game)),
						);
					},
				})),
			},
		];
	}

	/**
	 * Reads a setting for its control.
	 *
	 * @param key The setting's key.
	 * @return The stored value; the day-start hour as a dropdown option string.
	 */
	getControlValue(key: string): unknown {
		const settings = this.plugin.state.settings;
		switch (key as SettingKey) {
			case "title":
				return settings.title;
			case "openIn":
				return settings.openIn;
			case "markPlayedOnOpen":
				return settings.markPlayedOnOpen;
			case "dayStartsAt":
				return String(settings.dayStartsAt);
			case "logToDailyNote":
				return settings.logToDailyNote;
			case "dailyNoteHeading":
				return settings.dailyNoteHeading;
			default:
				return undefined;
		}
	}

	/**
	 * Validates and stores a setting changed through its control.
	 *
	 * Text is saved after a pause in typing; other controls save right away.
	 * Invalid values are ignored, leaving the previous value in place.
	 *
	 * @param key The setting's key.
	 * @param value The new value from the control.
	 */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.state.settings;
		switch (key as SettingKey) {
			case "title": {
				const title = singleLine(value, LIMITS.title);
				if (title) {
					settings.title = title;
					this.saveSoon();
				}
				return;
			}
			case "dailyNoteHeading": {
				const heading = singleLine(value, LIMITS.heading);
				if (isMarkdownHeading(heading)) {
					settings.dailyNoteHeading = heading;
					this.saveSoon();
				}
				return;
			}
			case "openIn":
				if (value !== "webviewer" && value !== "browser") return;
				settings.openIn = value;
				break;
			case "markPlayedOnOpen":
				if (typeof value !== "boolean") return;
				settings.markPlayedOnOpen = value;
				break;
			case "logToDailyNote":
				if (typeof value !== "boolean") return;
				settings.logToDailyNote = value;
				break;
			case "dayStartsAt": {
				const hour = Number(value);
				if (!Number.isInteger(hour) || hour < 0 || hour > 6) return;
				settings.dayStartsAt = hour;
				break;
			}
			default:
				return;
		}
		await this.plugin.saveAndRefresh();
	}

	/** Saves any text still waiting for its pause when the tab closes. */
	hide(): void {
		this.saveSoon.run();
	}

	/**
	 * Opens the form for a game and refreshes the list once it is saved.
	 *
	 * @param game The game to edit.
	 */
	private editGame(game: Game): void {
		this.plugin.editGame(game, () => this.update());
	}

	/**
	 * Moves a game to a new position in the list.
	 *
	 * @param from The game's current index.
	 * @param to The index it was dragged to.
	 */
	private async moveGame(from: number, to: number): Promise<void> {
		const games = this.plugin.state.settings.games;
		const [game] = games.splice(from, 1);
		if (!game) return;
		games.splice(to, 0, game);
		await this.plugin.saveAndRefresh();
		this.update();
	}

	/**
	 * Removes a game from the list.
	 *
	 * @param index The game's index.
	 */
	private async removeGame(index: number): Promise<void> {
		this.plugin.state.settings.games.splice(index, 1);
		await this.plugin.saveAndRefresh();
		this.update();
	}
}
