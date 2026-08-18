import { Page, Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

const TOTAL_VALUE_TIMEOUT_MS = 20_000

export class PortfolioPage extends BasePage {
	// Candidate locators in priority order. NOTE: [data-testid="portfolio-value"] (and similar
	// total-value containers) wrap an animated "odometer" widget that visually spells out every
	// digit 0-9 per position for the rolling animation, alongside a hidden sr-only role="status"
	// element holding the real clean text. Reading textContent from the container concatenates all
	// of it into a garbage number, so the sr-only status element must be tried first.
	private readonly totalValueCandidates: Locator[]

	constructor(page: Page) {
		super(page)
		this.totalValueCandidates = [
			page.locator('[role="status"].sr-only').first(),
			page.locator('[data-testid="portfolio-total-value"], [data-testid="total-balance"]').first(),
			page.getByTestId('portfolio-value').first(),
		]
	}

	async goto(): Promise<void> {
		await super.goto('/c/portfolio')
	}

	/** Returns the raw display string (e.g. "$1,234.56") after the value settles. */
	async getTotalPortfolioValue(): Promise<string> {
		// Try each candidate in priority order, waiting for it to attach rather than doing a
		// one-shot `count()` check — the value element doesn't exist in the DOM until the
		// portfolio page finishes its initial render, so an instant check races the page load
		// and flakes. The deadline is shared across candidates so a genuinely-missing first
		// candidate doesn't block the whole read for the full timeout before falling back.
		const deadline = Date.now() + TOTAL_VALUE_TIMEOUT_MS
		let lastError: unknown

		for (const candidate of this.totalValueCandidates) {
			const remaining = deadline - Date.now()
			if (remaining <= 0) break

			try {
				await candidate.waitFor({ state: 'visible', timeout: remaining })
				await expect(candidate).not.toHaveText(/^$|loading|--/i, { timeout: 15_000 })
				return (await candidate.textContent()) ?? ''
			} catch (err) {
				lastError = err
			}
		}

		throw new Error(
			`Could not locate the total portfolio value element after ${TOTAL_VALUE_TIMEOUT_MS}ms.` +
				(lastError instanceof Error ? ` Last error: ${lastError.message}` : ''),
		)
	}
}
