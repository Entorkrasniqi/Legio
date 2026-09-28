# DevOps: CI, pre-commit, testing layers, and releases

Testing requirements already exist per milestone in `docs/ROADMAP.md` and
`CLAUDE.md`'s definition of done (typecheck, lint, unit tests). This doc is
what makes that self-enforcing rather than a promise: continuous
integration, pre-commit hooks, a second testing layer above unit tests, and
how a release actually gets built, signed, and shipped.

This matters more than it would on a typical solo project: this codebase is
built by Claude Code across many sessions and milestones. CI is the
independent check that "typecheck/lint/test pass" is actually true in a
clean environment — not just true in whatever state one working directory
happened to be in when a session ended.

## Continuous integration

A GitHub Actions workflow (`.github/workflows/ci.yml`) on every push and pull
request. It runs on macOS only, since this is a Mac-only app, as a matrix of
`macos-latest` (Apple silicon) and an Intel runner, because development
happens on x64 and native rebuilds must be proven on both. A separate
`gitleaks` job re-runs the secret scan server-side, since a local hook can
be skipped. Steps:

1. Install dependencies
2. Rebuild native modules for the CI runner's architecture (same concern as
   local dev — see `docs/ARCHITECTURE.md` and `README.md`)
3. `npm run typecheck`
4. `npm run lint`
5. `npm test` (the vitest suite — mocked Anthropic client, no real API
   spend, per `CLAUDE.md`)
6. `npm audit` (or equivalent) — surface known-vulnerable dependencies;
   doesn't have to hard-fail on every advisory, but must not be silently
   ignored

A milestone isn't "done" on the strength of a local run alone once this
exists — the same commit should also pass in CI, since that's the only
environment free of local-machine drift.

## Pre-commit hooks

`husky` + `lint-staged`, so problems are caught before they're even
committed, not only in CI:

- Lint and format staged files.
- **Secret scanning** (e.g. `gitleaks` or an equivalent pattern-based
  scanner) — this is what actually *enforces* the "no secrets in git" rule
  in `docs/SECURITY.md` and `CLAUDE.md`, rather than leaving it as
  something someone has to remember. A commit matching a likely API
  key/token pattern is blocked, not just flagged after the fact.

Pre-commit hooks are a speed bump, not a substitute for CI — CI is the
authoritative check; the hook exists so most problems never reach a commit
at all.

## A second testing layer: end-to-end smoke tests

The unit tests required per milestone (`CLAUDE.md`) test logic in
isolation with a mocked Anthropic client. They don't prove the actual
Electron app boots, migrates its database, and completes a real turn. Add
a small Playwright-based Electron test suite (Playwright has first-class
Electron support) covering, at minimum:

- The app launches and the main window renders.
- A fresh database migrates cleanly on first run.
- Settings accepts an API key and a test call succeeds. **Decided (M1):
  mocked.** The E2E suite starts a local stub of the Messages endpoint and
  points the unpackaged app at it via `LEGIO_ANTHROPIC_BASE_URL`, so CI needs
  no API key and never spends credit. The real call is verified by hand on
  the dev Mac once per milestone that touches the API path.
- One worker completes one full turn in a direct chat and the message
  persists.

Extend this suite as milestones land (a hand-off smoke test after M4, an
approval-flow smoke test after M5) rather than trying to write it all at
once in M1 — it should grow with the app, the same way the unit test
requirements do.

## Release pipeline

`docs/UI_DESIGN.md` and `docs/ROADMAP.md`'s M10 already require code
signing, notarization, and a properly arranged DMG — this is how that
actually happens, reproducibly, for both x64 and arm64:

1. `electron-builder` build for each architecture.
2. Code sign with the Apple Developer ID certificate.
3. Notarize with Apple's notary service and staple the ticket.
4. Produce the DMG (with the Applications-folder shortcut and background
   image from `docs/UI_DESIGN.md`).

Script this (a `package.json` release script or a small shell script) even
if it isn't run inside CI — Apple notarization needs credentials that must
never sit in a public CI log or in git. Keep signing/notarization
credentials in the local Keychain or a git-ignored `.env` (see
`docs/SECURITY.md`), and prefer running the actual release build locally,
or in a private, credential-scoped CI job, rather than a public one. The
goal is a **repeatable, scripted** release — not necessarily a fully
automated one. Those aren't the same thing, and putting notarization
credentials on a shared CI runner is a bigger risk than it's worth for a
solo project.

## Keeping Electron itself current

Electron ships its own Chromium and Node — a stale Electron version means
known, public Chromium CVEs sitting in a shipped app. Keep Electron
reasonably current as routine maintenance, not something deferred
indefinitely. A dependency update tool (Dependabot/Renovate, or a manual
periodic check) belongs here specifically because Electron's update
cadence matters more for security than most other dependencies do.
