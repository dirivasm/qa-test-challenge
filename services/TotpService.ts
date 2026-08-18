import { TOTP, Secret } from 'otpauth'

/**
 * Generates time-based one-time-password (TOTP) codes from a base32 authenticator
 * secret, so the "Enter the Sign-in 2FA code from your authenticator app" gate can be
 * completed automatically instead of requiring a human to read a code off a phone.
 */
export class TotpService {
	private readonly totp: TOTP

	constructor(base32Secret: string, options?: { digits?: number; period?: number; algorithm?: string }) {
		if (!base32Secret) {
			throw new Error(
				'TotpService requires a base32 TOTP secret (the "authenticator app" setup key). Set TOTP_PASSKEY in .env.',
			)
		}

		this.totp = new TOTP({
			issuer: 'Kraken',
			label: 'Kraken',
			algorithm: options?.algorithm ?? 'SHA1',
			digits: options?.digits ?? 6,
			period: options?.period ?? 30,
			secret: Secret.fromBase32(base32Secret.replace(/\s+/g, '')),
		})
	}

	/** Returns the currently valid 6-digit code. */
	generateCode(): string {
		return this.totp.generate()
	}
}
