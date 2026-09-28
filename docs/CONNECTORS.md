# Connector catalog

This is a catalog of connector categories to wire in as workers actually
need them — not a build-all-at-once checklist. Each one plugs into the
generic mechanism already defined in `docs/ARCHITECTURE.md` (`MCPManager`)
and `docs/DOMAIN_MODEL.md` (`connectors` / `worker_connectors`): add it once
as a company-level connector, grant it to the specific workers that need it,
and every tool call it exposes goes through the same risk classifier and
`ApprovalsGate` as anything else (`docs/ORCHESTRATION.md`).

Two entries here aren't ordinary MCP connectors and get their own sections
at the bottom, with full specs in `docs/SECURITY.md`: **browser automation**
and **document generation**, because they need more than "point at an MCP
server."

## How to read each entry

- **Mechanism** — `mcp` (use an existing MCP server, stdio or HTTP), or
  `custom` (no suitable MCP server exists; build a small tool that calls
  the service's own API directly, behind the same connector abstraction).
  Treat `mcp` as "check whether a current server exists" — availability
  changes; verify rather than assume.
- **Default risk** — how its write-type actions are classified out of the
  box. Read-only calls (listing, searching, fetching) are safe by default
  regardless of category, per the general rule in `docs/ORCHESTRATION.md`.
  Defaults can be tightened per worker; they should not be loosened below
  what's listed here without a specific reason written down at the point
  it's changed.

## Communication

| Service | Mechanism | Default risk |
| --- | --- | --- |
| Gmail / Outlook | mcp | Sending = risky. Reading/drafting = safe. A multi-recipient send goes through the **campaign approval** path in `docs/ORCHESTRATION.md`, not one prompt per email. The connector should throttle to the account's real sending limit (roughly 500/day on personal Gmail, 2,000/day on Google Workspace) and queue rather than error out. See that doc's compliance note before running real outreach. |
| Google Calendar | mcp | Creating/moving an event with attendees = risky. Reading availability = safe. |
| Slack / Microsoft Teams | mcp | Posting = risky. Reading channels = safe. |
| Twilio (SMS/WhatsApp) | custom | Sending = always risky — real cost, reaches a real person. |

## Money

| Service | Mechanism | Default risk |
| --- | --- | --- |
| Stripe | mcp | Any charge, refund, or payout = always risky, **one approval per transaction** — never batch-approved. |
| QuickBooks / Xero | mcp if available, else custom | Writing a transaction/invoice = risky. Reading reports = safe. |
| Invoicing / quotes | see **Document generation** below | Generating the file is safe (sandbox-only write); *sending* it is whatever channel sends it — e.g. email = risky. |

## Sales and CRM

| Service | Mechanism | Default risk |
| --- | --- | --- |
| HubSpot | mcp | Creating/updating a contact or deal = risky. Reading the pipeline = safe. |
| Salesforce | mcp | Same pattern as HubSpot. |
| Your own database (Postgres/Supabase) | mcp (Postgres MCP server) | Any `INSERT`/`UPDATE`/`DELETE` = risky. `SELECT` = safe. Grant the connector a **read-only DB role** wherever a worker only needs to query — enforce it at the database level, not only in the app. |

## Documents

| Service | Mechanism | Default risk |
| --- | --- | --- |
| DocuSign (e-signature) | mcp or custom | Sending an envelope for signature = risky. Checking status = safe. |
| Google Sheets | mcp | Writing a cell/row = risky. Reading = safe. |

## Web and social

| Service | Mechanism | Default risk |
| --- | --- | --- |
| LinkedIn, X, Instagram | custom, or **browser automation** where no usable API exists | Posting = always risky, full post content shown before approval. |
| A CMS behind your own website | mcp if it has an API, otherwise browser automation | Publishing = risky. Drafting = safe. |

Several social platforms restrict or prohibit third-party automation in
their terms of service and enforce it with rate limits or account
suspensions independent of anything this app does. Worth checking a
platform's current API terms before granting a worker posting access,
rather than assuming a workaround holds up.

## Project and task tools

| Service | Mechanism | Default risk |
| --- | --- | --- |
| Notion | mcp | Writing a page = risky. Reading = safe. |
| Asana / Trello / Jira | mcp | Creating/moving a task = risky. Reading a board = safe. |

## Browser automation (built-in tool, not a connector)

For the long tail of business tools with no usable API — a supplier portal,
a registration system, anything with only a web UI. Architecturally closer
to `run_code` than to an MCP connector: it needs real sandboxing, not just a
stored credential. Full spec is in `docs/SECURITY.md`'s Browser automation
section. Summary:

- Runs in an isolated automation browser profile — **never** the person's
  own signed-in Chrome. Each company gets its own profile, its own
  cookies/storage, separate from anything else on the Mac.
- Site credentials are stored the same way as connector secrets (Keychain),
  scoped to a worker + domain; the worker's tool calls never see the raw
  credential.
- A worker is restricted to an explicit **domain allowlist** — navigating
  outside it fails closed rather than prompting to expand scope mid-run.
- Reading a page is safe; anything with a side effect (submitting a form,
  clicking "pay"/"send"/"post", uploading a file) is risky, and the
  approval includes a **screenshot** of the page plus the exact action, not
  just a text description.

## Document generation (built-in, not a connector)

Generating a PDF, invoice, report, or contract from a template doesn't need
an external service — it's a library running in the main process, writing
into the company's `workspace_dir` like any other file tool. It's **safe**
on its own (it only writes inside the sandbox); the risky step is whatever
*sends* the result — email, DocuSign, a Slack message — and that's governed
by that connector's own rules above.
