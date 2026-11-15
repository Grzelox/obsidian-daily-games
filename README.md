# Daily Games

A front page in Obsidian for the daily puzzle and trivia games you play: a grid of cards that shows what's left today, keeps streaks, and saves your results to your daily note.

![The Daily Games board](docs/screenshot.png)

## Features

- **A board for your games.** Each game is a card with a colour, an emoji or cover image, and a category. A header shows today's date, how many games you've played and your streak.
- **Played today.** Opening a game marks it played. Marks reset at midnight, or at a later hour if you play late. A progress bar fills in one coloured segment per game.
- **Streaks.** Each game counts the days in a row you've played it. The header counts the days in a row you've played anything.
- **Results.** Paste a game's share text (the 🟩🟨 grid). It shows on the card and is added to today's daily note under a heading of your choice.
- **Filters.** Filter by category, or show only games you haven't played. **Play next** opens the next unplayed game.
- **Opens inside Obsidian.** With the Web viewer core plugin on, games open in an Obsidian tab. Cmd/Ctrl-click opens them in your browser instead, and a setting swaps the two.
- **Follows your theme.** Colours, corners and fonts come from your theme, in light and dark mode.

## Usage

Open the board from the dice icon in the ribbon, or with the **Daily Games: Open board** command.

To put the board in a note, such as a homepage or a daily note template, add a `daily-games` code block:

````markdown
```daily-games
```
````

Options, one per line inside the block:

| Option | Effect |
| --- | --- |
| `compact: true` | A one-line header instead of the large masthead. |
| `category: Trivia` | Show only one category. |

Add, edit, reorder and remove games in **Settings → Daily Games**, or with **Add game** on the board.

### Results in your daily note

When you save the first result for a game today, it's added to today's daily note as a callout:

```markdown
## Daily games

> [!success] 🎬 Spotle Movies
> Spotle Movies #142
> 🟨🟥🟩🟩 4/10
```

This needs the **Daily notes** core plugin. If today's note doesn't exist yet, it's created from your daily note template. You can turn this off or change the heading in settings.

## Settings

| Setting | Default |
| --- | --- |
| Title | Daily Games |
| Open games in | Obsidian web viewer (falls back to the browser when Web viewer is off) |
| Mark played when opened | On |
| New day starts at | Midnight |
| Add results to the daily note | On |
| Daily note heading | `## Daily games` |

## Privacy

The plugin makes no network requests of its own. Game pages load only when you open them, in Obsidian's Web viewer or your browser. Cover images, if you set any, load from the links you give. Play history and results stay in the plugin's data file in your vault.

## Installation

From Obsidian: **Settings → Community plugins → Browse**, search for "Daily Games", then install and enable it.

Manually: download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest) into `<your vault>/.obsidian/plugins/daily-games/`, then enable the plugin in **Settings → Community plugins**.

## Development

```bash
npm install
npm run dev        # rebuild on change
npm run build      # type-check and production build
npm run lint       # Obsidian's ESLint rules
npm run install-plugin -- "/path/to/vault"   # copy the build into a vault
```

### Releasing

```bash
npm version patch   # bumps package.json, manifest.json and versions.json, and tags
git push --follow-tags
```

The GitHub Actions workflow builds the tag and publishes a release with `main.js`, `manifest.json` and `styles.css`.

## License

[MIT](LICENSE)
