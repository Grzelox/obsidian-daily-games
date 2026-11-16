/**
 * @fileoverview The plugin's settings tab: options and the list of games.
 */

import { App, PluginSettingTab, Setting, debounce } from "obsidian";
import type DailyGamesPlugin from "./main";
import { LIMITS, singleLine } from "./sanitize";
import { DEFAULT_SETTINGS, type Game, type OpenIn } from "./types";

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
	 * Draws the tab, keeping the scroll position when it redraws.
	 *
	 * Toggles and dropdowns save right away; text fields save after a pause.
	 */
	display(): void {
		const { containerEl, plugin } = this;
		const settings = plugin.state.settings;
		const save = () => plugin.saveAndRefresh();
		const scrollTop = containerEl.scrollTop;
		containerEl.empty();

		new Setting(containerEl).setName("Title").addText((t) => {
			t.inputEl.maxLength = LIMITS.title;
			t.setValue(settings.title).onChange((v) => {
				settings.title = singleLine(v, LIMITS.title, DEFAULT_SETTINGS.title);
				this.saveSoon();
			});
		});

		new Setting(containerEl)
			.setName("Open games in")
			.setDesc("Web viewer opens a tab inside Obsidian (needs the Web viewer core plugin). Cmd/Ctrl-click a card for the other one.")
			.addDropdown((d) =>
				d
					.addOption("webviewer", "Obsidian web viewer")
					.addOption("browser", "Default browser")
					.setValue(settings.openIn)
					.onChange(async (v) => {
						settings.openIn = v as OpenIn;
						await save();
					}),
			);

		new Setting(containerEl)
			.setName("Mark played when opened")
			.setDesc("Off: tick games yourself with Mark played.")
			.addToggle((t) =>
				t.setValue(settings.markPlayedOnOpen).onChange(async (v) => {
					settings.markPlayedOnOpen = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("New day starts at")
			.setDesc("For late nights: before this hour still counts as yesterday.")
			.addDropdown((d) => {
				for (let hour = 0; hour <= 6; hour++) d.addOption(String(hour), hour === 0 ? "Midnight" : `${hour}:00`);
				d.setValue(String(settings.dayStartsAt)).onChange(async (v) => {
					settings.dayStartsAt = Number(v);
					await save();
				});
			});

		new Setting(containerEl)
			.setName("Add results to the daily note")
			.setDesc("Pasted results go under a heading in today's daily note (needs the Daily notes core plugin).")
			.addToggle((t) =>
				t.setValue(settings.logToDailyNote).onChange(async (v) => {
					settings.logToDailyNote = v;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Daily note heading")
			.setDesc("A Markdown heading such as ## Daily games.")
			.addText((t) => {
				t.inputEl.maxLength = LIMITS.heading;
				t.setValue(settings.dailyNoteHeading).onChange((v) => {
					const heading = singleLine(v, LIMITS.heading);
					settings.dailyNoteHeading = /^#{1,6} \S/.test(heading) ? heading : DEFAULT_SETTINGS.dailyNoteHeading;
					this.saveSoon();
				});
			});

		new Setting(containerEl)
			.setName("Games")
			.setHeading()
			.addButton((b) =>
				b
					.setButtonText("Add game")
					.setCta()
					.onClick(() => plugin.editGame(undefined, () => this.display())),
			);

		settings.games.forEach((game, i) => this.renderGameRow(game, i));
		containerEl.scrollTop = scrollTop;
	}

	/** Saves any text still waiting for its pause when the tab closes. */
	hide(): void {
		this.saveSoon.run();
	}

	/**
	 * Draws one game's row with Move up, Move down, Edit and Remove buttons.
	 *
	 * Remove asks for a second click before it deletes the game.
	 *
	 * @param game The game to draw.
	 * @param index The game's position in the list.
	 */
	private renderGameRow(game: Game, index: number): void {
		const { plugin } = this;
		const games = plugin.state.settings.games;
		const desc = [game.category, game.url || "No link yet"].filter(Boolean).join(" · ");
		const row = new Setting(this.containerEl).setName(`${game.emoji} ${game.name}`).setDesc(desc);

		const move = async (offset: number) => {
			[games[index + offset], games[index]] = [games[index], games[index + offset]];
			await plugin.saveAndRefresh();
			this.display();
		};
		row.addExtraButton((b) =>
			b
				.setIcon("arrow-up")
				.setTooltip("Move up")
				.setDisabled(index === 0)
				.onClick(() => void move(-1)),
		);
		row.addExtraButton((b) =>
			b
				.setIcon("arrow-down")
				.setTooltip("Move down")
				.setDisabled(index === games.length - 1)
				.onClick(() => void move(1)),
		);
		row.addExtraButton((b) =>
			b
				.setIcon("pencil")
				.setTooltip("Edit")
				.onClick(() => plugin.editGame(game, () => this.display())),
		);

		let armed = false;
		row.addButton((b) =>
			b
				.setIcon("trash-2")
				.setTooltip("Remove")
				.onClick(async () => {
					if (!armed) {
						armed = true;
						b.setButtonText("Remove?").setWarning();
						return;
					}
					games.splice(index, 1);
					await plugin.saveAndRefresh();
					this.display();
				}),
		);
	}
}
