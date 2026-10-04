// ============================================================
// Google Sheets Safe Fetcher & SSRF Guard
// ============================================================

export interface GoogleSheetsFetchResult {
  success: boolean;
  buffer?: Buffer;
  spreadsheetId?: string;
  error?: string;
  statusNote?: string;
}

const ALLOWED_HOSTS = ['docs.google.com', 'drive.google.com'];

/**
 * Validasi dan ekstrak spreadsheet ID dari link Google Sheets
 */
export function parseGoogleSheetsUrl(rawUrl: string): { isValid: boolean; spreadsheetId?: string; gid?: string; error?: string } {
  try {
    const parsed = new URL(rawUrl.trim());

    // 1. Protokol wajib HTTPS
    if (parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Protokol URL harus menggunakan https://' };
    }

    // 2. Host wajib ada dalam allowlist (mencegah SSRF)
    if (!ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())) {
      return {
        isValid: false,
        error: `Host '${parsed.hostname}' tidak diizinkan. Hanya menerima link dari Google Sheets (docs.google.com).`
      };
    }

    // 3. Cegah port khusus
    if (parsed.port && parsed.port !== '443') {
      return { isValid: false, error: 'Port kustom tidak diizinkan demi keamanan SSRF.' };
    }

    // 4. Ekstrak spreadsheet ID
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
      return {
        isValid: false,
        error: 'Pola URL tidak valid. Pastikan link memiliki format: https://docs.google.com/spreadsheets/d/{ID_SPREADSHEET}/edit'
      };
    }

    const spreadsheetId = match[1];
    let gid = parsed.searchParams.get('gid') || undefined;
    if (!gid && parsed.hash) {
      const hashMatch = parsed.hash.match(/gid=([0-9]+)/);
      if (hashMatch) {
        gid = hashMatch[1];
      }
    }

    return { isValid: true, spreadsheetId, gid };
  } catch (err: any) {
    return { isValid: false, error: 'Format URL tidak valid atau rusak.' };
  }
}

/**
 * Mengunduh spreadsheet Google Sheets sebagai .xlsx dengan proteksi SSRF,
 * timeout 15 detik, dan batas ukuran 10 MB.
 */
export async function fetchGoogleSheetAsXlsx(rawUrl: string): Promise<GoogleSheetsFetchResult> {
  const parseResult = parseGoogleSheetsUrl(rawUrl);
  if (!parseResult.isValid || !parseResult.spreadsheetId) {
    return { success: false, error: parseResult.error };
  }

  const { spreadsheetId, gid } = parseResult;
  let exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  if (gid) {
    exportUrl += `&gid=${gid}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'CED-Analyzer-Bot/1.0 (Google-Sheets-Importer)'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    // Periksa status respon
    if (response.status === 401 || response.status === 403 || response.url.includes('accounts.google.com/ServiceLogin')) {
      return {
        success: false,
        error: 'Akses Google Sheets ditolak (Private/Restricted).',
        statusNote: 'Pastikan spreadsheet diatur ke "Siapa saja yang memiliki link dapat melihat" (Anyone with the link can view), atau unduh spreadsheet sebagai file .xlsx lalu gunakan opsi Unggah File.'
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Gagal mengunduh spreadsheet dari Google (HTTP ${response.status}: ${response.statusText}).`,
        statusNote: 'Pastikan ID spreadsheet benar dan file belum dihapus.'
      };
    }

    // Periksa Content-Length jika ada
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10485760) {
      return {
        success: false,
        error: 'Ukuran spreadsheet melebihi batas maksimal 10 MB.'
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > 10485760) {
      return {
        success: false,
        error: 'Ukuran spreadsheet melebihi batas maksimal 10 MB.'
      };
    }

    if (buffer.length === 0) {
      return {
        success: false,
        error: 'File spreadsheet kosong (0 bytes).'
      };
    }

    return {
      success: true,
      buffer,
      spreadsheetId
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'Koneksi ke Google Sheets timeout (melebihi batas 15 detik). Silakan coba lagi atau unggah file secara langsung.'
      };
    }
    return {
      success: false,
      error: `Terjadi kendala jaringan saat mengunduh Google Sheets: ${err.message}`
    };
  }
}
