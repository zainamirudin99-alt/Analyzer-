// ============================================================
// Intelligent Measurement Source Configuration Engine (Step 2)
// 14 Automatic Column Analyses + 5 Recommendation Blocks (A-E)
// ============================================================

import {
  AccuracyPreprocessingOptions,
  MeasurementSource
} from './panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  parseNumericCell,
  quantileSorted
} from './panel-accuracy-validation';

export type RecommendationStatusBadge =
  | 'Recommended'
  | 'Recommended with Warning'
  | 'Needs Review'
  | 'Not Recommended';

export type ColumnDetectedCategory =
  | 'city_id'
  | 'year_id'
  | 'measurement_source'
  | 'uncertainty_se'
  | 'metadata_text'
  | 'excluded';

export interface ColumnCharacteristicProfile {
  columnKey: string;
  detectedCategory: ColumnDetectedCategory;
  inferredLabel: string;
  inferredUnit: string;
  totalRows: number;
  numericCount: number;
  nonNumericCount: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  sd: number | null;
  variance: number | null;
  median: number | null;
  iqr: number | null;
  cv: number | null;
  negativeCount: number;
  zeroCount: number;
  outlierCount: number;
  avgCorrelationWithPeers: number | null;
  maxCorrelationWithPeers: number | null;
  mostCorrelatedPeer: string | null;
  suitabilityClass: 'layak' | 'perlu_diperiksa' | 'tidak_direkomendasikan';
  statusBadge: RecommendationStatusBadge;
  statisticalReason: string;
  recommendedRole: 'reference' | 'comparison' | 'identity' | 'uncertainty' | 'exclude';
}

export interface FourteenPointAnalysisItem {
  stepNumber: number;
  title: string;
  summary: string;
  status: RecommendationStatusBadge;
}

export interface RecommendationTableRow {
  component: string;
  systemRecommendation: string;
  reason: string;
  status: RecommendationStatusBadge;
}

export interface IntelligentConfigurationReport {
  columnsAnalyzed: number;
  totalRows: number;
  columnProfiles: ColumnCharacteristicProfile[];
  fourteenPointAnalyses: FourteenPointAnalysisItem[];
  recommendationTable: RecommendationTableRow[];
  blockAIdentity: {
    recommendedCityId: string;
    cityIdCandidates: string[];
    cityIdReason: string;
    recommendedYear: string;
    yearCandidates: string[];
    yearReason: string;
    multiCandidateWarning: string | null;
  };
  blockBSources: {
    recommendedReferenceCol: string;
    recommendedReferenceReason: string;
    layakColumns: string[];
    perluDiperiksaColumns: string[];
    tidakDirekomendasikanColumns: string[];
    uncertaintyColumns: Record<string, string>; // sourceCol -> seCol
    details: Array<{
      columnKey: string;
      classification: 'Layak Digunakan' | 'Perlu Diperiksa' | 'Tidak Direkomendasikan';
      status: RecommendationStatusBadge;
      reason: string;
    }>;
  };
  blockCUnits: {
    inferredUnitsByCol: Record<string, string>;
    scaleRatioMaxToMin: number;
    hasScaleDiscrepancy: boolean;
    recommendationPoints: string[];
  };
  blockDModelStructure: {
    validSourceCount: number;
    completeCasePairs: number;
    supportsReferenceBasedModel: boolean;
    supportsLatentModel: boolean;
    latentIdentificationNote: string;
    errorDependencyWarnings: string[];
    missingnessNote: string;
    loadingConstraintNote: string;
    bayesianFeasibilityNote: string;
    summaryPoints: string[];
  };
  blockEPreprocessing: {
    duplicatePairCount: number;
    totalOutliers: number;
    hasNegativeValues: boolean;
    recommendedPreprocessing: AccuracyPreprocessingOptions;
    recommendationPoints: string[];
  };
  recommendedMapping: {
    cityIdColumn: string;
    yearColumn: string;
    sources: MeasurementSource[];
  };
  minimumRequirements: {
    canProceed: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
}

function inferUnitFromHeader(col: string): string {
  const lower = col.toLowerCase();
  if (lower.includes('mt') || lower.includes('megaton')) return 'Mt CO₂';
  if (lower.includes('kt') || lower.includes('kiloton')) return 'kt CO₂';
  if (lower.includes('ton') || lower.includes('tco2')) return 't CO₂';
  if (lower.includes('ppm')) return 'ppm';
  if (lower.includes('index') || lower.includes('indeks')) return 'Index';
  return 'kt CO₂';
}

function inferSourceLabel(col: string, idx: number): string {
  const clean = col.replace(/[_-]+/g, ' ').trim();
  if (/self|report|lapor/i.test(col)) return 'Self-Reporting';
  if (/sat.*alt|high.*res|oco|tropomi|gosat/i.test(col)) return 'Alternative Satellite';
  if (/sat|remote/i.test(col)) return 'Satellite Measurement';
  if (/sens|cems|ground|ref|stasiun|flux/i.test(col)) return 'Field Sensor';
  if (/indep|audit|verif/i.test(col)) return 'Independent Monitoring';
  return clean || `Measurement Source ${idx + 1}`;
}

function inferMethodDescription(col: string): string {
  if (/self|report|lapor/i.test(col)) {
    return 'Inventarisasi mandiri berbasis faktor emisi aktivitas bahan bakar daerah.';
  }
  if (/sat.*alt|high.*res|oco|tropomi|gosat/i.test(col)) {
    return 'Observasi satelit resolusi tinggi dengan koreksi inversi atmosferik.';
  }
  if (/sat|remote/i.test(col)) {
    return 'Estimasi penginderaan jauh satelit standar kolom atmosferik.';
  }
  if (/sens|cems|ground|ref|stasiun|flux/i.test(col)) {
    return 'Pengukuran instrumen sensor lapangan / CEMS terkalibrasi langsung.';
  }
  if (/indep|audit|verif/i.test(col)) {
    return 'Pemantauan independen pihak ketiga terverifikasi.';
  }
  return 'Pengukuran emisi CO₂ panel Kota-Tahun.';
}

function pearsonPair(a: Array<number | null>, b: Array<number | null>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const ux = xs[i] - mx;
    const uy = ys[i] - my;
    num += ux * uy;
    dx += ux * ux;
    dy += uy * uy;
  }
  if (dx <= 1e-12 || dy <= 1e-12) return null;
  return num / Math.sqrt(dx * dy);
}

