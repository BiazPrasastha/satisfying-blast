# Satisfy Blast

A block puzzle in plain HTML, CSS and JavaScript. It is a single page app: no build step and nothing to install.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page and app shell, and the service worker registration |
| `styles.css` | Look and animations |
| `engine.js` | Board rules, bomb, and the dealer that picks pieces to fit the board |
| `highscore.js` | The best score, kept in its own storage entry |
| `game.js` | Dragging, undo, guidance, effects, saving |
| `favicon.svg` | Tab icon |
| `manifest.webmanifest` | Web app manifest (name, colours, icons) |
| `sw.js` | Service worker: offline play and install support |
| `icons/` | App icons (192, 512, maskable, Apple touch) and `og-image.png` for link previews |
| `_redirects` | SPA fallback for Cloudflare Pages and Netlify |
| `404.html` | SPA fallback for GitHub Pages and other static hosts |
| `.nojekyll` | Stops GitHub Pages from dropping files that start with `_` |
| `tools/make-icons.py` | Regenerates the icons and `favicon.svg` (standard library only) |

The whole app is `index.html`, so every route is served by the one shell. `_redirects` (Cloudflare Pages / Netlify) and `404.html` (GitHub Pages) make deep links land on the app.

## Install it as an app

Open the site in a browser and choose **Install** (or **Add to Home Screen** on a phone). It then opens full screen like a native app and keeps working offline, because `sw.js` caches the app shell.

When you change app files, bump `VERSION` at the top of `sw.js` so returning players pick up the new build.

## Deploy on Cloudflare Pages

**Upload the folder (quickest)**

1. Open the Cloudflare dashboard, then Workers & Pages, then Create, then Pages, then Upload assets.
2. Name the project `satisfy-blast`.
3. Drag in the files from this folder (or the zip), with `index.html` at the top level.
4. Deploy. The site goes live at an address like `https://satisfy-blast.pages.dev` (Cloudflare adds a few characters if the name is taken).

To update later, open the project, choose Create deployment, and upload the files again.

**Connect a Git repository**

1. Push this folder to a repository.
2. In Pages choose Connect to Git and pick the repository.
3. Use these build settings:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `exit 0` |
   | Build output directory | `/` |

   `exit 0` is Cloudflare's recommended no-op build command (it also keeps Pages Functions available). The output directory is `/` because `index.html` sits at the top level of the repository. Leave the root directory at its default.

### Other hosts

- **Netlify** works as is: it reads the same `_redirects` file.
- **GitHub Pages** works as is: `.nojekyll` keeps underscore files, and `404.html` covers unknown routes. Publish the branch root.

## Link previews (sharing)

When the link is shared, the preview title, description and image come from the Open Graph and X/Twitter tags in `index.html`, using `icons/og-image.png` (1200x630).

Social networks do not resolve relative paths, so `og:url` and `og:image` are hardcoded to the live address, `https://satisfy-blast.az-tech.my.id/`. If the site moves to another domain, update those tags: search `index.html` for `az-tech.my.id` and replace every occurrence with the new address. After deploying, use each platform's debugger (Facebook Sharing Debugger, LinkedIn Post Inspector, X Card Validator) to refresh a cached preview.

## High score

The best score is saved on the player's device under `satisfy-blast.highscore.v1`, separate from the saved game and the settings. New games, game updates and new deploys do not reset it. It is saved per browser and per site address, so it will not follow a player to another phone or to a different domain.

To set a score to beat on every device, raise `SEED` at the top of `highscore.js` and deploy. The best score shown is never lower than `SEED`.

## Settings

The gear menu holds two options. Both are remembered on the device.

- **Kindness** is how often the next three pieces are picked to fit the board (90, 60 or 30 percent). The rest are random.
- **Guided** is off by default. When it is on, the piece to use next is outlined and the spot for it pulses on the board, on every turn.

## Try it on your computer

Open `index.html` in a browser, or run `npx serve` in this folder. The fonts load from Google Fonts, so the first load needs a connection.

## Icons

The icons and `favicon.svg` are already in the project. To rebuild them after a design change:

```
python3 tools/make-icons.py
```

It uses only the Python standard library, so there is nothing to install.
