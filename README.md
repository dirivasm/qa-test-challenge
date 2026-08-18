# Portfolio Value Acceptance Tests

An end-to-end browser test that logs into a crypto-exchange account, reads the displayed total portfolio value, and asserts it is a valid, non-negative number. An optional expected-value config lets you assert an exact amount.

Built with [Playwright](https://playwright.dev) + TypeScript. Runs headless on Linux (Ubuntu/Alpine) and locally on macOS / Windows.

---

## Part 1 — Manual & Exploratory Testing

See [README-Manual.md](./README-Manual.md) for the full set of manual test cases (login happy/sad paths, portfolio display, buy/deposit/withdraw flows, responsive checks) and exploratory notes gathered before automation was written.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| **Node.js** | 18 LTS | https://nodejs.org/en/download |
| **npm** | 8 (bundled with Node) | — |
| **Git** | any | https://git-scm.com |

No prior Playwright knowledge is needed — the steps below handle everything.

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd test-challenge
npm install
```

### 2. Install the Playwright browser

```bash
npx playwright install chromium --with-deps
```

> `--with-deps` also installs the OS-level libraries Chromium needs. On a fresh Ubuntu/Alpine CI image this is required; on macOS it is optional but harmless.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | ✅ | Full base URL of the exchange platform, e.g. `https://example.com` |
| `USERNAME` | ✅ | Account email or username |
| `PASSWORD` | ✅ | Account password |
| `EXPECTED_PORTFOLIO_VALUE` | ❌ | If set, the test also asserts the portfolio equals this exact amount (e.g. `0` for a zero-balance account). Leave blank to skip exact-match assertion. |
| `EMAIL` | ❌ | Gmail address to poll over IMAP for the device-approval email. Only needed if the approval gate appears during `npm run auth:save`. |
| `GMAIL_APP_PASSWORD` | ❌ | A [Gmail App Password](https://myaccount.google.com/apppasswords) (16 chars, **not** your regular Gmail password) used to authenticate the IMAP connection. Requires 2-Step Verification enabled on the Google account. |
| `TOTP_PASSKEY` | ❌ | The base32 authenticator-app secret (the long setup key shown next to the QR code when 2FA was enabled — not a 6-digit code). Only needed if the authenticator-app 2FA prompt appears during `npm run auth:save`. |

> **Security:** `.env` is listed in `.gitignore` and will never be committed. Never commit real credentials.

---

## Running the tests

### 1. Save authentication state (one-time setup)

The platform uses per-device approval. To avoid running the email approval step on every test run, generate a saved auth state once from a machine on a trusted network:

```bash
npm run auth:save
```

This opens a headed browser, performs login, waits for the dashboard to load, and saves the session cookies to `.auth/user.json` (gitignored). If a 2FA or device-approval prompt appears, the script automatically solves it — generating the TOTP code and/or checking the `EMAIL` inbox over IMAP for the Kraken approval email — no manual code-reading or email-checking required (see [Known limitations — login gates](#known-limitations--login-gates-2fa--device-approval) below).

> **Note:** `.auth/user.json` contains session tokens. Never commit it. Share it with CI via the `AUTH_STATE_JSON` secret (see CI/CD section below).

### 2. Run headless (default — used in CI)

```bash
npm test
```

### 3. Run headed (useful for local debugging)

```bash
npm run test:headed
```

### 4. View the HTML report after a run

```bash
npm run report
```

The report opens in your browser and includes screenshots/traces for any failure.

---

## Project structure

```
.
├── config/
│   └── env.ts                   # Reads and validates environment variables
├── pages/
│   ├── BasePage.ts              # Shared page handle and navigation helper
│   ├── LoginPage.ts             # Login form interactions + device-approval detection/handling
│   └── PortfolioPage.ts        # Portfolio page + total value reader
├── services/
│   ├── GmailApprovalService.ts  # Reads Gmail over IMAP to auto-fetch the device-approval link
│   └── TotpService.ts           # Generates authenticator-app (TOTP) 2FA codes
├── tests/
│   ├── auth.setup.ts             # Logs in, auto-solves 2FA/device-approval gates if needed, saves storageState
│   └── portfolio-value.spec.ts  # The acceptance test
├── .env.example                 # Config template (copy to .env)
├── playwright.config.ts         # Playwright configuration
├── tsconfig.json
├── package.json
└── README-Manual.md             # Part 1 — manual test cases and exploratory notes
```

---

## Known limitations — login gates (2FA & device approval)

Logging in from an **unrecognised device or browser** can trigger up to two extra gates before reaching the dashboard, in whatever order the platform presents them:

- An **authenticator-app 2FA prompt** ("Enter the Sign-in 2FA code from your authenticator app").
- A **device-approval-by-email prompt** ("Approve this device — check your email").

This project handles both automatically, end-to-end, with no manual code-reading or email-checking:

1. Run `npm run auth:save` **once** (locally or in CI).
2. `auth.setup.ts` logs in, then loops: whichever gate is currently on screen gets solved, until the dashboard loads.
   - **2FA gate** → [`TotpService`](./services/TotpService.ts) generates the current 6-digit code from the `TOTP_PASSKEY` base32 secret and submits it.
   - **Device-approval gate** → [`GmailApprovalService`](./services/GmailApprovalService.ts) connects to the `EMAIL` inbox over IMAP (using `GMAIL_APP_PASSWORD`), polls for the "new device wants to sign in" email from Kraken sent after the login attempt started, parses it, and extracts the **Approve Device** link, then opens it in a separate tab to confirm the device.
3. The resulting session is saved to `.auth/user.json` and reused for all subsequent test runs — the login/2FA/approval steps are skipped entirely while that file exists.
4. For CI, encode the file to base64 and store it as the `AUTH_STATE_JSON` secret (see CI/CD section) — or provide `EMAIL` / `GMAIL_APP_PASSWORD` / `TOTP_PASSKEY` as secrets so CI can self-heal by solving a fresh gate if the saved state is missing or has expired.

If a saved auth state is not available and the required secret(s) for whichever gate appears are not set, `auth.setup.ts` fails fast with a clear, descriptive error.

### Automated 2FA (TOTP)

`TotpService` (in [services/TotpService.ts](./services/TotpService.ts)) generates the current 6-digit authenticator code from the `TOTP_PASSKEY` base32 secret (the same secret an authenticator app like Google Authenticator or Authy would be seeded with) using the standard TOTP algorithm (SHA-1, 6 digits, 30-second period) — no phone required.

> **Security:** `TOTP_PASSKEY` is the long setup key shown once when 2FA is first enabled (usually alongside a QR code), not a one-time 6-digit code. Treat it like a password — it's read from `.env` (gitignored) and never logged or written to disk.

### Automated device-approval gate

`GmailApprovalService` (in [services/GmailApprovalService.ts](./services/GmailApprovalService.ts)):

- Connects to `imap.gmail.com:993` using `EMAIL` + `GMAIL_APP_PASSWORD`.
- Searches the inbox for messages from `kraken.com` received after the login attempt started, with a subject matching device/approval/sign-in wording.
- Parses the email body and extracts the link whose text/href hints at approval (e.g. the **"Approve Device"** button), falling back to the first link in the email if no obvious match is found.
- Polls every 5 seconds (configurable) for up to 60 seconds (configurable) to allow for email delivery delay.
- Marks the matched email as read once processed, so it isn't reused on a later run.

> **Security:** Use a dedicated [Gmail App Password](https://myaccount.google.com/apppasswords) — never your main Gmail account password — scoped only to this use case. `EMAIL` and `GMAIL_APP_PASSWORD` are read from `.env` (gitignored) and are never logged or written to disk.

---

## CI/CD

The workflow is at [.github/workflows/portfolio-value-tests.yml](.github/workflows/portfolio-value-tests.yml).

### Triggering manually

Go to **Actions → Portfolio Value Tests → Run workflow** in the GitHub UI. You can optionally override `BASE_URL` for a different environment.

### Required repository secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `BASE_URL` | Platform base URL |
| `USERNAME` | Account email / username |
| `PASSWORD` | Account password |
| `AUTH_STATE_JSON` | Base64-encoded contents of `.auth/user.json` (generated with `npm run auth:save`) |
| `EMAIL` | (Optional) Gmail address — lets CI self-heal via the automated device-approval flow if `AUTH_STATE_JSON` is missing/expired |
| `GMAIL_APP_PASSWORD` | (Optional) Gmail App Password matching `EMAIL` — required alongside `EMAIL` for the self-healing flow |
| `TOTP_PASSKEY` | (Optional) Base32 authenticator-app secret — lets CI self-heal past the 2FA gate if `AUTH_STATE_JSON` is missing/expired |
| `EXPECTED_PORTFOLIO_VALUE` | (Optional) expected portfolio amount |

**To encode the auth state for CI:**

```bash
base64 -i .auth/user.json | pbcopy   # macOS — pastes directly to clipboard
base64 -w 0 .auth/user.json          # Linux
```

Paste the output as the `AUTH_STATE_JSON` secret value.

### How failures surface

- The GitHub Actions run turns red and a summary is shown directly in the PR/commit status check.
- A `playwright-report` artifact (HTML report + traces + screenshots) is **always** uploaded, even on failure, so you can inspect exactly which step failed and replay the browser trace.
- For team notifications, a Slack/Teams notification step can be appended after the artifact upload with `if: failure()`.

### Extending to scheduled/gated runs

```yaml
on:
  workflow_dispatch: {}          # manual trigger (already wired)
  schedule:
    - cron: '0 6 * * *'         # nightly at 06:00 UTC
  pull_request:
    branches: [main]            # required check before merging
```

Making the job a **required status check** in branch protection settings ensures no deploy goes out if the acceptance test is red.
