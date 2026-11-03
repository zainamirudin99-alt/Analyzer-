import { describe, it, expect } from 'vitest';
import {
  validateCredentials,
  hashPassword,
  verifyPassword,
  encryptSettings,
  decryptSettings,
  toSyntheticEmail,
  normalizeUsername,
  createUser,
  authenticateUser,
  AuthError
} from '../../src/lib/auth-server';

describe('Auth Server & Credential Engine', () => {
  it('normalizes username to lowercase trimmed string', () => {
    expect(normalizeUsername('  ZainAmirudin99  ')).toBe('zainamirudin99');
    expect(toSyntheticEmail('Zain99')).toBe('zain99@analyzer.app');
  });

  it('validates username pattern and minimum password length (6 chars)', () => {
    expect(() => validateCredentials('valid_user.99', 'securepass123')).not.toThrow();
    
    // Too short password
    expect(() => validateCredentials('valid_user', '12345')).toThrow(AuthError);
    
    // Username with space
    expect(() => validateCredentials('invalid user', 'securepass123')).toThrow(AuthError);
    
    // Username with symbols
    expect(() => validateCredentials('invalid@user', 'securepass123')).toThrow(AuthError);
  });

  it('correctly hashes and verifies passwords using scrypt', async () => {
    const rawPass = 'SuperRahasia2026!';
    const hashed = await hashPassword(rawPass);
    expect(hashed).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);

    const matches = await verifyPassword(rawPass, hashed);
    expect(matches).toBe(true);

    const wrongMatches = await verifyPassword('WrongPassword!', hashed);
    expect(wrongMatches).toBe(false);
  });

  it('encrypts and decrypts user settings faithfully via AES-256-GCM', () => {
    const settings = {
      custom_gemini_key: 'AIzaSyFakeKey123456',
      custom_gemini_model: 'gemini-3.8-flash',
      custom_theme: 'emerald'
    };

    const encrypted = encryptSettings(settings);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split('.')).toHaveLength(3); // iv.tag.ciphertext

    const decrypted = decryptSettings(encrypted);
    expect(decrypted).toEqual(settings);
  });

  it('creates and authenticates a user', async () => {
    const testUsername = `testuser_${Date.now()}`;
    const testPassword = 'Password123!';

    const created = await createUser(testUsername, testPassword);
    expect(created.username).toBe(testUsername);
    expect(created.id).toBeDefined();

    const authenticated = await authenticateUser(testUsername, testPassword);
    expect(authenticated.username).toBe(testUsername);
    expect(authenticated.id).toBe(created.id);

    // Rejects wrong password
    await expect(authenticateUser(testUsername, 'WrongPass123!')).rejects.toThrow(AuthError);
  });
});

