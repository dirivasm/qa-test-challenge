# Part 1 — Manual QA & Exploratory Testing

## Test Cases

### Feature: Login

**TC-01 — Happy path: valid credentials on a new device**

*Preconditions:* valid account credentials; browser/device not previously approved for the account; access to the account's email inbox.

1. Navigate to `BASE_URL/sign-in`.
2. Enter a valid email/username and password.
3. Click **Continue**.
   *Expected:* login is not completed on password alone — a device-approval step is presented, instructing the user to confirm via email.
4. Open the approval link from the email (on the same network) and sign in again.
   *Expected:* login completes and the account dashboard loads with the portfolio value visible.

**TC-02 — Invalid credentials**

*Preconditions:* user is signed out.

1. Navigate to `BASE_URL/sign-in`.
2. Enter a non-existent email (e.g. `qa.tester.fake.9821@example.com`) and any password.
3. Click **Continue**.
   *Expected:* sign-in is rejected with a generic error that does **not** reveal whether the account exists; the user remains on the sign-in page with no partial session created.

**TC-03 — Field validation: empty submit & password visibility**

*Preconditions:* user is signed out.

1. Navigate to `BASE_URL/sign-in`.
2. Click **Continue** with both fields empty.
   *Expected:* inline validation messages appear for both fields; no login request is sent.
3. Type a password into the password field.
4. Click the visibility (eye) toggle on the password field.
   *Expected:* the password toggles between masked and plain text.

**TC-04 — Session handling: persistence, logout, and invalidation**

*Preconditions:* user is logged in on an approved device.

1. Close the browser entirely, reopen it, and navigate directly to `/c`.
   *Expected:* the session behaves per policy — either it persists and the dashboard loads, or re-authentication is requested.
2. While authenticated, navigate to `/sign-in` directly.
3. Open the account menu and click **Sign out**.
4. Navigate back to `/c`.
   *Expected:* access is denied and the user is redirected to sign-in — the session is invalidated server-side, so back-navigation cannot leak the authenticated page.

### Feature: Portfolio value

**TC-05 — Zero-balance portfolio display**

*Preconditions:* logged in with an account holding no funds (identity-unverified).

1. Open **Portfolio** (`/c/portfolio`).
   *Expected:* the portfolio value displays $0.00 cleanly — no errors, NaN, or blank areas.
2. Switch the chart through each time range (1W / 1M / 3M / 6M / 1Y / ALL).
3. Review the actions available to an unverified, zero-balance user.
   *Expected:* funding actions are visible, while trading is gated behind identity verification.

**TC-06 — Loading states on a slow network**

*Preconditions:* logged in; ability to throttle the network (browser dev tools or emulation, e.g. ~500 kbps / 400 ms latency).

1. Enable network throttling.
2. Load `/c/portfolio` and observe the page while it loads.
   *Expected:* content loads progressively with placeholders — no broken layout, error flashes, or misleading intermediate values.
3. Wait for the page to finish loading.
   *Expected:* all sections settle with complete data.

### Feature: Buy, deposit & withdraw

> Note: the test account used for this pass is identity-unverified with a zero balance, and this platform requires identity verification before any funds can move. For this account, the actual "happy path" of each flow ends at the verification gate rather than a completed transaction. Re-running these cases on a verified, funded account would be needed to test the full transaction (see risks/questions below).

**TC-08 — Buy**

*Preconditions:* logged in with an account holding funds

1. On the portfolio page, open the **Buy** panel and select an asset (e.g. Bitcoin).
2. Enter an amount to buy.
3. Choose a payment method and click **Buy now** (or the account's equivalent "Review"/confirm action).
   *Expected:* for a verified account with a funded payment method, the purchase completes and the new balance appears in the portfolio. For an unverified account, the flow stops with a clear prompt to verify identity before the purchase can proceed.

**TC-09 — Deposit and withdraw**

*Preconditions:*  logged in with an account holding funds

1. Click **Deposit** and choose a funding method (e.g. bank transfer or crypto address).
   *Expected:* for a verified account, a deposit is initiated and reflected in the portfolio once it clears. For an unverified account, the flow stops with a clear prompt to verify identity first.
2. Click **Withdraw**.
   *Expected:* for an account with funds, a withdrawal can be requested against the available balance. For an account with nothing to withdraw, the flow clearly explains why (no funds yet) rather than failing silently or erroring.

### Feature: Responsive / mobile

**TC-07 — Login and portfolio on mobile & tablet**

*Preconditions:* device emulation available (or a real mobile browser); valid session for the portfolio step.

1. Load `/sign-in` in a phone-sized viewport 
   *Expected:* the form is usable with no horizontal scrolling and adequately sized tap targets.
2. Load `/c/portfolio` in the same emulation while logged in.
   *Expected:* the layout adapts at each breakpoint without overflow, and the portfolio's key actions remain reachable.

## Exploratory notes

**Issues & observations**

- The "Your Balances" section on the portfolio page is completely empty for a new account. There's a heading, a greyed-out "Convert small balances" button that does nothing. 
- The eye icon next to the portfolio value works nicely (it hides the amount and stays hidden when I move to other pages), but the chart stays visible. If someone had money in the account, the chart would still show how their balance moved, which slightly defeats the point of hiding it. (This is just my assumption)
- The error for a wrong login says "If email sign-in is disabled on your account, please try again with your username instead." Most people won't know what that means, and it shows even for accounts that never touched that setting
- Clicking Withdraw with nothing in the account shows a clear "No assets available to withdraw" message with a button straight to Deposit — a good touch, it doesn't just error out.
- Deposit and Buy both stop at a "get verified" screen for this account, so I couldn't see what a completed purchase, deposit, or withdrawal actually looks like end to end.

**Untested areas**

- Account lockout / rate limiting after repeated failures
- 2FA variants (TOTP, passkey, security key) 
- Idle session timeout
- Verified-account portfolio (non-zero balances, calculations, currency switching)
- A completed Buy, Deposit, or Withdraw — this account never got past the identity verification step, so the actual money-movement flows are untested

**Questions for product / engineering**

- What is the idle session timeout policy, and does "remember this device" have an expiry?
- Is device approval bound to IP, browser fingerprint, or a cookie? What's the intended behavior for VPN/CGNAT users?
- Is there a staging/sandbox environment with seeded test accounts, so lockout and funded-portfolio scenarios can be tested safely?
- On slow connections the headline portfolio value renders before balance data finishes loading. For a funded account, can it transiently display $0.00 (or a stale value) before settling? Verified only with a zero-balance account here.

## Responsive / mobile check summary

- **iPhone 17 Pro Max:** sign-in and logged-in portfolio both render without horizontal overflowt; portfolio stacks into a single column with a hamburger menu; chart and time-range controls remain usable.
