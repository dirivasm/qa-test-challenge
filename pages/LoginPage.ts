import { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'
import { GmailApprovalService } from '../services/GmailApprovalService'
import { TotpService } from '../services/TotpService'

export class LoginPage extends BasePage {
	private readonly usernameInput: Locator
	private readonly passwordInput: Locator
	private readonly continueButton: Locator
	private readonly errorBanner: Locator
	// Device-approval prompt rendered after login on an unrecognised device/browser
	private readonly approvalPrompt: Locator
	// Authenticator-app 2FA prompt rendered after login when TOTP 2FA is enabled
	private readonly totpHeading: Locator
	private readonly totpInput: Locator
	private readonly totpSubmitButton: Locator

	constructor(page: Page) {
		super(page)
		this.usernameInput = page.getByLabel(/email|username/i).first()
		this.passwordInput = page.getByLabel(/password/i).first()
		this.continueButton = page.getByRole('button', { name: /continue|sign in|log in/i }).first()
		this.errorBanner = page.locator('[data-testid="error-message"], [role="alert"]').first()
		// Check for the new-device approval screen by looking for the email-check copy
		this.approvalPrompt = page.getByText(/check your email|approve.*device|confirm.*sign.in|verify.*device/i).first()
		this.totpHeading = page.getByText(/authenticator app|2fa code|two-factor/i).first()
		this.totpInput = page.getByLabel(/2fa code/i).first()
		this.totpSubmitButton = page.getByRole('button', { name: /^enter$|verify|continue|submit/i }).first()
	}

	async goto(): Promise<void> {
		await super.goto('/sign-in')
	}

	async login(username: string, password: string): Promise<void> {
		await this.usernameInput.fill(username)
		await this.continueButton.click()
		await this.passwordInput.waitFor({ state: 'visible', timeout: 10_000 })
		await this.passwordInput.fill(password)
		await this.continueButton.click()
	}

	async isApprovalPromptVisible(timeoutMs = 15_000): Promise<boolean> {
		try {
			await this.approvalPrompt.waitFor({ state: 'visible', timeout: timeoutMs })
			return true
		} catch {
			return false
		}
	}

	/**
	 * Completes the new-device approval gate automatically by fetching the approval
	 * link from the account's Gmail inbox (via IMAP) and opening it, instead of requiring
	 * a human to click the link from the email by hand.
	 *
	 * @param approvalService Reads the inbox and extracts the approval link.
	 * @param sentAfter       Only emails received at/after this time are considered — pass
	 *                        the timestamp captured just before the login attempt started.
	 */
	async approveDeviceViaEmail(approvalService: GmailApprovalService, sentAfter: Date): Promise<void> {
		const link = await approvalService.fetchApprovalLink({ since: sentAfter })

		// Open the approval link in its own tab so the original login tab is left untouched
		// and can pick up the now-approved session (most platforms poll for this in the background).
		const approvalPage = await this.page.context().newPage()
		try {
			await approvalPage.goto(link, { waitUntil: 'domcontentloaded' })
			await approvalPage.waitForLoadState('networkidle').catch(() => undefined)
		} finally {
			await approvalPage.close()
		}

		// Defensive reload in case the original tab doesn't detect the approval on its own.
		if (await this.isApprovalPromptVisible(3_000)) {
			await this.page.reload().catch(() => undefined)
		}
	}

	async isTotpPromptVisible(timeoutMs = 15_000): Promise<boolean> {
		try {
			await this.totpHeading.waitFor({ state: 'visible', timeout: timeoutMs })
			return true
		} catch {
			return false
		}
	}

	/**
	 * Completes the authenticator-app 2FA gate automatically by generating the current
	 * TOTP code from the account's authenticator secret, instead of requiring a human to
	 * read the code off a phone.
	 *
	 * @param totpService Generates the current 6-digit code from the base32 TOTP secret.
	 */
	async submitTotpCode(totpService: TotpService): Promise<void> {
		const code = totpService.generateCode()

		await this.totpInput.waitFor({ state: 'visible', timeout: 10_000 })
		await this.totpInput.fill(code)

		// The submit button is disabled until the code is filled in — wait for it to enable.
		await this.totpSubmitButton.waitFor({ state: 'visible', timeout: 5_000 })
		await this.totpSubmitButton.click()

		// Wait for this screen to go away (navigation to the next gate/dashboard, or the
		// form disappearing) before returning, so callers don't re-detect the same prompt
		// while the submission is still in flight and resubmit a stale code.
		await this.totpHeading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
	}
}
