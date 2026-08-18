import 'dotenv/config'
import { test as setup } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { config } from '../config/env'
import { LoginPage } from '../pages/LoginPage'
import { GmailApprovalService } from '../services/GmailApprovalService'
import { TotpService } from '../services/TotpService'

const AUTH_FILE = path.join(__dirname, '../.auth/user.json')
const DASHBOARD_URL_PATTERN = /\/c(\/|$|\?)/

setup('authenticate and save session', async ({ page }) => {
	// Skip if a valid auth file already exists
	if (fs.existsSync(AUTH_FILE)) {
		console.log('Auth file already exists — skipping login setup.')
		return
	}

	const loginPage = new LoginPage(page)

	// Captured before the login attempt so the email search only considers emails
	// that could actually be the approval message for *this* run.
	const loginStartedAt = new Date()

	await loginPage.goto()
	await loginPage.login(config.username, config.password)

	// The platform may present a TOTP 2FA prompt, a device-approval-by-email prompt, an
	// optional "skip device approval next time" passkey interstitial, some combination in
	// sequence, or neither (already-trusted device/session). Handle whichever gate is
	// currently on screen, in whatever order it appears, until the dashboard loads.
	const maxGates = 4
	for (let step = 0; step < maxGates && !DASHBOARD_URL_PATTERN.test(new URL(page.url()).pathname); step++) {
		const detectionTimeout = step === 0 ? 15_000 : 5_000

		if (await loginPage.isTotpPromptVisible(detectionTimeout)) {
			console.log('2FA (authenticator app) step detected — generating TOTP code...')

			if (!config.totpSecret) {
				throw new Error(
					'A 2FA authenticator-app prompt was presented during auth setup, but TOTP_PASSKEY ' +
						'is not set in .env, so the code cannot be generated automatically. ' +
						'Set TOTP_PASSKEY to the base32 authenticator secret shown when 2FA was first enabled.',
				)
			}

			const totpService = new TotpService(config.totpSecret)
			await loginPage.submitTotpCode(totpService)
			console.log('2FA code submitted.')
			continue
		}

		if (await loginPage.isApprovalPromptVisible(detectionTimeout)) {
			console.log('Device-approval step detected — checking Gmail for the approval email via IMAP...')

			if (!config.email || !config.gmailAppPassword) {
				throw new Error(
					'Device-approval step was presented during auth setup, but EMAIL / GMAIL_APP_PASSWORD ' +
						'are not set in .env, so the approval email cannot be fetched automatically. ' +
						'Generate a Gmail App Password at https://myaccount.google.com/apppasswords and set both variables, ' +
						'or approve the device manually and rerun `npm run auth:save`.',
				)
			}

			const approvalService = new GmailApprovalService({
				email: config.email,
				appPassword: config.gmailAppPassword,
			})

			await loginPage.approveDeviceViaEmail(approvalService, loginStartedAt)
			console.log('Device approved via email link.')
			continue
		}

		if (await loginPage.isSkipPasskeyPromptVisible(detectionTimeout)) {
			console.log('"Skip device approval next time?" interstitial detected — dismissing with "Maybe later"...')
			await loginPage.dismissSkipPasskeyPrompt()
			continue
		}

		// Neither gate is currently visible — login likely completed (or is navigating).
		break
	}

	// Wait for the authenticated dashboard to confirm login succeeded
	await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 30_000 })

	fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
	await page.context().storageState({ path: AUTH_FILE })
	console.log(`Auth state saved to ${AUTH_FILE}`)
})
