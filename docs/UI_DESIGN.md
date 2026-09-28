# macOS-native UI design

This app is Mac-only, on purpose — not a cross-platform app that happens to
run on macOS. That's a real constraint (see Distribution below) and a real
advantage: build to macOS's own conventions instead of a lowest-common-
denominator UI, and lean on system chrome wherever it exists instead of
redrawing it.

## What "native-feeling Electron" actually means

Electron doesn't have to look like a web page in a window. Apps like
Notion, Linear, and VS Code prove a web-rendered app can pass as native if
it borrows the platform's own visual language rather than inventing its
own. The concrete pieces:

- **Window chrome:** `titleBarStyle: 'hiddenInset'` with `trafficLightPosition`
  set — real macOS traffic-light controls, positioned deliberately. No
  custom-drawn close/minimize/maximize buttons pretending to be native ones.
- **Vibrancy:** use `BrowserWindow`'s `vibrancy` option (`'sidebar'` for the
  left pane, `'under-window'` or `'hud'` elsewhere) for the translucent
  blur-behind-content look that reads as unmistakably macOS — Finder, Mail,
  and Messages all use it for their sidebars.
- **System font:** `-apple-system, "SF Pro Text", system-ui` in the base
  CSS, not a bundled web font. Text should render like the OS's own UI, not
  like a website.
- **System accent color and appearance:** read the OS accent color via
  `systemPreferences` and follow `nativeTheme.shouldUseDarkColors` rather
  than hard-coding a brand color and a manual light/dark toggle — the app
  should look like it belongs to whatever setup the person already has.
- **Native application menu:** a real macOS menu bar
  (`Menu.setApplicationMenu`) with File/Edit/View/Window/Help and working
  keyboard shortcuts — ⌘N new company, ⌘K a Spotlight-style quick switcher
  between companies/workers/channels, ⌘, for Settings, ⌘⇧A for the
  Approvals inbox. A Mac app without a working menu bar reads as unfinished
  regardless of how the rest of it looks.
- **Settings as a compact window, not a page:** a small, tabbed Settings
  window — the way native Mac apps (and System Settings itself) do it —
  opened with ⌘,, not a full route inside the main three-pane layout.
- **Native notifications:** the macOS `Notification` API for approval
  alerts (already required in `docs/ORCHESTRATION.md`), not an in-app toast
  standing in for one.
- **Corner radii and shadows:** follow macOS's current visual language
  (continuous corner radii, restrained shadow depth) rather than a generic
  web-app card style.

## Sidebar

The left sidebar (companies → channels/workers, from `docs/STRUCTURE.md`'s
renderer layout) should read like Finder's or Mail's: vibrancy background,
a selection highlight that follows the system accent color, resizable and
collapsible. This is the single biggest lever for "feels native" — it's
the part of the window a person looks at constantly.

## Distribution

Because this is Mac-only, lean into macOS's actual distribution path
rather than treating packaging as an afterthought:

- **Code signing and notarization** (Apple Developer ID) are required for
  the app to launch without a Gatekeeper warning. This isn't optional
  polish — it's the difference between "just works" and macOS telling the
  person this is from an unidentified developer on first launch.
- **A properly arranged DMG** — background image, an Applications-folder
  shortcut — the standard drag-to-Applications installer every Mac user
  already knows how to use.
- **Mac App Store is likely not viable for v1**, worth knowing now rather
  than at submission time: App Store sandboxing restricts exactly what
  this app needs — Docker access for `run_code`, broad filesystem access
  for the workspace sandbox, and browser automation for `browse`. Direct,
  notarized distribution outside the App Store — the same path Docker
  Desktop and most professional dev tools use — is the realistic plan.
  Revisit only if a future version drops those capabilities.
- **Apple silicon is a first-class target, not an afterthought.** Every
  packaging step (signing, notarization, DMG) applies to both
  architectures — see the note below on how `electron-builder` produces
  them.

`docs/ROADMAP.md`'s M10 includes signing/notarization and DMG styling as
concrete required tasks, not implied by "packaging."

### x64 and arm64: universal binary vs. two builds

`electron-builder` supports both approaches; pick per M10, not now:

- **Two separate DMGs** (`--x64` and `--arm64` builds) — smaller downloads,
  each running natively, and simpler to reason about since this repo is
  developed on x64. Requires a download page that can tell people which
  one to get (or a single page with both links and short instructions —
  "Apple Silicon" vs "Intel").
- **One universal binary** (`--universal`) — a single DMG that contains
  both architectures and runs natively on either, at roughly double the
  file size and build time. Simpler distribution story (one link, no
  wrong-download risk) at the cost of a heavier download.
For a small, direct-distribution app, two separate DMGs with a clear
download page are usually the better trade — Apple's own guidance favors
universal builds mainly for App Store submission, which this app isn't
targeting anyway (see above). Revisit if `docs/ROADMAP.md`'s M10 decides
otherwise.

### If this goes on sale later

None of this is v1 scope (`docs/ROADMAP.md`'s non-goals still hold: no
accounts, no in-app billing infrastructure), but the direct-notarized-
distribution path above already keeps the door open, so it's worth naming
what "later" would actually add on top, without building any of it now:

- **Auto-updates** — `electron-updater` (or `electron-builder`'s built-in
  update server support) checking a release feed, so paying users aren't
  manually reinstalling DMGs. Additive; doesn't touch app architecture.
- **Licensing** — a one-time-purchase or license-key check (e.g. via
  Gumroad, Paddle, or Stripe's own checkout) gating first launch or a
  feature tier. This is a distribution-layer concern, separate from the
  in-app "no accounts/billing" non-goal, which is about not building
  multi-user SaaS infrastructure into the app itself — a single license
  check for a single-user local app is a much smaller thing.
- **Mac App Store stays off the table** even at that point, for the same
  sandboxing reasons above, unless a future version scopes down to drop
  `run_code`/`browse`/broad filesystem access.

Flag this to Claude Code only when M10 (or a later milestone) is actually
reached — no need to design it in advance.