export function runIntelligentMeasurementSourceEngine(params: {
  columns: string[];
  rows: Record<string, unknown>[];
  currentCityIdColumn?: string;
  currentYearColumn?: string;
  currentSources?: MeasurementSource[];
}): IntelligentConfigurationReport {
  const { columns, rows, currentCityIdColumn, currentYearColumn, currentSources } = params;
  const totalRows = rows.length;

  // 1. Parse raw numeric vectors & basic stats per column
  const numericVectors: Record<string, Array<number | null>> = {};
  const rawStats: Record<
    string,
    {
      numericCount: number;
      nonNumericCount: number;
      missingCount: number;
      uniqueCount: number;
      integerShare: number;
      yearPlausibleShare: number;
      min: number | null;
      max: number | null;
      mean: number | null;
      sd: number | null;
      variance: number | null;
      median: number | null;
      iqr: number | null;
      cv: number | null;
      negativeCount: number;
      zeroCount: number;
      outlierCount: number;
    }
  > = {};

  columns.forEach(col => {
    const vec: Array<number | null> = [];
    const validNums: number[] = [];
    const uniqueRaw = new Set<string>();
    let nonNumericCount = 0;
    let missingCount = 0;
    let intCount = 0;
    let yearPlausible = 0;

    rows.forEach(r => {
      const raw = r[col];
      const str = String(raw ?? '').trim();
      if (!str || /^(na|n\/a|null|nan|-|\.|#n\/a)$/i.test(str)) {
        missingCount++;
        vec.push(null);
        return;
      }
      uniqueRaw.add(str);
      const parsed = parseNumericCell(raw);
      if (parsed === null) {
        nonNumericCount++;
        vec.push(null);
      } else {
        vec.push(parsed);
        validNums.push(parsed);
        if (Math.abs(parsed - Math.round(parsed)) < 1e-9) {
          intCount++;
          if (parsed >= 1950 && parsed <= 2100) yearPlausible++;
        }
      }
    });

    numericVectors[col] = vec;
    const n = validNums.length;
    if (n === 0) {
      rawStats[col] = {
        numericCount: 0,
        nonNumericCount,
        missingCount,
        uniqueCount: uniqueRaw.size,
        integerShare: 0,
        yearPlausibleShare: 0,
        min: null,
        max: null,
        mean: null,
        sd: null,
        variance: null,
        median: null,
        iqr: null,
        cv: null,
        negativeCount: 0,
        zeroCount: 0,
        outlierCount: 0
      };
      return;
    }

    const sorted = [...validNums].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = validNums.reduce((s, v) => s + v, 0) / n;
    const variance =
      n > 1 ? validNums.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(Math.max(0, variance));
    const q1 = quantileSorted(sorted, 0.25);
    const median = quantileSorted(sorted, 0.5);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const outlierCount =
      iqr > 0 ? validNums.filter(v => v < loFence || v > hiFence).length : 0;
    const negativeCount = validNums.filter(v => v < 0).length;
    const zeroCount = validNums.filter(v => v === 0).length;
    const cv = Math.abs(mean) > 1e-9 ? sd / Math.abs(mean) : 0;

    rawStats[col] = {
      numericCount: n,
      nonNumericCount,
      missingCount,
      uniqueCount: uniqueRaw.size,
      integerShare: intCount / n,
      yearPlausibleShare: yearPlausible / n,
      min,
      max,
      mean,
      sd,
      variance,
      median,
      iqr,
      cv,
      negativeCount,
      zeroCount,
      outlierCount
    };
  });

  // 2. Detect City ID Candidates & Year Candidates
  const yearCandidates = columns.filter(col => {
    const st = rawStats[col];
    const nameMatch = /^(year|tahun|yr|periode|time|waktu|period)$/i.test(col) || /year|tahun|periode/i.test(col);
    const valuesMatch =
      st.numericCount > 0 &&
      st.integerShare >= 0.95 &&
      st.yearPlausibleShare >= 0.8 &&
      st.uniqueCount >= 2 &&
      st.uniqueCount <= Math.max(2, totalRows);
    return nameMatch || valuesMatch;
  });

  const recommendedYear =
    yearCandidates.find(c => /^(year|tahun|yr|periode)$/i.test(c)) ||
    yearCandidates[0] ||
    columns[1] ||
    columns[0] ||
    '';

  const cityIdCandidates = columns.filter(col => {
    if (col === recommendedYear) return false;
    const st = rawStats[col];
    const nameMatch =
      /^(city|kota|kab|kabupaten|entity|id|region|wilayah|prov|provinsi|daerah)/i.test(col) ||
      /city|kota|wilayah|entity/i.test(col);
    const isStringIdentifier =
      st.numericCount === 0 &&
      st.nonNumericCount > 0 &&
      st.uniqueCount >= 2 &&
      st.uniqueCount < totalRows;
    return nameMatch || isStringIdentifier;
  });

  const recommendedCityId =
    cityIdCandidates.find(c => /^(city|kota|city_id|id_kota)/i.test(c)) ||
    cityIdCandidates[0] ||
    columns.find(c => c !== recommendedYear) ||
    columns[0] ||
    '';

  // 3. Detect Uncertainty/SE columns vs Measurement Source columns
  const remainingCols = columns.filter(
    c => c !== recommendedCityId && c !== recommendedYear
  );
  const seCols = remainingCols.filter(
    c => /^(se|uncert|sd|err)[_\s-]/i.test(c) || /[_\s-](se|uncert|sd)$/i.test(c)
  );
  const measurementCandidateCols = remainingCols.filter(c => !seCols.includes(c));

  // 4. Compute pairwise correlations among measurement candidate columns
  const validMeasurementCols = measurementCandidateCols.filter(
    c => rawStats[c].numericCount >= 2 && (rawStats[c].sd ?? 0) > 1e-9
  );

  const peerCorrMap: Record<
    string,
    { avg: number | null; max: number | null; peer: string | null }
  > = {};

  measurementCandidateCols.forEach(col => {
    const corrs: Array<{ peer: string; r: number }> = [];
    validMeasurementCols.forEach(other => {
      if (other === col) return;
      const r = pearsonPair(numericVectors[col], numericVectors[other]);
      if (r !== null && Number.isFinite(r)) {
        corrs.push({ peer: other, r });
      }
    });
    if (corrs.length === 0) {
      peerCorrMap[col] = { avg: null, max: null, peer: null };
    } else {
      const avg = corrs.reduce((s, x) => s + x.r, 0) / corrs.length;
      const sorted = [...corrs].sort((a, b) => b.r - a.r);
      peerCorrMap[col] = {
        avg,
        max: sorted[0].r,
        peer: sorted[0].peer
      };
    }
  });

  // 5. Evaluate Multi-Criteria Reference Source Score (NOT based on correlation alone!)
  // Criteria: (a) coverage, (b) non-zero variance, (c) field-sensor/calibrated ground-truth semantics,
  // (d) low outlier distortion, (e) scale consistency with median of sources
  const medians = validMeasurementCols
    .map(c => rawStats[c].median ?? 0)
    .filter(m => m > 0);
  const globalMedianScale =
    medians.length > 0
      ? medians.sort((a, b) => a - b)[Math.floor(medians.length / 2)]
      : 1;

  let bestRefCol = validMeasurementCols[0] || measurementCandidateCols[0] || '';
  let bestRefScore = -Infinity;

  validMeasurementCols.forEach(col => {
    const st = rawStats[col];
    const coverageRatio = totalRows > 0 ? st.numericCount / totalRows : 0;
    const outlierRatio = st.numericCount > 0 ? st.outlierCount / st.numericCount : 0;
    const isCalibratedGroundSensor = /sens|cems|ground|ref|stasiun|flux|acuan/i.test(col) ? 1 : 0;
    const scaleRatio =
      globalMedianScale > 0 && (st.median ?? 0) > 0
        ? Math.max((st.median ?? 1) / globalMedianScale, globalMedianScale / (st.median ?? 1))
        : 1;
    const scalePenalty = scaleRatio > 10 ? 0.35 : 0;

    // Multi-criteria score intentionally excludes "highest correlation wins"
    const score =
      coverageRatio * 0.40 +
      isCalibratedGroundSensor * 0.35 +
      (1 - Math.min(1, outlierRatio)) * 0.15 +
      (st.negativeCount === 0 ? 0.10 : 0) -
      scalePenalty;

    if (score > bestRefScore) {
      bestRefScore = score;
      bestRefCol = col;
    }
  });

  // 6. Build Column Profiles
  const columnProfiles: ColumnCharacteristicProfile[] = columns.map((col, idx) => {
    const st = rawStats[col];
    const missingPct = totalRows > 0 ? (st.missingCount / totalRows) * 100 : 0;
    const corrInfo = peerCorrMap[col] || { avg: null, max: null, peer: null };

    if (col === recommendedCityId) {
      return {
        columnKey: col,
        detectedCategory: 'city_id',
        inferredLabel: 'Identitas Kota / Entitas Panel (City ID)',
        inferredUnit: '-',
        totalRows,
        numericCount: st.numericCount,
        nonNumericCount: st.nonNumericCount,
        missingCount: st.missingCount,
        missingPct,
        uniqueCount: st.uniqueCount,
        min: st.min,
        max: st.max,
        mean: st.mean,
        sd: st.sd,
        variance: st.variance,
        median: st.median,
        iqr: st.iqr,
        cv: st.cv,
        negativeCount: st.negativeCount,
        zeroCount: st.zeroCount,
        outlierCount: st.outlierCount,
        avgCorrelationWithPeers: null,
        maxCorrelationWithPeers: null,
        mostCorrelatedPeer: null,
        suitabilityClass: st.missingCount === 0 && st.uniqueCount >= 2 ? 'layak' : 'perlu_diperiksa',
        statusBadge: st.missingCount === 0 && st.uniqueCount >= 2 ? 'Recommended' : 'Needs Review',
        statisticalReason: `Terdeteksi ${st.uniqueCount} entitas unik dengan ${st.missingCount} missing value; memenuhi struktur cross-section panel (i).`,
        recommendedRole: 'identity'
      };
    }

    if (col === recommendedYear) {
      return {
        columnKey: col,
        detectedCategory: 'year_id',
        inferredLabel: 'Identitas Periode Waktu (Year)',
        inferredUnit: 'Tahun',
        totalRows,
        numericCount: st.numericCount,
        nonNumericCount: st.nonNumericCount,
        missingCount: st.missingCount,
        missingPct,
        uniqueCount: st.uniqueCount,
        min: st.min,
        max: st.max,
        mean: st.mean,
        sd: st.sd,
        variance: st.variance,
        median: st.median,
        iqr: st.iqr,
        cv: st.cv,
        negativeCount: st.negativeCount,
        zeroCount: st.zeroCount,
        outlierCount: st.outlierCount,
        avgCorrelationWithPeers: null,
        maxCorrelationWithPeers: null,
        mostCorrelatedPeer: null,
        suitabilityClass: st.missingCount === 0 && st.uniqueCount >= 2 ? 'layak' : 'perlu_diperiksa',
        statusBadge: st.missingCount === 0 && st.uniqueCount >= 2 ? 'Recommended' : 'Needs Review',
        statisticalReason: `Terdeteksi ${st.uniqueCount} periode tahun unik (${st.min ?? '-'}–${st.max ?? '-'}) dengan bilangan bulat konsisten untuk dimensi waktu panel (t).`,
        recommendedRole: 'identity'
      };
    }

    if (seCols.includes(col)) {
      return {
        columnKey: col,
        detectedCategory: 'uncertainty_se',
        inferredLabel: `Kolom Uncertainty / SE (${col})`,
        inferredUnit: inferUnitFromHeader(col),
        totalRows,
        numericCount: st.numericCount,
        nonNumericCount: st.nonNumericCount,
        missingCount: st.missingCount,
        missingPct,
        uniqueCount: st.uniqueCount,
        min: st.min,
        max: st.max,
        mean: st.mean,
        sd: st.sd,
        variance: st.variance,
        median: st.median,
        iqr: st.iqr,
        cv: st.cv,
        negativeCount: st.negativeCount,
        zeroCount: st.zeroCount,
        outlierCount: st.outlierCount,
        avgCorrelationWithPeers: null,
        maxCorrelationWithPeers: null,
        mostCorrelatedPeer: null,
        suitabilityClass: 'perlu_diperiksa',
        statusBadge: 'Recommended with Warning',
        statisticalReason: 'Kolom terdeteksi sebagai simpangan baku / uncertainty pendamping, bukan sumber pengukuran emisi utama.',
        recommendedRole: 'uncertainty'
      };
    }

    // Measurement candidate evaluation
    if (st.numericCount < 3 || (st.sd ?? 0) <= 1e-9) {
      return {
        columnKey: col,
        detectedCategory: st.numericCount === 0 ? 'metadata_text' : 'excluded',
        inferredLabel: inferSourceLabel(col, idx),
        inferredUnit: inferUnitFromHeader(col),
        totalRows,
        numericCount: st.numericCount,
        nonNumericCount: st.nonNumericCount,
        missingCount: st.missingCount,
        missingPct,
        uniqueCount: st.uniqueCount,
        min: st.min,
        max: st.max,
        mean: st.mean,
        sd: st.sd,
        variance: st.variance,
        median: st.median,
        iqr: st.iqr,
        cv: st.cv,
        negativeCount: st.negativeCount,
        zeroCount: st.zeroCount,
        outlierCount: st.outlierCount,
        avgCorrelationWithPeers: corrInfo.avg,
        maxCorrelationWithPeers: corrInfo.max,
        mostCorrelatedPeer: corrInfo.peer,
        suitabilityClass: 'tidak_direkomendasikan',
        statusBadge: 'Not Recommended',
        statisticalReason:
          st.numericCount < 3
            ? `Hanya memiliki ${st.numericCount} nilai numerik valid (${st.nonNumericCount} teks/non-numerik).`
            : 'Varians bernilai nol (kolom konstan), sehingga tidak memiliki informasi variasi emisi.',
        recommendedRole: 'exclude'
      };
    }

    const scaleRatio =
      globalMedianScale > 0 && (st.median ?? 0) > 0
        ? Math.max((st.median ?? 1) / globalMedianScale, globalMedianScale / (st.median ?? 1))
        : 1;

    const hasWarning =
      missingPct > 15 || st.outlierCount > 0 || st.negativeCount > 0 || scaleRatio > 10;
    const needsReview = missingPct > 35 || scaleRatio > 25 || st.negativeCount > 0;

    const statusBadge: RecommendationStatusBadge = needsReview
      ? 'Needs Review'
      : hasWarning
        ? 'Recommended with Warning'
        : 'Recommended';

    const suitabilityClass = needsReview ? 'perlu_diperiksa' : 'layak';
    const isRef = col === bestRefCol;

    const reasonParts: string[] = [
      `N valid = ${st.numericCount}/${totalRows} (${(100 - missingPct).toFixed(1)}% cakupan)`,
      `SD = ${(st.sd ?? 0).toFixed(2)} (CV = ${((st.cv ?? 0) * 100).toFixed(1)}%)`
    ];
    if (isRef) {
      reasonParts.push('Dipilih sebagai kandidat Reference Source (r) karena cakupan tinggi, varians stabil, dan karakteristik instrumen acuan.');
    }
    if (st.outlierCount > 0) {
      reasonParts.push(`Terdapat ${st.outlierCount} outlier 1.5×IQR.`);
    }
    if (scaleRatio > 10) {
      reasonParts.push(`Rasio skala median mencapai ${scaleRatio.toFixed(1)}× terhadap median sumber lain (periksa satuan).`);
    }

    return {
      columnKey: col,
      detectedCategory: 'measurement_source',
      inferredLabel: inferSourceLabel(col, idx),
      inferredUnit: inferUnitFromHeader(col),
      totalRows,
      numericCount: st.numericCount,
      nonNumericCount: st.nonNumericCount,
      missingCount: st.missingCount,
      missingPct,
      uniqueCount: st.uniqueCount,
      min: st.min,
      max: st.max,
      mean: st.mean,
      sd: st.sd,
      variance: st.variance,
      median: st.median,
      iqr: st.iqr,
      cv: st.cv,
      negativeCount: st.negativeCount,
      zeroCount: st.zeroCount,
      outlierCount: st.outlierCount,
      avgCorrelationWithPeers: corrInfo.avg,
      maxCorrelationWithPeers: corrInfo.max,
      mostCorrelatedPeer: corrInfo.peer,
      suitabilityClass,
      statusBadge,
      statisticalReason: reasonParts.join('; '),
      recommendedRole: isRef ? 'reference' : 'comparison'
    };
  });

  // 7. Duplicate & Complete-Case Pair Analysis
  const seenPairs = new Set<string>();
  let duplicatePairCount = 0;
  let completeCasePairs = 0;

  rows.forEach(r => {
    const cVal = String(r[recommendedCityId] ?? '').trim();
    const yVal = parseNumericCell(r[recommendedYear]);
    if (!cVal || yVal === null) return;
    const key = `${cVal}__${yVal}`;
    if (seenPairs.has(key)) {
      duplicatePairCount++;
    } else {
      seenPairs.add(key);
    }
    const allValid =
      validMeasurementCols.length >= 2 &&
      validMeasurementCols.every(col => parseNumericCell(r[col]) !== null);
    if (allValid) completeCasePairs++;
  });

  // 8. Potential Measurement Dependency Analysis (Shared methodology / r > 0.96)
  const errorDependencyWarnings: string[] = [];
  for (let i = 0; i < validMeasurementCols.length; i++) {
    for (let j = i + 1; j < validMeasurementCols.length; j++) {
      const colA = validMeasurementCols[i];
      const colB = validMeasurementCols[j];
      const r = pearsonPair(numericVectors[colA], numericVectors[colB]);
      const bothSat = /sat|remote|oco|tropomi/i.test(colA) && /sat|remote|oco|tropomi/i.test(colB);
      if ((r !== null && r > 0.96) || bothSat) {
        errorDependencyWarnings.push(
          `Pasangan sumber (${colA}, ${colB}) memiliki korelasi r = ${(r ?? 0).toFixed(4)}${bothSat ? ' dan sama-sama berbasis penginderaan jauh satelit' : ''}, sehingga berpotensi berbagi komponen kesalahan pengukuran (correlated error dependency).`
        );
      }
    }
  }

  // 9. Scale ratio across valid measurement columns
  const maxMed = medians.length > 0 ? Math.max(...medians) : 1;
  const minMed = medians.length > 0 ? Math.max(1e-9, Math.min(...medians)) : 1;
  const scaleRatioMaxToMin = medians.length >= 2 ? maxMed / minMed : 1;

  // 10. Build Recommended Mapping
  const uncertaintyColumns: Record<string, string> = {};
  const recommendedSources: MeasurementSource[] = validMeasurementCols.map((col, idx) => {
    const matchedSe = seCols.find(
      sc =>
        sc.toLowerCase().includes(col.toLowerCase()) ||
        sc.toLowerCase().endsWith(String(idx + 1))
    );
    if (matchedSe) uncertaintyColumns[col] = matchedSe;
    return {
      id: `src_${idx + 1}`,
      name: `X${idx + 1}`,
      label: inferSourceLabel(col, idx),
      columnKey: col,
      unit: inferUnitFromHeader(col),
      role: col === bestRefCol ? 'reference' : 'comparison',
      uncertaintyColumn: matchedSe,
      methodDescription: inferMethodDescription(col)
    };
  });

  // Ensure at least 1 reference source if list non-empty
  if (
    recommendedSources.length > 0 &&
    !recommendedSources.some(s => s.role === 'reference')
  ) {
    recommendedSources[recommendedSources.length - 1].role = 'reference';
  }

  // 11. Build 14-Point Automatic Analysis List
  const totalOutliers = validMeasurementCols.reduce(
    (s, c) => s + rawStats[c].outlierCount,
    0
  );
  const totalMissing = validMeasurementCols.reduce(
    (s, c) => s + rawStats[c].missingCount,
    0
  );
  const hasNegatives = validMeasurementCols.some(c => rawStats[c].negativeCount > 0);

  const fourteenPointAnalyses: FourteenPointAnalysisItem[] = [
    {
      stepNumber: 1,
      title: '1. Automatic Column Detection',
      summary: `Mendeteksi ${columns.length} kolom total: 2 kolom identitas panel, ${validMeasurementCols.length} kandidat sumber pengukuran numerik, dan ${seCols.length} kolom uncertainty/SE.`,
      status: validMeasurementCols.length >= 2 ? 'Recommended' : 'Not Recommended'
    },
    {
      stepNumber: 2,
      title: '2. City ID Detection',
      summary: `Kandidat utama City ID: "${recommendedCityId}" (${rawStats[recommendedCityId]?.uniqueCount ?? 0} kota unik).${cityIdCandidates.length > 1 ? ` Kandidat lain: ${cityIdCandidates.filter(c => c !== recommendedCityId).join(', ')}.` : ''}`,
      status: cityIdCandidates.length === 1 ? 'Recommended' : 'Recommended with Warning'
    },
    {
      stepNumber: 3,
      title: '3. Year Detection',
      summary: `Kandidat utama Year: "${recommendedYear}" (${rawStats[recommendedYear]?.uniqueCount ?? 0} periode tahun: ${rawStats[recommendedYear]?.min ?? '-'} s/d ${rawStats[recommendedYear]?.max ?? '-'}).`,
      status: yearCandidates.length === 1 ? 'Recommended' : 'Recommended with Warning'
    },
    {
      stepNumber: 4,
      title: '4. Measurement Variable Detection',
      summary: `Terdeteksi ${validMeasurementCols.length} variabel pengukuran aktif: ${validMeasurementCols.join(', ') || 'Tidak ada'}.`,
      status: validMeasurementCols.length >= 2 ? 'Recommended' : 'Not Recommended'
    },
    {
      stepNumber: 5,
      title: '5. Numeric Data Validation',
      summary:
        validMeasurementCols.every(c => rawStats[c].nonNumericCount === 0)
          ? 'Seluruh sel terisi pada kolom pengukuran berupa angka numerik valid (0 sel teks korup).'
          : 'Terdapat sel teks non-numerik pada kandidat kolom pengukuran yang otomatis ditandai sebagai missing (NA).',
      status: validMeasurementCols.every(c => rawStats[c].nonNumericCount === 0)
        ? 'Recommended'
        : 'Needs Review'
    },
    {
      stepNumber: 6,
      title: '6. Measurement Unit Detection',
      summary: `Satuan terdeteksi: ${validMeasurementCols.map(c => `${c} (${inferUnitFromHeader(c)})`).join(', ')}. Rasio skala median maks/min = ${scaleRatioMaxToMin.toFixed(2)}×.`,
      status: scaleRatioMaxToMin <= 10 ? 'Recommended' : 'Needs Review'
    },
    {
      stepNumber: 7,
      title: '7. Missing Value Analysis',
      summary: `Total sel kosong pada sumber pengukuran = ${totalMissing} sel; menghasilkan ${completeCasePairs} pasangan Kota-Tahun lengkap (Complete-Case).`,
      status: totalMissing === 0 ? 'Recommended' : 'Recommended with Warning'
    },
    {
      stepNumber: 8,
      title: '8. Measurement Range Analysis',
      summary: `Rentang nilai seluruh sumber berada pada [${Math.min(...validMeasurementCols.map(c => rawStats[c].min ?? 0)).toFixed(2)}, ${Math.max(...validMeasurementCols.map(c => rawStats[c].max ?? 0)).toFixed(2)}] dengan ${hasNegatives ? 'adanya nilai negatif' : '0 nilai negatif'}.`,
      status: hasNegatives ? 'Needs Review' : 'Recommended'
    },
    {
      stepNumber: 9,
      title: '9. Variance Analysis',
      summary: `Seluruh ${validMeasurementCols.length} sumber aktif memiliki varians positif (CV berkisar ${(Math.min(...validMeasurementCols.map(c => rawStats[c].cv ?? 0)) * 100).toFixed(1)}%–${(Math.max(...validMeasurementCols.map(c => rawStats[c].cv ?? 0)) * 100).toFixed(1)}%).`,
      status: validMeasurementCols.length >= 2 ? 'Recommended' : 'Not Recommended'
    },
    {
      stepNumber: 10,
      title: '10. Correlation Analysis',
      summary: `Korelasi Pearson awal antarsumber dihitung sebagai pemeriksaan keselarasan arah (korelasi tertinggi tidak otomatis dianggap paling akurat).`,
      status: 'Recommended'
    },
    {
      stepNumber: 11,
      title: '11. Duplicate and Coverage Analysis',
      summary: `Terdeteksi ${duplicatePairCount} duplikat kunci (City, Year) dari ${totalRows} baris dan ${completeCasePairs} observasi Complete-Case.`,
      status: duplicatePairCount === 0 ? 'Recommended' : 'Needs Review'
    },
    {
      stepNumber: 12,
      title: '12. Potential Measurement Dependency Analysis',
      summary:
        errorDependencyWarnings.length === 0
          ? 'Tidak ditemukan indikasi ketergantungan galat ekstrem (r > 0.96) antarsumber.'
          : errorDependencyWarnings[0],
      status: errorDependencyWarnings.length === 0 ? 'Recommended' : 'Recommended with Warning'
    },
    {
      stepNumber: 13,
      title: '13. Measurement Source Classification',
      summary: `Rekomendasi Reference Source (r): "${bestRefCol}" berdasarkan multi-kriteria (cakupan, varians, profil instrumen kalibrasi, dan ketahanan outlier).`,
      status: bestRefCol ? 'Recommended' : 'Not Recommended'
    },
    {
      stepNumber: 14,
      title: '14. Model Compatibility Assessment',
      summary: `Kompatibel untuk Reference-Based Pair FE (J = ${validMeasurementCols.length} >= 2) ${validMeasurementCols.length >= 3 ? 'serta memenuhi syarat identifikasi Latent Measurement Model (J >= 3).' : 'namun memerlukan minimal J >= 3 sumber bila ingin mengestimasi Latent Measurement Model tanpa batasan varians.'}`,
      status: validMeasurementCols.length >= 2 ? 'Recommended' : 'Not Recommended'
    }
  ];

  // 12. Build System Recommendation Table
  const recommendationTable: RecommendationTableRow[] = [
    {
      component: 'City ID',
      systemRecommendation: recommendedCityId || 'Belum terdeteksi',
      reason: `Struktur identitas cross-section (${rawStats[recommendedCityId]?.uniqueCount ?? 0} kota unik, ${rawStats[recommendedCityId]?.missingCount ?? 0} missing).`,
      status:
        recommendedCityId && (rawStats[recommendedCityId]?.uniqueCount ?? 0) >= 2
          ? cityIdCandidates.length > 1
            ? 'Recommended with Warning'
            : 'Recommended'
          : 'Not Recommended'
    },
    {
      component: 'Year',
      systemRecommendation: recommendedYear || 'Belum terdeteksi',
      reason: `Struktur dimensi waktu tahunan (${rawStats[recommendedYear]?.uniqueCount ?? 0} periode tahun unik: ${rawStats[recommendedYear]?.min ?? '-'}–${rawStats[recommendedYear]?.max ?? '-'}).`,
      status:
        recommendedYear && (rawStats[recommendedYear]?.uniqueCount ?? 0) >= 2
          ? yearCandidates.length > 1
            ? 'Recommended with Warning'
            : 'Recommended'
          : 'Not Recommended'
    }
  ];

  let srcCounter = 1;
  columnProfiles.forEach(prof => {
    if (prof.columnKey === recommendedCityId || prof.columnKey === recommendedYear) return;
    if (prof.detectedCategory === 'uncertainty_se') {
      recommendationTable.push({
        component: `Uncertainty / SE (${prof.columnKey})`,
        systemRecommendation: `${prof.columnKey} -> Kolom SE Pendamping`,
        reason: prof.statisticalReason,
        status: prof.statusBadge
      });
      return;
    }
    const labelRole =
      prof.columnKey === bestRefCol
        ? `${prof.columnKey} (${prof.inferredLabel} — Kandidat Reference Source r)`
        : `${prof.columnKey} (${prof.inferredLabel} — Comparison Source)`;
    recommendationTable.push({
      component: `Source ${srcCounter++}`,
      systemRecommendation: labelRole,
      reason: prof.statisticalReason,
      status: prof.statusBadge
    });
  });

  // 13. Check Current Active Mapping vs Minimum Requirements
  const activeCity = currentCityIdColumn ?? recommendedCityId;
  const activeYear = currentYearColumn ?? recommendedYear;
  const activeSources = currentSources ?? recommendedSources;

  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!activeCity || !columns.includes(activeCity)) {
    blockingReasons.push('Kolom City ID belum dipilih atau tidak ditemukan di dalam dataset.');
  }
  if (!activeYear || !columns.includes(activeYear)) {
    blockingReasons.push('Kolom Year belum dipilih atau tidak ditemukan di dalam dataset.');
  }
  if (activeCity && activeYear && activeCity === activeYear) {
    blockingReasons.push('Kolom City ID dan Year tidak boleh menunjuk pada kolom yang sama.');
  }
  if (activeSources.length < 2) {
    blockingReasons.push('Minimal diperlukan 2 sumber pengukuran valid untuk analisis komparatif.');
  }
  const refCount = activeSources.filter(s => s.role === 'reference').length;
  if (refCount !== 1) {
    blockingReasons.push(`Wajib memilih tepat 1 Reference Source (saat ini terpilih ${refCount}).`);
  }
  const mappedColSet = new Set(activeSources.map(s => s.columnKey));
  if (mappedColSet.size !== activeSources.length) {
    blockingReasons.push('Setiap sumber pengukuran wajib memetakan kolom dataset yang berbeda (terdeteksi duplikasi pemetaan kolom).');
  }
  if (activeSources.some(s => s.columnKey === activeCity || s.columnKey === activeYear)) {
    blockingReasons.push('Kolom City ID atau Year tidak boleh sekaligus dipetakan sebagai sumber pengukuran.');
  }
  if (completeCasePairs < 2) {
    blockingReasons.push('Jumlah pasangan observasi lengkap (Complete-Case) kurang dari 2 baris.');
  }
  if (duplicatePairCount > 0) {
    warnings.push(`Terdapat ${duplicatePairCount} baris duplikat kunci (City, Year) yang perlu dibersihkan pada Step 3.`);
  }
  if (scaleRatioMaxToMin > 10) {
    warnings.push(`Rasio skala median antarsumber mencapai ${scaleRatioMaxToMin.toFixed(1)}×; periksa keseragaman satuan pada Step 2/3.`);
  }

  const recommendedPreproc: AccuracyPreprocessingOptions = {
    ...DEFAULT_ACCURACY_PREPROCESSING,
    dropDuplicateCityYear: duplicatePairCount > 0,
    applyWinsorize: totalOutliers >= Math.max(3, Math.ceil(completeCasePairs * 0.10)),
    applyLog1p: false
  };

  return {
    columnsAnalyzed: columns.length,
    totalRows,
    columnProfiles,
    fourteenPointAnalyses,
    recommendationTable,
    blockAIdentity: {
      recommendedCityId,
      cityIdCandidates,
      cityIdReason: `Kolom "${recommendedCityId}" memiliki ${rawStats[recommendedCityId]?.uniqueCount ?? 0} entitas kota unik dengan pengamatan berulang lintas waktu.`,
      recommendedYear,
      yearCandidates,
      yearReason: `Kolom "${recommendedYear}" memuat ${rawStats[recommendedYear]?.uniqueCount ?? 0} periode waktu bulat berturut-turut (${rawStats[recommendedYear]?.min ?? '-'}–${rawStats[recommendedYear]?.max ?? '-'}).`,
      multiCandidateWarning:
        cityIdCandidates.length > 1 || yearCandidates.length > 1
          ? `Perhatian: Terdeteksi lebih dari satu kandidat identitas (${cityIdCandidates.length} kandidat City ID, ${yearCandidates.length} kandidat Year). Pastikan kolom yang dipilih sesuai struktur panel.`
          : null
    },
    blockBSources: {
      recommendedReferenceCol: bestRefCol,
      recommendedReferenceReason: `Kolom "${bestRefCol}" dipilih melalui evaluasi multi-kriteria (kelengkapan pasangan, varians positif, ketahanan outlier, dan kecocokan instrumen pengukuran lapangan/acuan — bukan berdasarkan skor korelasi tunggal).`,
      layakColumns: columnProfiles
        .filter(p => p.detectedCategory === 'measurement_source' && p.suitabilityClass === 'layak')
        .map(p => p.columnKey),
      perluDiperiksaColumns: columnProfiles
        .filter(p => p.detectedCategory === 'measurement_source' && p.suitabilityClass === 'perlu_diperiksa')
        .map(p => p.columnKey),
      tidakDirekomendasikanColumns: columnProfiles
        .filter(p => p.suitabilityClass === 'tidak_direkomendasikan')
        .map(p => p.columnKey),
      uncertaintyColumns,
      details: columnProfiles
        .filter(p => p.columnKey !== recommendedCityId && p.columnKey !== recommendedYear)
        .map(p => ({
          columnKey: p.columnKey,
          classification:
            p.suitabilityClass === 'layak'
              ? 'Layak Digunakan'
              : p.suitabilityClass === 'perlu_diperiksa'
                ? 'Perlu Diperiksa'
                : 'Tidak Direkomendasikan',
          status: p.statusBadge,
          reason: p.statisticalReason
        }))
    },
    blockCUnits: {
      inferredUnitsByCol: Object.fromEntries(
        validMeasurementCols.map(c => [c, inferUnitFromHeader(c)])
      ),
      scaleRatioMaxToMin,
      hasScaleDiscrepancy: scaleRatioMaxToMin > 10,
      recommendationPoints: [
        `Rasio median terbesar terhadap terkecil antarsumber = ${scaleRatioMaxToMin.toFixed(2)}×.`,
        scaleRatioMaxToMin > 10
          ? 'PERINGATAN SKALA: Rasio > 10× mengindikasikan kemungkinan perbedaan satuan (mis. ton vs kiloton CO₂). Periksa satuan pada kartu sumber dan aktifkan pengali konversi eksplisit jika satuan asli telah dipastikan.'
          : 'Skala pengukuran seluruh sumber berada pada orde magnitudo yang konsisten (rasio median <= 10×).',
        'Sistem tidak melakukan konversi satuan otomatis secara buta apabila satuan fisik asli belum dikonfirmasi pengguna.'
      ]
    },
    blockDModelStructure: {
      validSourceCount: validMeasurementCols.length,
      completeCasePairs,
      supportsReferenceBasedModel: validMeasurementCols.length >= 2 && completeCasePairs >= 2,
      supportsLatentModel: validMeasurementCols.length >= 3 && completeCasePairs >= 6,
      latentIdentificationNote:
        validMeasurementCols.length >= 3
          ? `Tersedia J = ${validMeasurementCols.length} (>= 3) sumber pengukuran, sehingga model perbandingan berbasis referensi maupun model faktor laten hierarkis teridentifikasi penuh.`
          : `Tersedia J = ${validMeasurementCols.length} sumber pengukuran: cukup untuk Reference-Based Accuracy & Pair FE, tetapi model pengukuran laten tanpa referensi memerlukan pembatasan loading/varians ketat jika J < 3.`,
      errorDependencyWarnings,
      missingnessNote:
        totalMissing === 0
          ? `Tidak terdapat missing value (Complete-Case = ${completeCasePairs} pasangan Kota-Tahun).`
          : `Terdapat ${totalMissing} sel kosong; evaluasi utama wajib menggunakan ${completeCasePairs} pasangan Complete-Case dan membandingkannya dengan Available-Case.`,
      loadingConstraintNote:
        'Pada evaluasi Reference-Based, sumber referensi (r) ditetapkan sebagai patokan selisih (loading = 1, intercept acuan = 0); pada model laten pendamping, skala laten dianker pada sumber referensi dengan faktor loading λ_r = 1.',
      bayesianFeasibilityNote:
        completeCasePairs >= 10
          ? `Ukuran sampel berpasangan (N = ${completeCasePairs}) memadai untuk inferensi Pair Fixed Effects + Wild Cluster Bootstrap maupun estimasi MCMC Bayesian/Stan pendamping.`
          : `Ukuran sampel berpasangan relatif kecil (N = ${completeCasePairs}); gunakan Wild Cluster Bootstrap dan prior informatif lemah bila menjalankan model Bayesian pendamping.`,
      summaryPoints: [
        `Jumlah sumber valid: J = ${validMeasurementCols.length} sumber (${ Math.max(0, validMeasurementCols.length - 1)} sumber pembanding terhadap 1 sumber referensi).`,
        `Pasangan Kota-Tahun lengkap (Complete-Case): N = ${completeCasePairs} observasi panel.`,
        errorDependencyWarnings.length > 0
          ? errorDependencyWarnings[0]
          : 'Tidak terdeteksi duplikasi metodologi ekstrem antarsumber.'
      ]
    },
    blockEPreprocessing: {
      duplicatePairCount,
      totalOutliers,
      hasNegativeValues: hasNegatives,
      recommendedPreprocessing: recommendedPreproc,
      recommendationPoints: [
        duplicatePairCount > 0
          ? `Wajib menghapus atau mengagregasi ${duplicatePairCount} baris duplikat kunci (City, Year) agar xtset valid.`
          : 'Kunci panel (City, Year) sudah unik (0 duplikat).',
        totalOutliers > 0
          ? `Terdeteksi ${totalOutliers} nilai pencilan (1.5×IQR); disarankan membandingkan sampel asli dengan Winsorization 2.5% serta memeriksa tabel Trimmed MAE di Step 7.`
          : 'Tidak ditemukan outlier ekstrem 1.5×IQR; pertahankan data asli tanpa pemangkasan.',
        'Pertahankan skala satuan fisik asli sebagai spesifikasi utama agar MAE, RMSE, dan MBE tetap bermakna fisik (mis. kt CO₂); gunakan transformasi log(1 + x) hanya sebagai uji sensitivitas bila kecondongan (skewness) sangat tinggi.'
      ]
    },
    recommendedMapping: {
      cityIdColumn: recommendedCityId,
      yearColumn: recommendedYear,
      sources: recommendedSources
    },
    minimumRequirements: {
      canProceed: blockingReasons.length === 0,
      blockingReasons,
      warnings
    }
  };
}
