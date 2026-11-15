/**
 * @fileoverview Data model of the plugin: games, settings, saved state and their defaults.
 */

/** A daily game shown as a card on the board. */
export interface Game {
	/** Stable identifier, so renaming a game keeps its history. */
	id: string;
	/** Name shown on the card. */
	name: string;
	/** Page with today's puzzle. Empty until the user adds a link. */
	url: string;
	/** Emoji drawn on the card cover when there is no cover image. */
	emoji: string;
	/** Accent colour of the card cover and progress segment, as a CSS colour. */
	color: string;
	/** Category label; games that share one get a filter chip. */
	category: string;
	/** One line describing the game, shown under its name. */
	blurb: string;
	/** Optional cover image URL that replaces the emoji tile. */
	image: string;
}

/** Where a game opens when its card is clicked. */
export type OpenIn = "webviewer" | "browser";

/** User settings, edited in the settings tab. */
export interface Settings {
	/** Title of the board's masthead and tab. */
	title: string;
	/** Games in board order. */
	games: Game[];
	/** Where games open; Cmd/Ctrl-click opens them the other way. */
	openIn: OpenIn;
	/** Whether opening a game marks it played. */
	markPlayedOnOpen: boolean;
	/** Hour (0–6) at which a new game day starts, for playing past midnight. */
	dayStartsAt: number;
	/** Whether the first result of the day is added to the daily note. */
	logToDailyNote: boolean;
	/** Markdown heading that results go under in the daily note. */
	dailyNoteHeading: string;
}

/** Everything the plugin saves to its data file. */
export interface PluginData {
	/** User settings. */
	settings: Settings;
	/** Day key (YYYY-MM-DD) to the IDs of the games played that day. */
	plays: Record<string, string[]>;
	/** Day key to game ID to the share text pasted for that game. */
	results: Record<string, Record<string, string>>;
	/** Whether the board hides games already played today. */
	unplayedOnly: boolean;
}

/** Games a new install starts with; users add their own from the board or settings. */
export const DEFAULT_GAMES: Game[] = [
	{
		id: "farflung",
		name: "Farflung",
		url: "https://farflung.game",
		emoji: "🌍",
		color: "#7aa86a",
		category: "Geography",
		blurb: "Pin a country for five prompts. Rarer answers take you further.",
		image: "",
	},
	{
		id: "krillion",
		name: "Krillion",
		url: "https://krillion.io",
		emoji: "🦐",
		color: "#e06c75",
		category: "Trivia",
		blurb: "Seven prompts a day. Rare answers sink you deeper.",
		image: "",
	},
	{
		id: "spotle-movies",
		name: "Spotle Movies",
		url: "https://spotle.movie",
		emoji: "🎬",
		color: "#d19a66",
		category: "Movies",
		blurb: "Guess the mystery film in ten tries.",
		image: "",
	},
];

/** Settings a new install starts with. */
export const DEFAULT_SETTINGS: Settings = {
	title: "Daily Games",
	games: DEFAULT_GAMES,
	openIn: "webviewer",
	markPlayedOnOpen: true,
	dayStartsAt: 0,
	logToDailyNote: true,
	dailyNoteHeading: "## Daily games",
};

/**
 * Creates an empty game for the "Add game" form.
 *
 * @return A game with no name or link and a default emoji and colour.
 */
export function blankGame(): Game {
	return { id: "", name: "", url: "", emoji: "🎲", color: "#7aa2f7", category: "", blurb: "", image: "" };
}

/**
 * Creates a stable identifier for a new game.
 *
 * @param name The game's name, used to make the ID readable.
 * @return A slug of the name with a short random suffix, e.g. `spotle-movies-k3f9`.
 */
export function newGameId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `${slug || "game"}-${Math.random().toString(36).slice(2, 6)}`;
}
