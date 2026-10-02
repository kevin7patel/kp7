/**
 * AES-256-GCM envelope encryption with a raw 32-byte key (base64url).
 * Same code runs in Node 20+ and browsers via WebCrypto.
 *
 * Why: the repo and its GitHub Pages site are public, so the published payload
 * must be unreadable without Kevin's key. The key lives in a GitHub secret and in
 * each of Kevin's browsers (entered once via an unlock link fragment, which is never
 * sent to a server).
 */
import type { EncryptedEnvelope } from './types';

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available in this environment');
  return c.subtle;
};

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateKey(): string {
  const k = new Uint8Array(32);
  globalThis.crypto.getRandomValues(k);
  return bytesToB64url(k);
}

export function isPlausibleKey(key: string): boolean {
  try {
    return b64urlToBytes(key).length === 32;
  } catch {
    return false;
  }
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64urlToBytes(keyB64);
  if (raw.length !== 32) throw new Error('Dashboard key must be 32 bytes (base64url)');
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(value: unknown, keyB64: string, generatedAt: string): Promise<EncryptedEnvelope> {
  const key = await importAesKey(keyB64);
  const iv = new Uint8Array(new ArrayBuffer(12));
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { v: 1, alg: 'AES-256-GCM', iv: bytesToB64url(iv), ct: bytesToB64url(ct), generatedAt };
}

export class DecryptError extends Error {}

export async function decryptJson<T>(env: EncryptedEnvelope, keyB64: string): Promise<T> {
  if (env.v !== 1 || env.alg !== 'AES-256-GCM') throw new DecryptError('Unsupported payload format');
  const key = await importAesKey(keyB64);
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: b64urlToBytes(env.iv) }, key, b64urlToBytes(env.ct));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    throw new DecryptError('This key cannot unlock the published data');
  }
}

/** Keyed hash used to detect content changes without leaking anything about the content. */
export async function hmacHex(data: string, keyB64: string): Promise<string> {
  const key = await subtle().importKey('raw', b64urlToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign('HMAC', key, new TextEncoder().encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}
