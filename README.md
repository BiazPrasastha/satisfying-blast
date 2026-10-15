# RRE Blast

A block puzzle in plain HTML, CSS and JavaScript. There is no build step and nothing to install.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Look and animations |
| `engine.js` | Board rules, bomb, and the dealer that picks pieces to fit the board |
| `highscore.js` | The best score, kept in its own storage entry |
| `game.js` | Dragging, undo, guidance, effects, saving |
| `favicon.svg` | Tab icon |

## Deploy on Cloudflare Pages

**Upload the folder (quickest)**

1. Open the Cloudflare dashboard, then Workers & Pages, then Create, then Pages, then Upload assets.
2. Name the project `rre-blast`.
3. Drag in the files from this folder (or the zip), with `index.html` at the top level.
4. Deploy. The site goes live at an address like `https://rre-blast.pages.dev` (Cloudflare adds a few characters if the name is taken).

To update later, open the project, choose Create deployment, and upload the files again.

**Connect a Git repository**

1. Push this folder to a repository.
2. In Pages choose Connect to Git and pick the repository.
3. Framework preset: None. Build command: leave empty. Build output directory: `/`.

## High score

The best score is saved on the player's device under `rre-blast.highscore.v1`, separate from the saved game and the settings. New games, game updates and new deploys do not reset it. It is saved per browser and per site address, so it will not follow a player to another phone or to a different domain.

To set a score to beat on every device, raise `SEED` at the top of `highscore.js` and deploy. The best score shown is never lower than `SEED`.

## Settings

The gear menu holds two options. Both are remembered on the device.

- **Kindness** is how often the next three pieces are picked to fit the board (90, 60 or 30 percent). The rest are random.
- **Guided** is off by default. When it is on, the piece to use next is outlined and the spot for it pulses on the board, on every turn.

## Try it on your computer

Open `index.html` in a browser, or run `npx serve` in this folder. The fonts load from Google Fonts, so the first load needs a connection.
