/**
 * Random values for the sign-in flows.
 *
 * Three call sites needed the same two lines — the native Apple sheet (`SocialAuthButtons`), Apple's
 * web flow and Amazon's — and a nonce or a verifier generated slightly differently in one of them
 * is the kind of difference that shows up as "sign-in works everywhere except there".
 */
import * as Crypto from 'expo-crypto';

/** `bytes` of cryptographic randomness as lowercase hex. 32 bytes = 256 bits = 64 characters. */
export async function randomHex(bytes: number): Promise<string> {
  return Array.from(await Crypto.getRandomBytesAsync(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lowercase hex SHA-256. Both ends of the handoff hash the same hex string. */
export function sha256Hex(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}
