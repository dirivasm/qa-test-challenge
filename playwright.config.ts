import 'dotenv/config'
import * as path from 'path'
import * as fs from 'fs'
import { defineConfig, devices } from '@playwright/test'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')
const hasAuthFile = fs.existsSync(AUTH_FILE)

export default defineConfig({
	testDir: './tests',
	timeout: 90_000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: process.env.BASE_URL,
		headless: true,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'on-first-retry',
	},
	projects: [
		// Auth setup runs first and saves storageState to .auth/user.json
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// Reuse the saved session so every test starts pre-authenticated
				storageState: hasAuthFile ? AUTH_FILE : undefined,
			},
			// Only depend on setup when no auth file exists yet
			dependencies: hasAuthFile ? [] : ['setup'],
		},
	],
})
