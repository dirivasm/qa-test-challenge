import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export interface GmailApprovalServiceOptions {
	/** Full Gmail address, e.g. you@gmail.com */
	email: string
	/** Gmail App Password (not the regular account password) — see https://myaccount.google.com/apppasswords */
	appPassword: string
	host?: string
	port?: number
}

export interface FetchApprovalLinkOptions {
	/** Only consider emails received at/after this time (use the moment the login attempt started) */
	since: Date
	/** Sender address/domain the approval email is expected from */
	from?: string
	/** The email subject must match this pattern */
	subjectPattern?: RegExp
	/** Used to pick the right link out of the email body when it contains several */
	linkPattern?: RegExp
	/** How long to keep polling the inbox before giving up (ms) */
	timeoutMs?: number
	/** Delay between polling attempts (ms) */
	pollIntervalMs?: number
}

const DEFAULT_FROM = 'kraken.com'
const DEFAULT_SUBJECT_PATTERN = /verify|confirm|new sign|device|approve|sign.?in|log.?in/i
const DEFAULT_LINK_PATTERN = /verify|confirm|approve|activate|authorize/i

/**
 * Reads a Gmail inbox over IMAP to find the "new device / sign-in approval" email
 * sent by the exchange platform and extracts the approval link from it, so the
 * device-approval gate can be completed automatically instead of by hand.
 */
export class GmailApprovalService {
	private readonly email: string
	private readonly appPassword: string
	private readonly host: string
	private readonly port: number

	constructor(options: GmailApprovalServiceOptions) {
		if (!options.email || !options.appPassword) {
			throw new Error(
				'GmailApprovalService requires an email address and an App Password. ' +
					'Set EMAIL and GMAIL_APP_PASSWORD in .env (generate the app password at https://myaccount.google.com/apppasswords).',
			)
		}
		this.email = options.email
		this.appPassword = options.appPassword
		this.host = options.host ?? 'imap.gmail.com'
		this.port = options.port ?? 993
	}

	/**
	 * Polls the inbox for the approval email and returns the approval link.
	 * Marks the matching email as read once found so it isn't reprocessed on a later run.
	 */
	async fetchApprovalLink(options: FetchApprovalLinkOptions): Promise<string> {
		const {
			since,
			from = DEFAULT_FROM,
			subjectPattern = DEFAULT_SUBJECT_PATTERN,
			linkPattern = DEFAULT_LINK_PATTERN,
			timeoutMs = 60_000,
			pollIntervalMs = 5_000,
		} = options

		const deadline = Date.now() + timeoutMs
		let lastError: Error | undefined

		while (Date.now() < deadline) {
			try {
				const link = await this.findApprovalLink({ since, from, subjectPattern, linkPattern })
				if (link) return link
			} catch (err) {
				lastError = err as Error
			}

			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
		}

		throw new Error(
			`Timed out after ${timeoutMs}ms waiting for a device-approval email from "${from}". ` +
				(lastError ? `Last IMAP error: ${lastError.message}` : 'No matching, unread email was found in the inbox.'),
		)
	}

	private async findApprovalLink(criteria: {
		since: Date
		from: string
		subjectPattern: RegExp
		linkPattern: RegExp
	}): Promise<string | undefined> {
		const client = new ImapFlow({
			host: this.host,
			port: this.port,
			secure: true,
			auth: { user: this.email, pass: this.appPassword },
			logger: false,
		})

		await client.connect()
		try {
			const lock = await client.getMailboxLock('INBOX')
			try {
				const uids = await client.search({ from: criteria.from, since: criteria.since }, { uid: true })
				if (!uids || uids.length === 0) return undefined

				// Newest first — the approval email is almost always the most recent match
				const sorted = [...uids].sort((a, b) => b - a)

				for (const uid of sorted) {
					const message = await client.fetchOne(String(uid), { source: true, envelope: true, internalDate: true }, { uid: true })
					if (!message || !message.source) continue

					const receivedAt = message.internalDate ? new Date(message.internalDate) : undefined
					if (receivedAt && receivedAt.getTime() < criteria.since.getTime()) continue

					const parsed = await simpleParser(message.source)
					if (!criteria.subjectPattern.test(parsed.subject ?? '')) continue

					const body = typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml ?? parsed.text ?? '')
					const link = this.extractLink(body, criteria.linkPattern)
					if (!link) continue

					await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
					return link
				}

				return undefined
			} finally {
				lock.release()
			}
		} finally {
			await client.logout().catch(() => client.close())
		}
	}

	private extractLink(body: string, linkPattern: RegExp): string | undefined {
		const anchors = [...body.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]

		// Prefer an anchor whose URL or visible text hints at approval/verification
		for (const [, href, text] of anchors) {
			if (linkPattern.test(href) || linkPattern.test(text)) {
				return this.decodeHtmlEntities(href)
			}
		}

		// Fall back to the first anchor, then to any raw http(s) link in the body
		if (anchors.length > 0) return this.decodeHtmlEntities(anchors[0][1])

		const rawLinkMatch = body.match(/https?:\/\/[^\s"'<>]+/i)
		return rawLinkMatch ? this.decodeHtmlEntities(rawLinkMatch[0]) : undefined
	}

	private decodeHtmlEntities(value: string): string {
		return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
	}
}
