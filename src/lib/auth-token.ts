// ============================================================
// Token sesi bertanda tangan HMAC-SHA256 (Web Crypto).
// Mendukung Cookie httpOnly maupun Header x-analyzer-token.
// ============================================================

export const SESSION_COOKIE = 'analyzer_session';
export const SESSION_HEADER = 'x-analyzer-token';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionPayload {
  uid: string;
  username: string;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.GEMINI_API_KEY ||
    'analyzer-hmac-secret-key-2026'
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSession(uid: string, username: string): Promise<string> {
  const payload: SessionPayload = {
    uid,
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getHmacKey(getAuthSecret());
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  try {
    const key = await getHmacKey(getAuthSecret());
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature) as unknown as BufferSource,
      encoder.encode(body)
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
    if (!payload.uid || !payload.username || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
