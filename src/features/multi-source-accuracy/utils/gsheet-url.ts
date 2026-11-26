const ALLOWED_GOOGLE_HOSTS = new Set(['docs.google.com', 'drive.google.com']);
const ALLOWED_REDIRECT_SUFFIXES = ['.googleusercontent.com', '.google.com'];

export interface MsmaParsedGoogleSheetUrl {
  isValid: boolean;
  spreadsheetId?: string;
  detectedGid?: string;
  multiSheetExportUrl?: string;
  error?: string;
}

export function isGoogleSheetsUrlCandidate(rawText: string): boolean {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('\t')) return false;
  return /^https?:\/\/(docs|drive)\.google\.com\/spreadsheets\/d\//i.test(trimmed);
}

export function isAllowedGoogleRedirectHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (ALLOWED_GOOGLE_HOSTS.has(lower)) return true;
  return ALLOWED_REDIRECT_SUFFIXES.some(suffix => lower.endsWith(suffix));
}

/**
 * Parses and validates a Google Sheets URL under Invariant I8 (SSRF guard)
 * and always produces a full-workbook multi-sheet XLSX export URL (without &gid=)
 * so every worksheet remains selectable by the user.
 */
export function parseMsmaGoogleSheetsUrl(rawUrl: string): MsmaParsedGoogleSheetUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Masukkan tautan Google Sheets (format: https://docs.google.com/spreadsheets/d/ID/edit).'
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: 'Format URL tidak valid. Salin tautan penuh yang diawali https://docs.google.com/spreadsheets/d/...'
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      error: 'URL wajib menggunakan protokol https:// untuk keamanan koneksi.'
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_GOOGLE_HOSTS.has(host)) {
    return {
      isValid: false,
      error: `Host "${host}" tidak diizinkan. Hanya tautan dari docs.google.com atau drive.google.com yang didukung.`
    };
  }

  if (parsed.port && parsed.port !== '443') {
    return {
      isValid: false,
      error: 'Port kustom tidak diizinkan demi perlindungan anti-SSRF.'
    };
  }

  const idMatch = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,})/);
  if (!idMatch || !idMatch[1]) {
    return {
      isValid: false,
      error: 'ID spreadsheet tidak ditemukan. Pastikan tautan mengikuti pola https://docs.google.com/spreadsheets/d/{ID}/edit'
    };
  }

  const spreadsheetId = idMatch[1];
  let detectedGid = parsed.searchParams.get('gid') || undefined;
  if (!detectedGid && parsed.hash) {
    const hashMatch = parsed.hash.match(/gid=([0-9]+)/);
    if (hashMatch?.[1]) detectedGid = hashMatch[1];
  }

  return {
    isValid: true,
    spreadsheetId,
    detectedGid,
    multiSheetExportUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`
  };
}
