/**
 * @fileoverview Forms shown in modals: today's result of a game, and adding or editing a game.
 */

import { App, Modal, Notice, Setting } from "obsidian";
import { LIMITS, linkFromInput, multiLine, sanitizeGame } from "./sanitize";
import type { Game } from "./types";

/** Form for pasting or editing today's share text of one game. */
export class ResultModal extends Modal {
	/**
	 * @param app The Obsidian app.
	 * @param game The game the result belongs to.
	 * @param initial The text saved so far, or an empty string.
	 * @param onSave Called with the cleaned text on Save, or an empty string on Clear.
	 */
	constructor(
		app: App,
		private readonly game: Game,
		private readonly initial: string,
		private readonly onSave: (text: string) => Promise<void>,
	) {
		super(app);
	}

	/** Builds the form: a text area, Paste from clipboard, Clear and Save. */
	onOpen(): void {
		const { contentEl, game } = this;
		this.setTitle(`${game.emoji ? game.emoji + " " : ""}${game.name}: today's result`);
		contentEl.addClass("dg-result-modal");

		const area = contentEl.createEl("textarea", { cls: "dg-result-input" });
		area.value = this.initial;
		area.placeholder = "Paste the share text from the game…";
		area.maxLength = LIMITS.result;
		area.rows = 7;

		const save = () => {
			void this.onSave(multiLine(area.value, LIMITS.result));
			this.close();
		};
		area.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				save();
			}
		});

		const row = new Setting(contentEl);
		row.addButton((b) =>
			b.setButtonText("Paste from clipboard").onClick(async () => {
				try {
					area.value = multiLine(await navigator.clipboard.readText(), LIMITS.result);
					area.focus();
				} catch {
					// The clipboard isn't readable here; typing still works.
				}
			}),
		);
		if (this.initial) {
			row.addButton((b) =>
				b
					.setButtonText("Clear")
					.setWarning()
					.onClick(() => {
						void this.onSave("");
						this.close();
					}),
			);
		}
		row.addButton((b) => b.setButtonText("Save").setCta().onClick(save));
		window.setTimeout(() => area.focus(), 0);
	}

	/** Removes the form. */
	onClose(): void {
		this.contentEl.empty();
	}
}

/** Form for adding a game or editing one. */
export class GameModal extends Modal {
	/** Copy of the game the form edits, so Cancel leaves the original untouched. */
	private readonly draft: Game;

	/**
	 * @param app The Obsidian app.
	 * @param game The game to edit, or a blank game to add.
	 * @param isNew Whether the form adds a game rather than edits one.
	 * @param onSave Called with the edited, validated game when the form is submitted.
	 */
	constructor(
		app: App,
		game: Game,
		private readonly isNew: boolean,
		private readonly onSave: (game: Game) => Promise<void>,
	) {
		super(app);
		this.draft = { ...game };
	}

	/** Builds the form: one field per game property and a submit button. */
	onOpen(): void {
		const { contentEl, draft } = this;
		this.setTitle(this.isNew ? "Add a game" : `Edit ${draft.name}`);

		const text = (name: string, desc: string, key: keyof Game, maxLength: number, placeholder = "") =>
			new Setting(contentEl)
				.setName(name)
				.setDesc(desc)
				.addText((t) => {
					t.inputEl.maxLength = maxLength;
					t.setPlaceholder(placeholder)
						.setValue(draft[key])
						.onChange((v) => (draft[key] = v.trim()));
				});

		text("Name", "", "name", LIMITS.name, "Spotle Movies");
		text("Link", "The page that has today's puzzle. Must be a web link (https://…).", "url", LIMITS.url, "https://…");
		text("Emoji", "Shown on the card when there is no cover image.", "emoji", LIMITS.emoji, "🎬");
		text("Category", "Games with the same category share a filter chip.", "category", LIMITS.category, "Words");
		text("Description", "One line under the name.", "blurb", LIMITS.blurb);
		text("Cover image", "Optional https:// image link; replaces the emoji tile.", "image", LIMITS.url, "https://…/cover.jpg");
		new Setting(contentEl)
			.setName("Colour")
			.setDesc("Card colour and progress segment.")
			.addColorPicker((c) => c.setValue(draft.color || "#888888").onChange((v) => (draft.color = v)));

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText(this.isNew ? "Add game" : "Save")
				.setCta()
				.onClick(() => {
					const url = linkFromInput(draft.url);
					const image = linkFromInput(draft.image, true);
					if (draft.url && !url) {
						new Notice("The link must be a web address starting with https:// or http://.");
						return;
					}
					if (draft.image && !image) {
						new Notice("The cover image must be a web address starting with https://.");
						return;
					}
					const game = sanitizeGame({ ...draft, url, image });
					if (!game) return;
					void this.onSave(game);
					this.close();
				}),
		);
	}

	/** Removes the form. */
	onClose(): void {
		this.contentEl.empty();
	}
}
