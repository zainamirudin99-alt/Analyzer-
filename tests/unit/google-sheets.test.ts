import { describe, it, expect } from 'vitest';
import { parseGoogleSheetsUrl } from '../../src/lib/google-sheets';

describe('Google Sheets URL Parser & SSRF Guard', () => {
  it('memvalidasi link Google Sheets yang sah dan mengekstrak ID serta GID', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
    const res = parseGoogleSheetsUrl(url);
    expect(res.isValid).toBe(true);
    expect(res.spreadsheetId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    expect(res.gid).toBe('0');
  });

  it('Invarian I8: menolak URL dengan protokol non-HTTPS (misal http://)', () => {
    const url = 'http://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
    const res = parseGoogleSheetsUrl(url);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('https://');
  });

  it('Invarian I8 (SSRF Guard): menolak host di luar allowlist Google Sheets', () => {
    // Percobaan SSRF ke localhost
    const localhostUrl = 'https://localhost/spreadsheets/d/evil/edit';
    const resLocal = parseGoogleSheetsUrl(localhostUrl);
    expect(resLocal.isValid).toBe(false);
    expect(resLocal.error).toContain('tidak diizinkan');

    // Percobaan SSRF ke IP privat
    const privateIpUrl = 'https://192.168.1.1/spreadsheets/d/evil/edit';
    const resIp = parseGoogleSheetsUrl(privateIpUrl);
    expect(resIp.isValid).toBe(false);

    // Percobaan host asing
    const hackerUrl = 'https://attacker.com/spreadsheets/d/evil/edit';
    const resHacker = parseGoogleSheetsUrl(hackerUrl);
    expect(resHacker.isValid).toBe(false);
  });

  it('Invarian I8 (SSRF Guard): menolak URL dengan port khusus', () => {
    const customPortUrl = 'https://docs.google.com:8080/spreadsheets/d/test/edit';
    const res = parseGoogleSheetsUrl(customPortUrl);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Port kustom tidak diizinkan');
  });
});
