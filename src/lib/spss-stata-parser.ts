// ============================================================
// SPSS (.sav) & Stata (.dta) Binary Parser (Pure TypeScript)
// Reads metadata (N, K, column names, types) & data rows
// Zero native C/C++ or Python dependencies needed
// ============================================================

export interface ParsedDatasetResult {
  format: 'sav' | 'dta';
  rowCount: number;
  columnCount: number;
  columns: string[];
  columnTypes: Record<string, 'numeric' | 'string' | 'date'>;
  columnLabels: Record<string, string>;
  rows: Record<string, any>[];
  previewRows: Record<string, any>[];
}

/**
 * Parse SPSS (.sav / .zsav) binary buffer
 */
export function parseSpssSav(buffer: Buffer): ParsedDatasetResult {
  if (buffer.length < 176) {
    throw new Error('File SPSS .sav terlalu pendek atau rusak (kurang dari 176 byte).');
  }

  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== '$FL2' && magic !== '$FL3') {
    throw new Error(`Magic bytes SPSS tidak valid: "${magic}". Diharapkan "$FL2" atau "$FL3".`);
  }

  // Endianness detection at offset 84 (layout code: 1 = little-endian, 2 = big-endian or 3)
  // Usually little-endian on x86/x64
  const isLittleEndian = true;

  const nChannels = isLittleEndian ? buffer.readInt32LE(12) : buffer.readInt32BE(12);
  const isCompressed = (isLittleEndian ? buffer.readInt32LE(16) : buffer.readInt32BE(16)) !== 0;
  const weightIndex = isLittleEndian ? buffer.readInt32LE(20) : buffer.readInt32BE(20);
  const nCasesHeader = isLittleEndian ? buffer.readInt32LE(24) : buffer.readInt32BE(24);
  const bias = isLittleEndian ? buffer.readDoubleLE(28) : buffer.readDoubleBE(28);

  const rawVars: { name: string; type: number; label: string; printFormat: number }[] = [];
  let offset = 176; // Start of records after 176-byte header
  let longNamesMap: Record<string, string> = {};

  // Record loop
  while (offset < buffer.length) {
    const recType = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
    offset += 4;

    if (recType === 2) {
      // Variable Record
      const varType = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
      const hasLabel = (isLittleEndian ? buffer.readInt32LE(offset + 4) : buffer.readInt32BE(offset + 4)) !== 0;
      const nMissing = isLittleEndian ? buffer.readInt32LE(offset + 8) : buffer.readInt32BE(offset + 8);
      const printFormat = isLittleEndian ? buffer.readInt32LE(offset + 12) : buffer.readInt32BE(offset + 12);
      const writeFormat = isLittleEndian ? buffer.readInt32LE(offset + 16) : buffer.readInt32BE(offset + 16);
      
      const shortName = buffer.toString('ascii', offset + 20, offset + 28).trim().replace(/\0/g, '');
      offset += 28;

      let varLabel = '';
      if (hasLabel) {
        const labelLen = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
        offset += 4;
        // Padded to 4-byte multiple
        const paddedLen = Math.ceil(labelLen / 4) * 4;
        varLabel = buffer.toString('utf-8', offset, offset + labelLen).trim().replace(/\0/g, '');
        offset += paddedLen;
      }

      // Skip missing values (nMissing * 8 bytes)
      const absMissing = Math.abs(nMissing);
      offset += absMissing * 8;

      if (shortName) {
        rawVars.push({
          name: shortName,
          type: varType,
          label: varLabel || shortName,
          printFormat
        });
      }
    } else if (recType === 3) {
      // Value labels
      const count = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
      offset += 4;
      for (let i = 0; i < count; i++) {
        offset += 8; // value double
        const labelLen = buffer.readUInt8(offset);
        offset += 1;
        const padded = Math.ceil((labelLen + 1) / 8) * 8 - 1;
        offset += padded;
      }
    } else if (recType === 4) {
      // Value label variable indices
      const count = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
      offset += 4 + count * 4;
    } else if (recType === 7) {
      // Subtype records
      const subtype = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
      const size = isLittleEndian ? buffer.readInt32LE(offset + 4) : buffer.readInt32BE(offset + 4);
      const count = isLittleEndian ? buffer.readInt32LE(offset + 8) : buffer.readInt32BE(offset + 8);
      offset += 12;
      const totalBytes = size * count;

      if (subtype === 13) {
        // Long variable names table: "SHORTNAME=LongName\tSHORTNAME2=LongName2"
        const str = buffer.toString('utf-8', offset, offset + totalBytes);
        const pairs = str.split('\t');
        pairs.forEach(p => {
          const [s, l] = p.split('=');
          if (s && l) {
            longNamesMap[s.trim()] = l.trim();
          }
        });
      }
      offset += totalBytes;
    } else if (recType === 999) {
      // End of dictionary, data starts
      const filler = isLittleEndian ? buffer.readInt32LE(offset) : buffer.readInt32BE(offset);
      offset += 4;
      break;
    } else {
      // Unknown record, break to avoid runaway
      break;
    }
  }

  // Filter primary variables (type 0 = numeric, >0 = string length, -1 = string continuation)
  const primaryVars = rawVars.filter(v => v.type !== -1);
  const columnNames = primaryVars.map(v => longNamesMap[v.name] || v.name);
  const columnLabels: Record<string, string> = {};
  const columnTypes: Record<string, 'numeric' | 'string' | 'date'> = {};

  primaryVars.forEach((v, idx) => {
    const colName = columnNames[idx];
    columnLabels[colName] = v.label || colName;
    columnTypes[colName] = v.type === 0 ? 'numeric' : 'string';
  });

  const rows: Record<string, any>[] = [];
  const maxRowsToParse = nCasesHeader > 0 && nCasesHeader < 200000 ? nCasesHeader : 10000;

  // Uncompressed or compressed stream reader
  if (!isCompressed && offset < buffer.length) {
    const bytesPerCase = rawVars.reduce((sum, v) => sum + (v.type === 0 ? 8 : Math.ceil(v.type / 8) * 8), 0);
    const availableCases = Math.min(maxRowsToParse, Math.floor((buffer.length - offset) / (bytesPerCase || 8)));

    for (let r = 0; r < availableCases; r++) {
      const row: Record<string, any> = {};
      let varCursor = 0;
      primaryVars.forEach((v, idx) => {
        const colName = columnNames[idx];
        if (v.type === 0) {
          const val = buffer.readDoubleLE(offset);
          offset += 8;
          // SPSS SYSMIS = -1.7976931348623158e+308
          row[colName] = Math.abs(val) > 1e300 || isNaN(val) ? null : Number(val.toFixed(6));
        } else {
          const strLen = Math.ceil(v.type / 8) * 8;
          row[colName] = buffer.toString('utf-8', offset, offset + v.type).trim().replace(/\0/g, '');
          offset += strLen;
        }
      });
      rows.push(row);
    }
  } else if (isCompressed && offset < buffer.length) {
    // Compressed SPSS decompression
    let opCodes: number[] = [];
    let opIndex = 8; // Force read first chunk

    const readOpcode = (): number => {
      if (opIndex >= 8) {
        if (offset + 8 > buffer.length) return 252; // EOF
        opCodes = [];
        for (let i = 0; i < 8; i++) {
          opCodes.push(buffer.readUInt8(offset + i));
        }
        offset += 8;
        opIndex = 0;
      }
      return opCodes[opIndex++];
    };

    let casesParsed = 0;
    while (casesParsed < maxRowsToParse && offset < buffer.length) {
      const row: Record<string, any> = {};
      let endOfFile = false;

      for (let i = 0; i < primaryVars.length; i++) {
        const v = primaryVars[i];
        const colName = columnNames[i];
        const code = readOpcode();

        if (code === 0) {
          // Ignored
        } else if (code === 252) {
          endOfFile = true;
          break;
        } else if (code === 253) {
          // Uncompressed 8-byte IEEE double
          if (offset + 8 > buffer.length) { endOfFile = true; break; }
          const val = buffer.readDoubleLE(offset);
          offset += 8;
          row[colName] = Math.abs(val) > 1e300 || isNaN(val) ? null : Number(val.toFixed(6));
        } else if (code === 254) {
          // Blank string / 8 spaces
          row[colName] = '';
        } else if (code === 255) {
          // SYSMIS (System missing)
          row[colName] = null;
        } else if (code >= 1 && code <= 251) {
          // Compressed integer with bias (bias usually 100)
          row[colName] = code - bias;
        }
      }

      if (endOfFile) break;
      rows.push(row);
      casesParsed++;
    }
  }

  return {
    format: 'sav',
    rowCount: rows.length,
    columnCount: columnNames.length,
    columns: columnNames,
    columnTypes,
    columnLabels,
    rows,
    previewRows: rows.slice(0, 10)
  };
}

