
import {
  MsmaColumnTypeProfile,
  MsmaRawSheet,
  MsmaSourceConfig,
  MsmaUploadedWorkbook
} from '../types';
import { createSeededRng, parseSafeNumber, randomStandardNormal, sanitizeCellText } from '../utils/numerical';

export function buildRawSheetFromMatrix(
  sheetName: string,
  rawMatrix: unknown[][],
  headerRowIndex = 0
): MsmaRawSheet {
  const safeHeaderIdx = Math.max(0, Math.min(Math.max(0, rawMatrix.length - 1), headerRowIndex));
  const headerCells = rawMatrix[safeHeaderIdx] ?? [];
  const colCount = rawMatrix.reduce((mx, r) => Math.max(mx, Array.isArray(r) ? r.length : 0), 0);

  const usedNames = new Set<string>();
  const columns: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const rawHeader = sanitizeCellText(headerCells[c]);
    const base = rawHeader || `Column_${c + 1}`;
    let candidate = base;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${base}_${suffix++}`;
    }
    usedNames.add(candidate);
    columns.push(candidate);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = safeHeaderIdx + 1; r < rawMatrix.length; r++) {
    const line = rawMatrix[r];
    if (!Array.isArray(line)) continue;
    const isAllBlank = line.every(cell => String(cell ?? '').trim() === '');
    if (isAllBlank) continue;

    const rowObj: Record<string, unknown> = {};
    for (let c = 0; c < columns.length; c++) {
      const rawVal = line[c];
      const numVal = parseSafeNumber(rawVal);
      if (numVal !== null && String(rawVal ?? '').trim() !== '') {
        rowObj[columns[c]] = numVal;
      } else if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
        rowObj[columns[c]] = null;
      } else {
        rowObj[columns[c]] = sanitizeCellText(rawVal);
      }
    }
    rows.push(rowObj);
  }

  let numericColumnCount = 0;
  for (const col of columns) {
    const validVals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined);
    const numCount = validVals.filter(v => parseSafeNumber(v) !== null).length;
    if (validVals.length > 0 && numCount / validVals.length >= 0.7) {
      numericColumnCount++;
    }
  }

  const emptyHeaderCount = columns.filter(c => /^Column_\d+$|^__EMPTY/i.test(c)).length;
  const isRecommendedPanelSheet =
    rows.length >= 6 && columns.length >= 4 && numericColumnCount >= 2 && emptyHeaderCount <= columns.length * 0.4;

  return {
    sheetName: sanitizeCellText(sheetName) || 'Sheet1',
    rawMatrix,
    headerRowIndex: safeHeaderIdx,
    columns,
    rows,
    rowCount: rows.length,
    columnCount: columns.length,
    numericColumnCount,
    isRecommendedPanelSheet
  };
}

export function buildRawSheetFromObjects(
  sheetName: string,
  objects: Record<string, unknown>[]
): MsmaRawSheet {
  if (objects.length === 0) {
    return buildRawSheetFromMatrix(sheetName, [], 0);
  }
  const colSet = new Set<string>();
  for (const obj of objects) {
    Object.keys(obj).forEach(k => colSet.add(k));
  }
  const cols = Array.from(colSet);
  const rawMatrix: unknown[][] = [
    cols,
    ...objects.map(obj => cols.map(c => obj[c] ?? null))
  ];
  return buildRawSheetFromMatrix(sheetName, rawMatrix, 0);
}

export function profileSheetColumns(sheet: MsmaRawSheet): MsmaColumnTypeProfile[] {
  return sheet.columns.map((col, idx) => {
    const totalCount = sheet.rows.length;
    let validCount = 0;
    let numericCount = 0;
    const uniqueSet = new Set<string>();
    const samples: string[] = [];

    for (const r of sheet.rows) {
      const val = r[col];
      if (val === null || val === undefined || String(val).trim() === '') continue;
      validCount++;
      const str = String(val);
      uniqueSet.add(str);
      if (samples.length < 4 && !samples.includes(str)) samples.push(str);
      if (parseSafeNumber(val) !== null) numericCount++;
    }

    const missingCount = totalCount - validCount;
    const missingPct = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;

    let detectedType: MsmaColumnTypeProfile['detectedType'] = 'empty';
    if (validCount === 0) detectedType = 'empty';
    else if (numericCount === validCount) detectedType = 'numeric';
    else if (numericCount === 0) detectedType = 'categorical';
    else if (numericCount / validCount >= 0.8) detectedType = 'numeric';
    else detectedType = 'mixed';

    let suggestedRole: MsmaColumnTypeProfile['suggestedRole'] = 'control_or_other';
    if (/^(kota|city|kab|entity|id_kota|wilayah|provinsi|region|panel_id)$/i.test(col) || (idx === 0 && detectedType === 'categorical')) {
      suggestedRole = 'entity_id';
    } else if (/^(tahun|year|periode|period|waktu|time|yr)$/i.test(col)) {
      suggestedRole = 'time_id';
    } else if (
      detectedType === 'numeric' &&
      !/^(id|kode|code|populasi|pdb|gdp|luas|area|lat|lon)$/i.test(col)
    ) {
      suggestedRole = 'measurement_source';
    }

    return {
      columnName: col,
      detectedType,
      totalCount,
      validCount,
      numericCount,
      missingCount,
      missingPct,
      uniqueCount: uniqueSet.size,
      sampleValues: samples,
      suggestedRole
    };
  });
}

export function validateWorkbookForMsma(
  fileName: string,
  fileSizeBytes: number,
  sourceKind: MsmaUploadedWorkbook['sourceKind'],
  sheets: MsmaRawSheet[],
  preferredSheetName?: string
): MsmaUploadedWorkbook {
  const messages: string[] = [];
  if (sheets.length === 0) {
    return {
      fileName,
      fileSizeBytes,
      sourceKind,
      sheets: [],
      activeSheetName: '',
      columnProfiles: [],
      validationMessages: ['Berkas tidak memiliki worksheet yang dapat dibaca.'],
      isValid: false
    };
  }

  const chosen =
    (preferredSheetName ? sheets.find(s => s.sheetName === preferredSheetName) : undefined) ??
    sheets.find(s => s.isRecommendedPanelSheet) ??
    sheets[0];

  const profiles = profileSheetColumns(chosen);
  const numericCols = profiles.filter(p => p.detectedType === 'numeric');

  if (chosen.rowCount < 4) {
    messages.push(`Jumlah baris data pada sheet "${chosen.sheetName}" terlalu sedikit (${chosen.rowCount} baris). Minimal disarankan >= 12 baris observasi panel.`);
  }
  if (chosen.columnCount < 4) {
    messages.push(`Sheet "${chosen.sheetName}" hanya memiliki ${chosen.columnCount} kolom. Dibutuhkan minimal kolom Entitas, Waktu, dan >= 2 sumber pengukuran.`);
  }
  if (numericCols.length < 2) {
    messages.push(`Hanya ditemukan ${numericCols.length} kolom numerik pada sheet "${chosen.sheetName}". Dibutuhkan minimal 2 kolom sumber pengukuran numerik.`);
  }

  const isValid = chosen.rowCount >= 4 && chosen.columnCount >= 3 && numericCols.length >= 2;
  if (isValid && messages.length === 0) {
    messages.push(
      `Berkas "${fileName}" valid (${sheets.length} sheet; sheet aktif "${chosen.sheetName}" memuat ${chosen.rowCount} baris × ${chosen.columnCount} kolom, ${numericCols.length} kolom numerik).`
    );
  }

  return {
    fileName,
    fileSizeBytes,
    sourceKind,
    sheets,
    activeSheetName: chosen.sheetName,
    columnProfiles: profiles,
    validationMessages: messages,
    isValid
  };
}

export function parseDelimitedTextToSheet(text: string, sheetName = 'CSV_Import'): MsmaRawSheet {
  const lines = text
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);
  if (lines.length === 0) return buildRawSheetFromMatrix(sheetName, [], 0);
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const matrix = lines.map(parseLine);
  return buildRawSheetFromMatrix(sheetName, matrix, 0);
}

export interface MsmaPresetOption {
  presetId: 'CONTOH_A_CO2_3SRC' | 'CONTOH_B_DIFF_CONSTRUCT' | 'FOUR_SOURCE_CO2' | 'FIVE_SOURCE_EC' | 'TWO_SOURCE_AGREEMENT';
  title: string;
  subtitle: string;
  workbook: MsmaUploadedWorkbook;
  entityColumn: string;
  timeColumn: string;
  presetSources: MsmaSourceConfig[];
}

const INDONESIAN_CITIES_30 = [
  'Jakarta_Pusat', 'Surabaya', 'Bandung', 'Medan', 'Semarang',
  'Makassar', 'Palembang', 'Tangerang', 'Depok', 'Bekasi',
  'Balikpapan', 'Samarinda', 'Padang', 'Pekanbaru', 'Bandar_Lampung',
  'Malang', 'Yogyakarta', 'Surakarta', 'Denpasar', 'Banjarmasin',
  'Pontianak', 'Manado', 'Batam', 'Bogor', 'Cilegon',
  'Gresik', 'Sidoarjo', 'Cirebon', 'Mataram', 'Kupang'
];

export function generateMsmaPresetCatalog(): MsmaPresetOption[] {
  // 1. CONTOH A — 30 Cities x 6 Years (2018-2023), 3 Sources (Same Construct: Total CO2 Emissions kt/year)
  // Hidden ground truth (strictly internal to generator, never exposed in dataset):
  // Sensor SD = 18 kt (Rank #1), Satellite SD = 42 kt (Rank #2), Pemkot SD = 78 kt (Rank #3)
  const rngA = createSeededRng(20260401);
  const rowsA: Record<string, unknown>[] = [];
  const years = [2018, 2019, 2020, 2021, 2022, 2023];

  INDONESIAN_CITIES_30.forEach((city, cIdx) => {
    const baseCityEmission = 420 + (30 - cIdx) * 38 + randomStandardNormal(rngA) * 25;
    years.forEach((yr, yIdx) => {
      const covidDip = yr === 2020 ? -55 : yr === 2021 ? -20 : 0;
      const trend = yIdx * 16;
      const trueT = Math.max(120, baseCityEmission + trend + covidDip + randomStandardNormal(rngA) * 32);

      const pemkot = Number((-35 + 0.94 * trueT + randomStandardNormal(rngA) * 78).toFixed(2));
      const satelit = Number((22 + 1.06 * trueT + randomStandardNormal(rngA) * 42).toFixed(2));
      const sensor = Number((5 + 1.00 * trueT + randomStandardNormal(rngA) * 18).toFixed(2));
      const pdrbKontrol = Number((15 + (30 - cIdx) * 4.2 + yIdx * 0.9).toFixed(2));

      rowsA.push({
        Kota: city,
        Tahun: yr,
        Emisi_Pemkot: pemkot,
        Emisi_Satelit: satelit,
        Emisi_Sensor: sensor,
        PDRB_Triliun_Kontrol: pdrbKontrol
      });
    });
  });

  const sheetA = buildRawSheetFromObjects('Emisi_CO2_Kota_ID', rowsA);
  const wbA = validateWorkbookForMsma('Preset_ContohA_Emisi_CO2_30Kota_6Tahun.xlsx', 18420, 'preset', [sheetA]);

  // 2. CONTOH B — Different Measurement Construct (Pemkot kt/year vs Satelit XCO2 ppm vs Sensor Lokal ppm)
  const rngB = createSeededRng(20260402);
  const rowsB: Record<string, unknown>[] = [];
  INDONESIAN_CITIES_30.slice(0, 24).forEach((city, cIdx) => {
    const baseFlux = 380 + (24 - cIdx) * 40;
    years.forEach((yr, yIdx) => {
      const trueFlux = baseFlux + yIdx * 14 + randomStandardNormal(rngB) * 28;
      const pemkotTon = Number((trueFlux * 1000 + randomStandardNormal(rngB) * 65000).toFixed(0));
      const satelitPpm = Number((411.5 + 0.0042 * trueFlux + randomStandardNormal(rngB) * 0.85).toFixed(3));
      const sensorLokalPpm = Number((416.0 + 0.0115 * trueFlux + randomStandardNormal(rngB) * 2.1).toFixed(3));
      rowsB.push({
        Kota: city,
        Tahun: yr,
        Emisi_Pemkot_TonThn: pemkotTon,
        Konsentrasi_Satelit_ppm: satelitPpm,
        Konsentrasi_SensorLokal_ppm: sensorLokalPpm
      });
    });
  });
  const sheetB = buildRawSheetFromObjects('ContohB_Beda_Konstruk', rowsB);
  const wbB = validateWorkbookForMsma('Preset_ContohB_Beda_Konstruk_CO2.xlsx', 14800, 'preset', [sheetB]);

  // 3. FOUR SOURCES (J = 4, N-Cornered Hat)
  const rng4 = createSeededRng(20260403);
  const rows4: Record<string, unknown>[] = [];
  INDONESIAN_CITIES_30.slice(0, 25).forEach((city, cIdx) => {
    const base = 400 + (25 - cIdx) * 35;
    years.forEach((yr, yIdx) => {
      const T = base + yIdx * 15 + randomStandardNormal(rng4) * 30;
      rows4.push({
        Kota: city,
        Tahun: yr,
        Emisi_Pemkot: Number((-30 + 0.95 * T + randomStandardNormal(rng4) * 74).toFixed(2)),
        Emisi_Satelit_OCO2: Number((18 + 1.05 * T + randomStandardNormal(rng4) * 44).toFixed(2)),
        Emisi_Sensor_Darat: Number((4 + 1.00 * T + randomStandardNormal(rng4) * 19).toFixed(2)),
        Emisi_Inventaris_EDGAR: Number((12 + 1.02 * T + randomStandardNormal(rng4) * 31).toFixed(2))
      });
    });
  });
  const sheet4 = buildRawSheetFromObjects('Empat_Sumber_CO2', rows4);
  const wb4 = validateWorkbookForMsma('Preset_4Sumber_NCorneredHat_CO2.xlsx', 17600, 'preset', [sheet4]);

  // 4. FIVE SOURCES WITH CORRELATED SATELLITE PAIR (J = 5, Extended Collocation vs NCH)
  const rng5 = createSeededRng(20260404);
  const rows5: Record<string, unknown>[] = [];
  INDONESIAN_CITIES_30.slice(0, 25).forEach((city, cIdx) => {
    const base = 410 + (25 - cIdx) * 36;
    years.forEach((yr, yIdx) => {
      const T = base + yIdx * 15 + randomStandardNormal(rng5) * 32;
      const sharedCloudErr = randomStandardNormal(rng5) * 36;
      rows5.push({
        Kota: city,
        Tahun: yr,
        Emisi_Pemkot: Number((-25 + 0.96 * T + randomStandardNormal(rng5) * 70).toFixed(2)),
        Emisi_Satelit_OptikA: Number((15 + 1.04 * T + sharedCloudErr + randomStandardNormal(rng5) * 24).toFixed(2)),
        Emisi_Satelit_OptikB: Number((20 + 1.06 * T + 0.85 * sharedCloudErr + randomStandardNormal(rng5) * 26).toFixed(2)),
        Emisi_Sensor_Menara: Number((3 + 1.00 * T + randomStandardNormal(rng5) * 17).toFixed(2)),
        Emisi_CEMS_Industri: Number((-8 + 0.99 * T + randomStandardNormal(rng5) * 29).toFixed(2))
      });
    });
  });
  const sheet5 = buildRawSheetFromObjects('Lima_Sumber_EC', rows5);
  const wb5 = validateWorkbookForMsma('Preset_5Sumber_ExtendedCollocation_CO2.xlsx', 21200, 'preset', [sheet5]);

  // 5. TWO SOURCES (J = 2, Panel Bland-Altman & Deming Regression)
  const rng2 = createSeededRng(20260405);
  const rows2: Record<string, unknown>[] = [];
  INDONESIAN_CITIES_30.slice(0, 24).forEach((city, cIdx) => {
    const base = 390 + (24 - cIdx) * 34;
    const cityBiasDiff = randomStandardNormal(rng2) * 18;
    years.forEach((yr, yIdx) => {
      const T = base + yIdx * 14 + randomStandardNormal(rng2) * 26;
      rows2.push({
        Kota: city,
        Tahun: yr,
        Emisi_Pemkot: Number((-28 + 0.93 * T + cityBiasDiff + randomStandardNormal(rng2) * 45).toFixed(2)),
        Emisi_Satelit: Number((14 + 1.04 * T + randomStandardNormal(rng2) * 32).toFixed(2))
      });
    });
  });
  const sheet2 = buildRawSheetFromObjects('Dua_Sumber_Panel', rows2);
  const wb2 = validateWorkbookForMsma('Preset_2Sumber_BlandAltman_Deming.xlsx', 13100, 'preset', [sheet2]);

  const mkSrc = (
    id: string,
    col: string,
    name: string,
    unit: string,
    def: string,
    dim: MsmaSourceConfig['physicalDimension'],
    scope: string,
    origin: string
  ): MsmaSourceConfig => ({
    id,
    columnKey: col,
    displayName: name,
    unit,
    constructDefinition: def,
    physicalDimension: dim,
    spatialScope: scope,
    temporalPeriod: 'Tahunan (Annual)',
    dataType: 'continuous_numeric',
    sourceOriginInfo: origin,
    unitScaleMultiplier: 1,
    conversionModelEnabled: false,
    conversionSlope: 1,
    conversionIntercept: 0,
    conversionUncertaintySd: 0,
    conversionFormulaNote: '',
    conversionLiteratureRef: ''
  });

  return [
    {
      presetId: 'CONTOH_A_CO2_3SRC',
      title: 'Contoh A (3 Sumber Setara — TCA): Emisi CO₂ 30 Kota × 6 Tahun',
      subtitle: 'Pemkot, Satelit, dan Sensor Lapangan dalam satuan sepadan (kt CO₂/tahun). Menguji TCA & ETC lengkap.',
      workbook: wbA,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      presetSources: [
        mkSrc('src_1', 'Emisi_Pemkot', 'Pelaporan Mandiri Pemkot', 'kt CO₂/tahun', 'Total emisi CO₂ antropogenik tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Batas administratif kota', 'Inventaris GRK Dinas Lingkungan Hidup Kota'),
        mkSrc('src_2', 'Emisi_Satelit', 'Pengukuran Satelit', 'kt CO₂/tahun', 'Total emisi CO₂ antropogenik tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Grid perkotaan setara batas kota', 'Inversi fluks satelit teragregasi tahunan'),
        mkSrc('src_3', 'Emisi_Sensor', 'Sensor Lapangan', 'kt CO₂/tahun', 'Total emisi CO₂ antropogenik tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Jaringan stasiun fluks kota', 'Jaringan sensor eddy-covariance / CEMS perkotaan')
      ]
    },
    {
      presetId: 'CONTOH_B_DIFF_CONSTRUCT',
      title: 'Contoh B (Beda Konstruk Fisik): Emisi (ton/thn) vs Konsentrasi XCO₂ (ppm)',
      subtitle: 'Mendemonstrasikan deteksi perbedaan konstruk pengukuran, peringatan metodologis, dan pemeriksaan harmonisasi fisik.',
      workbook: wbB,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      presetSources: [
        mkSrc('src_1', 'Emisi_Pemkot_TonThn', 'Emisi Pemkot', 'ton CO₂/tahun', 'Total fluks emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Batas administratif kota', 'Laporan inventaris emisi daerah'),
        mkSrc('src_2', 'Konsentrasi_Satelit_ppm', 'Satelit XCO₂', 'ppm', 'Rata-rata fraksi mol kolom kering CO₂ atmosfer (XCO₂)', 'ATMOSPHERIC_MOLE_FRACTION', 'Kolom atmosfer 10×10 km di atas kota', 'Pengamatan kolom satelit OCO-2/3'),
        mkSrc('src_3', 'Konsentrasi_SensorLokal_ppm', 'Sensor Lokal CO₂', 'ppm', 'Konsentrasi CO₂ udara ambien permukaan lokal', 'SURFACE_CONCENTRATION', 'Radius 500 m stasiun jalan utama', 'Sensor NDIR permukaan stasiun tunggal')
      ]
    },
    {
      presetId: 'FOUR_SOURCE_CO2',
      title: '4 Sumber Pengukuran (Four / N-Cornered Hat): Emisi CO₂ 25 Kota × 6 Tahun',
      subtitle: 'Evaluasi 4 instrumen independen menggunakan N-Cornered Hat berkendala PSD & pembanding Extended Collocation.',
      workbook: wb4,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      presetSources: [
        mkSrc('src_1', 'Emisi_Pemkot', 'Pelaporan Pemkot', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Inventaris mandiri pemerintah kota'),
        mkSrc('src_2', 'Emisi_Satelit_OCO2', 'Satelit OCO-2', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Produk fluks satelit OCO-2'),
        mkSrc('src_3', 'Emisi_Sensor_Darat', 'Sensor Darat', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Jaringan fluks menara darat'),
        mkSrc('src_4', 'Emisi_Inventaris_EDGAR', 'Inventaris Independen', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Downscaling inventaris global independen')
      ]
    },
    {
      presetId: 'FIVE_SOURCE_EC',
      title: '5 Sumber dengan Korelasi Galat Satelit (Extended Collocation): 25 Kota × 6 Tahun',
      subtitle: 'Dua produk satelit optik berbagi gangguan awan yang sama; menguji deteksi kovarians galat pada Extended Collocation.',
      workbook: wb5,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      presetSources: [
        mkSrc('src_1', 'Emisi_Pemkot', 'Pelaporan Pemkot', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Inventaris mandiri pemerintah kota'),
        mkSrc('src_2', 'Emisi_Satelit_OptikA', 'Satelit Optik A', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Satelit spektrometer optik A'),
        mkSrc('src_3', 'Emisi_Satelit_OptikB', 'Satelit Optik B', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Satelit spektrometer optik B (algoritma awan serupa)'),
        mkSrc('src_4', 'Emisi_Sensor_Menara', 'Sensor Menara', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Jaringan menara fluks permukaan'),
        mkSrc('src_5', 'Emisi_CEMS_Industri', 'Monitoring CEMS & Trafik', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Integrasi CEMS cerobong & penghitung lalu lintas')
      ]
    },
    {
      presetId: 'TWO_SOURCE_AGREEMENT',
      title: '2 Sumber Pengukuran (Panel Bland-Altman & Deming Regression): 24 Kota × 6 Tahun',
      subtitle: 'Evaluasi kesepakatan, bias sistematis, dan proportional bias 2 sumber tanpa klaim peringkat akurasi absolut semu.',
      workbook: wb2,
      entityColumn: 'Kota',
      timeColumn: 'Tahun',
      presetSources: [
        mkSrc('src_1', 'Emisi_Pemkot', 'Pelaporan Pemkot', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Inventaris pemerintah kota'),
        mkSrc('src_2', 'Emisi_Satelit', 'Pengukuran Satelit', 'kt CO₂/tahun', 'Total emisi CO₂ tahunan kota', 'EMISSION_FLUX_MASS_PER_TIME', 'Wilayah kota', 'Estimasi fluks satelit perkotaan')
      ]
    }
  ];
}
