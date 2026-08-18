const required = ['BASE_URL', 'USERNAME', 'PASSWORD'] as const

const missing = required.filter((key) => !process.env[key])
if (missing.length) {
	throw new Error(`Missing required environment variables: ${missing.join(', ')}.\n` + 'Copy .env.example to .env and fill in the values.')
}

const raw = process.env.EXPECTED_PORTFOLIO_VALUE
const expectedPortfolioValue: number | undefined = raw !== undefined && raw !== '' ? parseFloat(raw) : undefined

if (expectedPortfolioValue !== undefined && Number.isNaN(expectedPortfolioValue)) {
	throw new Error(`EXPECTED_PORTFOLIO_VALUE "${raw}" is not a valid number. Provide a numeric value or leave it blank.`)
}

export const config = {
	baseUrl: process.env.BASE_URL as string,
	username: process.env.USERNAME as string,
	password: process.env.PASSWORD as string,
	expectedPortfolioValue,
	// Optional — only required when the device-approval gate appears during auth setup.
	// See services/GmailApprovalService.ts and tests/auth.setup.ts.
	email: process.env.EMAIL,
	gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
	// Optional — only required when the authenticator-app 2FA gate appears during auth setup.
	// See services/TotpService.ts and tests/auth.setup.ts.
	totpSecret: process.env.TOTP_PASSKEY,
}