/**
 * Parse Stata (.dta) buffer (Modern Stata 117-119 and Legacy 114/115)
 */
export function parseStataDta(buffer: Buffer): ParsedDatasetResult {
  if (buffer.length < 100) {
    throw new Error('File Stata .dta terlalu pendek atau rusak (kurang dari 100 byte).');
  }

  const magicTag = buffer.toString('utf-8', 0, 11);
  if (magicTag === '<stata_dta>') {
    return parseModernStataDta(buffer);
  }

  // Legacy Stata check
  const release = buffer.readUInt8(0);
  if ([113, 114, 115].includes(release)) {
    return parseLegacyStataDta(buffer, release);
  }

  throw new Error(`Format Stata .dta tidak dikenali. Ditemukan release code: ${release}.`);
}

/**
 * Parse modern XML-tagged Stata 13-18 (.dta)
 */
function parseModernStataDta(buffer: Buffer): ParsedDatasetResult {
  const fullText = buffer.toString('latin1', 0, Math.min(buffer.length, 100000));
  
  // Extract headers
  const getTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : '';
  };

  const headerXml = getTag(fullText, 'header');
  const release = parseInt(getTag(headerXml, 'release') || '118', 10);
  const byteorder = getTag(headerXml, 'byteorder') || 'LSF';
  const isLE = byteorder === 'LSF';
  const K = parseInt(getTag(headerXml, 'K') || '0', 10);
  const N = parseInt(getTag(headerXml, 'N') || '0', 10);

  // Extract variable names from <varnames>
  const varnamesXml = getTag(fullText, 'varnames');
  let columns: string[] = [];
  if (varnamesXml) {
    // Varnames in Stata 117+ are 129 bytes null-padded or split by tags/null
    columns = varnamesXml
      .split('\0')
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));
  }

  if (columns.length === 0 && K > 0) {
    // Fallback: search regex tokens
    const matches = fullText.match(/<varnames>([\s\S]*?)<\/varnames>/);
    if (matches) {
      const raw = matches[1];
      const tokens = raw.replace(/[^\x20-\x7E]/g, ' ').split(/\s+/).filter(Boolean);
      columns = tokens.slice(0, K);
    }
  }

  const columnTypes: Record<string, 'numeric' | 'string' | 'date'> = {};
  const columnLabels: Record<string, string> = {};
  columns.forEach(col => {
    columnTypes[col] = 'numeric'; // Default
    columnLabels[col] = col;
  });

  // Extract row sample or preview
  const rows: Record<string, any>[] = [];
  // For tahap 1 preview: if data block exists
  const dataMatch = fullText.indexOf('<data>');
  if (dataMatch !== -1 && N > 0 && columns.length > 0) {
    const dataStart = dataMatch + 6;
    const maxPreview = Math.min(N, 100);
    // Simple reader assuming doubles or floats
    let cursor = dataStart;
    for (let r = 0; r < maxPreview && cursor + columns.length * 8 <= buffer.length; r++) {
      const row: Record<string, any> = {};
      columns.forEach(col => {
        try {
          const val = isLE ? buffer.readDoubleLE(cursor) : buffer.readDoubleBE(cursor);
          row[col] = isNaN(val) || Math.abs(val) > 1e300 ? null : Number(val.toFixed(6));
        } catch {
          row[col] = null;
        }
        cursor += 8;
      });
      rows.push(row);
    }
  }

  return {
    format: 'dta',
    rowCount: N || rows.length,
    columnCount: columns.length,
    columns,
    columnTypes,
    columnLabels,
    rows: rows.length > 0 ? rows : [],
    previewRows: rows.slice(0, 10)
  };
}

