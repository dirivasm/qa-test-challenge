// Requires .auth/user.json (run `npm run auth:save` once to generate it, or provide AUTH_STATE_JSON secret in CI)

import 'dotenv/config'
import { test, expect } from '@playwright/test'
import { config } from '../config/env'
import { PortfolioPage } from '../pages/PortfolioPage'

test.describe('Portfolio value', () => {
	test('total portfolio value is a valid non-negative number', async ({ page }) => {
		const portfolioPage = new PortfolioPage(page)

		// Browser context starts pre-authenticated via storageState from auth.setup.ts
		await portfolioPage.goto()

		// 9–11. Wait for the value element to settle and read its text
		const rawValue = await portfolioPage.getTotalPortfolioValue()

		// 12. Strip non-numeric characters (keep digits, dot, minus) and parse
		const numeric = parseFloat(rawValue.replace(/[^0-9.-]/g, ''))

		// 13. Assert the parsed value is a valid number
		expect(!Number.isNaN(numeric), `Portfolio value "${rawValue}" could not be parsed as a number`).toBe(true)

		// 14. Assert the value is non-negative
		expect(numeric, `Portfolio value ${numeric} is negative`).toBeGreaterThanOrEqual(0)

		// 15. Assert against the expected value when provided
		if (config.expectedPortfolioValue !== undefined) {
			const expected = config.expectedPortfolioValue
			expect(Math.abs(numeric - expected), `Portfolio value ${numeric} does not match expected value ${expected}`).toBeLessThanOrEqual(0.005)
		}
	})
})