/**
 * Parse legacy binary Stata (.dta) releases 113-115
 */
function parseLegacyStataDta(buffer: Buffer, release: number): ParsedDatasetResult {
  const byteorder = buffer.readUInt8(1);
  const isLE = byteorder === 1;

  const nvar = isLE ? buffer.readUInt16LE(4) : buffer.readUInt16BE(4);
  const nobs = isLE ? buffer.readUInt32LE(6) : buffer.readUInt32BE(6);

  // Variable names start at offset 109
  let offset = 109;
  const nameLen = release >= 114 ? 33 : 9;
  const columns: string[] = [];

  for (let i = 0; i < nvar && offset + nameLen <= buffer.length; i++) {
    const raw = buffer.toString('ascii', offset, offset + nameLen).trim().replace(/\0/g, '');
    if (raw) columns.push(raw);
    offset += nameLen;
  }

  const columnTypes: Record<string, 'numeric' | 'string' | 'date'> = {};
  const columnLabels: Record<string, string> = {};
  columns.forEach(c => {
    columnTypes[c] = 'numeric';
    columnLabels[c] = c;
  });

  return {
    format: 'dta',
    rowCount: nobs,
    columnCount: columns.length,
    columns,
    columnTypes,
    columnLabels,
    rows: [],
    previewRows: []
  };
}

