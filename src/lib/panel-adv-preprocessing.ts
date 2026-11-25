// ============================================================
// OPTION 3 — PHASE 3: Automatic Preprocessing & Transformation Engine
// Evaluates 13 panel data characteristics & 10 transformation candidates
// Strictly protects the measurement estimand (Raymaekers & Rousseeuw, 2021)
// ============================================================

import {
  AdvCleanedObservation,
  AdvDataProfileReport,
  AdvPreprocessingBundle,
  AdvSourceProfileItem,
  AdvTransformationCandidateEval,
  AdvTransformationMethod,
  MeasurementSource,
  PanelDataset
} from './panel-adv-types';

function numOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).trim().replace(/,/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-' || cleaned.toLowerCase() === 'na' || cleaned.toLowerCase() === 'null') {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function advMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

export function advQuantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const pos = (sortedValues.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (pos - lo) * (sortedValues[hi] - sortedValues[lo]);
}

export function advMeanSd(values: number[]): { mean: number; sd: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, sd: 0 };
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(Math.max(0, v)) };
}

export function advSkewKurt(values: number[]): { skewness: number; excessKurtosis: number } {
  const n = values.length;
  if (n < 4) return { skewness: 0, excessKurtosis: 0 };
  const { mean, sd } = advMeanSd(values);
  if (sd <= 1e-12) return { skewness: 0, excessKurtosis: 0 };
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const z = (values[i] - mean) / sd;
    m3 += z ** 3;
    m4 += z ** 4;
  }
  return {
    skewness: m3 / n,
    excessKurtosis: m4 / n - 3
  };
}

function boxCoxSingle(x: number, lambda: number): number {
  const safeX = Math.max(1e-9, x);
  if (Math.abs(lambda) < 1e-6) return Math.log(safeX);
  return (Math.pow(safeX, lambda) - 1) / lambda;
}

function yeoJohnsonSingle(x: number, lambda: number): number {
  if (x >= 0) {
    if (Math.abs(lambda) < 1e-6) return Math.log(x + 1);
    return (Math.pow(x + 1, lambda) - 1) / lambda;
  }
  if (Math.abs(lambda - 2) < 1e-6) return -Math.log(-x + 1);
  return -(Math.pow(-x + 1, 2 - lambda) - 1) / (2 - lambda);
}

/**
 * Raymaekers & Rousseeuw (2021) inspired central normality score:
 * Evaluates skewness & kurtosis on the central 90% trimmed standardized distribution
 * so extreme outliers cannot distort power parameter selection.
 */
function centralNormalityPenalty(values: number[]): number {
  if (values.length < 6) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const loIdx = Math.floor(sorted.length * 0.05);
  const hiIdx = Math.max(loIdx + 4, Math.ceil(sorted.length * 0.95));
  const central = sorted.slice(loIdx, hiIdx);
  const { skewness, excessKurtosis } = advSkewKurt(central);
  return Math.abs(skewness) + 0.35 * Math.abs(excessKurtosis);
}

function selectOptimalPowerLambda(
  values: number[],
  family: 'box_cox' | 'yeo_johnson'
): number {
  const grid = [-0.5, 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  let bestLambda = 1.0;
  let bestPen = Infinity;
  for (const lam of grid) {
    const transformed = values.map(v =>
      family === 'box_cox' ? boxCoxSingle(v, lam) : yeoJohnsonSingle(v, lam)
    );
    const pen = centralNormalityPenalty(transformed);
    if (pen < bestPen) {
      bestPen = pen;
      bestLambda = lam;
    }
  }
  return bestLambda;
}

function computeProportionalErrorAbsT(
  rows: Array<Record<string, number | null>>,
  sources: MeasurementSource[]
): number {
  if (sources.length < 2 || rows.length < 5) return 0;
  let maxAbsT = 0;
  for (let a = 0; a < sources.length; a++) {
    for (let b = a + 1; b < sources.length; b++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of rows) {
        const va = r[sources[a].id];
        const vb = r[sources[b].id];
        if (va !== null && vb !== null && Number.isFinite(va) && Number.isFinite(vb)) {
          xs.push(0.5 * (va + vb));
          ys.push(Math.abs(va - vb));
        }
      }
      if (xs.length >= 6) {
        const { mean: mx, sd: sx } = advMeanSd(xs);
        const { mean: my, sd: sy } = advMeanSd(ys);
        if (sx > 1e-12 && sy > 1e-12) {
          let cov = 0;
          for (let i = 0; i < xs.length; i++) cov += (xs[i] - mx) * (ys[i] - my);
          const corr = Math.max(-0.999, Math.min(0.999, cov / ((xs.length - 1) * sx * sy)));
          const tStat = Math.abs(corr * Math.sqrt(xs.length - 2)) / Math.sqrt(Math.max(1e-9, 1 - corr * corr));
          if (tStat > maxAbsT) maxAbsT = tStat;
        }
      }
    }
  }
  return maxAbsT;
}

function applySeriesTransform(
  rawSeriesBySource: Record<string, Array<number | null>>,
  sources: MeasurementSource[],
  method: AdvTransformationMethod,
  bcLambda: number,
  yjLambda: number
): Record<string, Array<number | null>> {
  const out: Record<string, Array<number | null>> = {};
  sources.forEach(src => {
    const arr = rawSeriesBySource[src.id] || [];
    const valid = arr.filter((v): v is number => v !== null && Number.isFinite(v));
    const sorted = [...valid].sort((a, b) => a - b);
    const { mean, sd } = advMeanSd(valid);
    const med = advMedian(valid);
    const q25 = advQuantile(sorted, 0.25);
    const q75 = advQuantile(sorted, 0.75);
    const iqr = Math.max(1e-9, q75 - q25);
    const wLo = advQuantile(sorted, 0.025);
    const wHi = advQuantile(sorted, 0.975);

    out[src.id] = arr.map(v => {
      if (v === null || !Number.isFinite(v)) return null;
      switch (method) {
        case 'none':
        case 'robust_student_t':
          return v;
        case 'log':
          return v > 0 ? Math.log(v) : null;
        case 'log1p':
          return v >= 0 ? Math.log1p(v) : null;
        case 'sqrt':
          return v >= 0 ? Math.sqrt(v) : null;
        case 'box_cox':
          return v > 0 ? boxCoxSingle(v, bcLambda) : null;
        case 'yeo_johnson':
          return yeoJohnsonSingle(v, yjLambda);
        case 'z_standardize':
          return sd > 1e-12 ? (v - mean) / sd : v - mean;
        case 'robust_median_iqr':
          return (v - med) / iqr;
        case 'winsorize_2_5':
          return Math.max(wLo, Math.min(wHi, v));
      }
    });
  });
  return out;
}

export function profileAndPreprocessOption3Dataset(params: {
  dataset: PanelDataset;
  forcedTransformation?: AdvTransformationMethod;
  dropDuplicatePairs?: boolean;
}): AdvPreprocessingBundle {
  const { dataset, forcedTransformation, dropDuplicatePairs = true } = params;
  const { cityIdColumn, yearColumn, sources, observations } = dataset;

  const seenPairs = new Set<string>();
  const duplicatePairKeys: string[] = [];
  let invalidValueCount = 0;
  let totalMissingCells = 0;

  const parsedRows: Array<{
    rowIndex: number;
    entity: string;
    time: number;
    pairKey: string;
    rawValues: Record<string, number | null>;
  }> = [];

  observations.forEach((row, idx) => {
    const rawEnt = row[cityIdColumn];
    const ent = rawEnt !== undefined && rawEnt !== null ? String(rawEnt).trim() : '';
    const yr = numOrNull(row[yearColumn]);
    if (!ent || yr === null) {
      invalidValueCount++;
      return;
    }
    const timeInt = Math.round(yr);
    const pairKey = `${ent}::${timeInt}`;
    if (seenPairs.has(pairKey)) {
      duplicatePairKeys.push(pairKey);
      if (dropDuplicatePairs) return;
    }
    seenPairs.add(pairKey);

    const rawValues: Record<string, number | null> = {};
    sources.forEach(s => {
      const cell = row[s.columnKey];
      if (cell === null || cell === undefined || String(cell).trim() === '') {
        totalMissingCells++;
        rawValues[s.id] = null;
      } else {
        const nv = numOrNull(cell);
        if (nv === null) {
          invalidValueCount++;
          totalMissingCells++;
        }
        rawValues[s.id] = nv;
      }
    });

    parsedRows.push({
      rowIndex: idx,
      entity: ent,
      time: timeInt,
      pairKey,
      rawValues
    });
  });

  const entities = Array.from(new Set(parsedRows.map(r => r.entity))).sort();
  const periods = Array.from(new Set(parsedRows.map(r => r.time))).sort((a, b) => a - b);
  const entityMap = new Map(entities.map((e, i) => [e, i]));
  const periodMap = new Map(periods.map((t, i) => [t, i]));

  // Source-level profiles & Panel-Aware MAD/IQR Outlier Audit
  const sourceProfiles: AdvSourceProfileItem[] = [];
  let hasAnyZeros = false;
  let hasAnyNegatives = false;
  let totalPanelMadOutliers = 0;

  sources.forEach(src => {
    const valid = parsedRows
      .map(r => r.rawValues[src.id])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const sorted = [...valid].sort((a, b) => a - b);
    const { mean, sd } = advMeanSd(valid);
    const median = advMedian(valid);
    const absDevs = valid.map(v => Math.abs(v - median));
    const mad = Math.max(1e-9, 1.4826 * advMedian(absDevs));
    const q1 = advQuantile(sorted, 0.25);
    const q3 = advQuantile(sorted, 0.75);
    const iqr = q3 - q1;
    const { skewness, excessKurtosis } = advSkewKurt(valid);
    const zeros = valid.some(v => v === 0);
    const negs = valid.some(v => v < 0);
    if (zeros) hasAnyZeros = true;
    if (negs) hasAnyNegatives = true;

    // Panel-aware within-entity demeaned MAD outlier count
    const byEnt = new Map<string, number[]>();
    parsedRows.forEach(r => {
      const v = r.rawValues[src.id];
      if (v !== null) {
        if (!byEnt.has(r.entity)) byEnt.set(r.entity, []);
        byEnt.get(r.entity)!.push(v);
      }
    });
    const withinRes: number[] = [];
    let withinIqrCount = 0;
    byEnt.forEach(arr => {
      const em = advMedian(arr);
      const sArr = [...arr].sort((a, b) => a - b);
      const eIqr = Math.max(1e-6, advQuantile(sArr, 0.75) - advQuantile(sArr, 0.25));
      arr.forEach(v => {
        const diff = v - em;
        withinRes.push(diff);
        if (arr.length >= 4 && Math.abs(diff) > 3.0 * eIqr) withinIqrCount++;
      });
    });
    const withinMad = Math.max(1e-9, 1.4826 * advMedian(withinRes.map(Math.abs)));
    const panelMadCount = withinRes.filter(d => Math.abs(d) / withinMad > 3.5).length;
    totalPanelMadOutliers += panelMadCount;

    sourceProfiles.push({
      sourceId: src.id,
      sourceName: src.name,
      sourceLabel: src.label,
      unit: src.unit || '-',
      nValid: valid.length,
      nMissing: Math.max(0, parsedRows.length - valid.length),
      missingPct: parsedRows.length > 0 ? ((parsedRows.length - valid.length) / parsedRows.length) * 100 : 0,
      hasZeros: zeros,
      hasNegatives: negs,
      mean,
      sd,
      median,
      mad,
      iqr,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      skewness,
      excessKurtosis,
      panelMadOutlierCount: panelMadCount,
      withinEntityIqrOutlierCount: withinIqrCount
    });
  });

  const positiveSds = sourceProfiles.map(p => p.sd).filter(v => v > 1e-12);
  const scaleSpreadRatioRaw =
    positiveSds.length >= 2 ? Math.max(...positiveSds) / Math.min(...positiveSds) : 1;

  const rawRowsList = parsedRows.map(r => r.rawValues);
  const crossScaleHeteroscedasticityAbsT = computeProportionalErrorAbsT(rawRowsList, sources);

  // Common power parameter across sources to maintain cross-source commensurability!
  const pooledAllValid = parsedRows.flatMap(r =>
    sources.map(s => r.rawValues[s.id]).filter((v): v is number => v !== null && Number.isFinite(v))
  );
  const sharedBcLambda =
    !hasAnyZeros && !hasAnyNegatives && pooledAllValid.length >= 8
      ? selectOptimalPowerLambda(pooledAllValid, 'box_cox')
      : 1;
  const sharedYjLambda =
    pooledAllValid.length >= 8 ? selectOptimalPowerLambda(pooledAllValid, 'yeo_johnson') : 1;

  const boxCoxLambdaBySource: Record<string, number> = {};
  const yeoJohnsonLambdaBySource: Record<string, number> = {};
  sources.forEach(s => {
    boxCoxLambdaBySource[s.id] = sharedBcLambda;
    yeoJohnsonLambdaBySource[s.id] = sharedYjLambda;
  });

  const rawSeriesBySource: Record<string, Array<number | null>> = {};
  sources.forEach(s => {
    rawSeriesBySource[s.id] = parsedRows.map(r => r.rawValues[s.id]);
  });

  const candidateDefinitions: Array<{
    method: AdvTransformationMethod;
    label: string;
    strictPositive: boolean;
    nonNegative: boolean;
    preservation: AdvTransformationCandidateEval['estimandPreservation'];
    impact: string;
  }> = [
    {
      method: 'none',
      label: 'No Transformation (Raw Physical Scale)',
      strictPositive: false,
      nonNegative: false,
      preservation: 'EXACT_ORIGINAL_UNIT',
      impact: 'Mempertahankan makna unit pengukuran asli α_j dan σ_j secara eksak.'
    },
    {
      method: 'robust_student_t',
      label: 'Robust Student-t Likelihood Without Transformation',
      strictPositive: false,
      nonNegative: false,
      preservation: 'EXACT_ORIGINAL_UNIT',
      impact: 'Menjaga unit asli tanpa mengubah nilai data; meredam pengaruh ekor tebal/outlier secara probabilistik.'
    },
    {
      method: 'winsorize_2_5',
      label: 'Symmetric 2.5% Tail Winsorization',
      strictPositive: false,
      nonNegative: false,
      preservation: 'EXACT_ORIGINAL_UNIT',
      impact: 'Memangkas 2.5% ekor ekstrem pada skala asli; perlu kehati-hatian bila lonjakan ekstrem merupakan sinyal fisik nyata.'
    },
    {
      method: 'log',
      label: 'Natural Logarithm ln(Y)',
      strictPositive: true,
      nonNegative: true,
      preservation: 'NONLINEAR_MONOTONIC',
      impact: 'Mengubah model galat aditif menjadi galat multiplikatif/persentase pada domain Y > 0.'
    },
    {
      method: 'log1p',
      label: 'Shifted Logarithm ln(1 + Y)',
      strictPositive: false,
      nonNegative: true,
      preservation: 'NONLINEAR_MONOTONIC',
      impact: 'Menstabilkan galat proporsional saat terdapat nilai nol (Y >= 0); estimand berpindah ke skala log-relatif.'
    },
    {
      method: 'sqrt',
      label: 'Square-Root Transformation √Y',
      strictPositive: false,
      nonNegative: true,
      preservation: 'NONLINEAR_MONOTONIC',
      impact: 'Stabilisasi varians moderat untuk data cacah/non-negatif dengan heteroskedastisitas sedang.'
    },
    {
      method: 'box_cox',
      label: `Common Box-Cox (λ = ${sharedBcLambda.toFixed(2)})`,
      strictPositive: true,
      nonNegative: true,
      preservation: 'NONLINEAR_MONOTONIC',
      impact: 'Transformasi pangkat bersama (Raymaekers & Rousseeuw, 2021); mengubah interpretasi satuan fisik langsung.'
    },
    {
      method: 'yeo_johnson',
      label: `Common Yeo-Johnson (λ = ${sharedYjLambda.toFixed(2)})`,
      strictPositive: false,
      nonNegative: false,
      preservation: 'NONLINEAR_MONOTONIC',
      impact: 'Mendukung nilai nol dan negatif sekaligus meredam asimetri ekstrem, namun menggeser satuan laten.'
    },
    {
      method: 'z_standardize',
      label: 'Z-Score Standardization (Mean 0, SD 1)',
      strictPositive: false,
      nonNegative: false,
      preservation: 'DIMENSIONLESS_STANDARDIZED',
      impact: 'Menyetarakan sumber dengan satuan berbeda (mis. ton vs ppm vs indeks), namun menghilangkan informasi bias lokasi α_j.'
    },
    {
      method: 'robust_median_iqr',
      label: 'Robust Median / IQR Scaling',
      strictPositive: false,
      nonNegative: false,
      preservation: 'DIMENSIONLESS_STANDARDIZED',
      impact: 'Menyetarakan skala tak sepadan secara tahan-outlier, namun menyerap pergeseran median per sumber.'
    }
  ];

  // Automatic estimand-first selection logic:
  // 1. If incommensurable units / massive scale spread (> 25x), standardization is required unless proportional positive scale holds.
  // 2. Do NOT transform solely for skewness! Require strong proportional measurement error (|t| > 3.0) AND substantial reduction in proportional error.
  // 3. If outliers exist on commensurate additive scale without strong proportional error, prefer robust_student_t over distorting raw data.
  // 4. Otherwise choose 'none'!
  const prelimEvals: Omit<AdvTransformationCandidateEval, 'selected' | 'decisionReason'>[] =
    candidateDefinitions.map(def => {
      if (def.strictPositive && (hasAnyZeros || hasAnyNegatives)) {
        return {
          method: def.method,
          label: def.label,
          eligible: false,
          ineligibleReason: 'Ditolak karena dataset memuat nilai <= 0.',
          centralNormalityScore: 99,
          proportionalHeteroscedasticityAbsT: crossScaleHeteroscedasticityAbsT,
          scaleSpreadRatioAfter: scaleSpreadRatioRaw,
          estimandPreservation: def.preservation,
          estimandImpactNote: def.impact
        };
      }
      if (def.nonNegative && hasAnyNegatives) {
        return {
          method: def.method,
          label: def.label,
          eligible: false,
          ineligibleReason: 'Ditolak karena dataset memuat nilai negatif.',
          centralNormalityScore: 99,
          proportionalHeteroscedasticityAbsT: crossScaleHeteroscedasticityAbsT,
          scaleSpreadRatioAfter: scaleSpreadRatioRaw,
          estimandPreservation: def.preservation,
          estimandImpactNote: def.impact
        };
      }

      const trMap = applySeriesTransform(
        rawSeriesBySource,
        sources,
        def.method,
        sharedBcLambda,
        sharedYjLambda
      );
      const trRows = parsedRows.map((_, rowIdx) => {
        const rec: Record<string, number | null> = {};
        sources.forEach(s => {
          rec[s.id] = trMap[s.id][rowIdx];
        });
        return rec;
      });
      const propT = computeProportionalErrorAbsT(trRows, sources);
      const sdsAfter = sources
        .map(s => {
          const vals = trMap[s.id].filter((v): v is number => v !== null && Number.isFinite(v));
          return advMeanSd(vals).sd;
        })
        .filter(v => v > 1e-12);
      const spreadAfter =
        sdsAfter.length >= 2 ? Math.max(...sdsAfter) / Math.min(...sdsAfter) : 1;
      const avgPen =
        sources.reduce((acc, s) => {
          const vals = trMap[s.id].filter((v): v is number => v !== null && Number.isFinite(v));
          return acc + centralNormalityPenalty(vals);
        }, 0) / Math.max(1, sources.length);

      return {
        method: def.method,
        label: def.label,
        eligible: true,
        centralNormalityScore: Number(avgPen.toFixed(3)),
        proportionalHeteroscedasticityAbsT: Number(propT.toFixed(3)),
        scaleSpreadRatioAfter: Number(spreadAfter.toFixed(3)),
        estimandPreservation: def.preservation,
        estimandImpactNote: def.impact
      };
    });

  const distinctUnits = new Set(sources.map(s => (s.unit || '').trim().toLowerCase()).filter(Boolean));
  const hasIncommensurableScale = scaleSpreadRatioRaw > 25 || distinctUnits.size > 1;
  const outlierRate =
    parsedRows.length > 0
      ? totalPanelMadOutliers / Math.max(1, parsedRows.length * sources.length)
      : 0;

  let autoSelectedMethod: AdvTransformationMethod = 'none';
  if (hasIncommensurableScale) {
    autoSelectedMethod = outlierRate > 0.04 ? 'robust_median_iqr' : 'z_standardize';
  } else if (crossScaleHeteroscedasticityAbsT > 3.2) {
    const logCand = prelimEvals.find(c => c.method === 'log' && c.eligible);
    const log1pCand = prelimEvals.find(c => c.method === 'log1p' && c.eligible);
    const yjCand = prelimEvals.find(c => c.method === 'yeo_johnson' && c.eligible);
    if (logCand && logCand.proportionalHeteroscedasticityAbsT < crossScaleHeteroscedasticityAbsT * 0.65) {
      autoSelectedMethod = 'log';
    } else if (log1pCand && log1pCand.proportionalHeteroscedasticityAbsT < crossScaleHeteroscedasticityAbsT * 0.65) {
      autoSelectedMethod = 'log1p';
    } else if (hasAnyNegatives && yjCand && yjCand.proportionalHeteroscedasticityAbsT < crossScaleHeteroscedasticityAbsT * 0.65) {
      autoSelectedMethod = 'yeo_johnson';
    } else if (outlierRate > 0.04) {
      autoSelectedMethod = 'robust_student_t';
    }
  } else if (outlierRate > 0.05) {
    autoSelectedMethod = 'robust_student_t';
  }

  const chosenTransformation =
    forcedTransformation && prelimEvals.find(e => e.method === forcedTransformation)?.eligible
      ? forcedTransformation
      : autoSelectedMethod;

  const transformationEvaluations: AdvTransformationCandidateEval[] = prelimEvals.map(ev => {
    const isChosen = ev.method === chosenTransformation;
    let reason = ev.ineligibleReason || '';
    if (ev.eligible) {
      if (isChosen) {
        if (ev.method === 'none') {
          reason =
            'Dipilih karena skala antarsumber sepadan dan tidak ada heteroskedastisitas proporsional ekstrem; mempertahankan estimand satuan asli.';
        } else if (ev.method === 'robust_student_t') {
          reason =
            'Dipilih karena terdeteksi outlier panel tanpa distorsi skala multiplikatif; menjaga satuan asli sekaligus meredam observasi ekstrem.';
        } else if (ev.method === 'z_standardize' || ev.method === 'robust_median_iqr') {
          reason = `Dipilih karena rasio sebaran skala mentah sangat timpang (${scaleSpreadRatioRaw.toFixed(1)}x) atau satuan berbeda antarsumber.`;
        } else {
          reason = `Dipilih karena kesalahan proporsional lintas level signifikan (|t| = ${crossScaleHeteroscedasticityAbsT.toFixed(2)} -> ${ev.proportionalHeteroscedasticityAbsT.toFixed(2)}).`;
        }
      } else if (ev.estimandPreservation === 'NONLINEAR_MONOTONIC') {
        reason =
          'Tidak dipilih demi mencegah perubahan makna estimand laten ketika skala aditif asli sudah memadai.';
      } else if (ev.estimandPreservation === 'DIMENSIONLESS_STANDARDIZED') {
        reason =
          'Tidak dipilih karena penyetaraan paksa z-score/IQR menghapus informasi bias aditif α_j pada sumber yang satuannya sudah sepadan.';
      } else {
        reason = 'Alternatif layak namun kalah parsimoni/ketahanan dibanding metode terpilih.';
      }
    }
    return {
      ...ev,
      selected: isChosen,
      decisionReason: reason
    };
  });

  const finalTransformedMap = applySeriesTransform(
    rawSeriesBySource,
    sources,
    chosenTransformation,
    sharedBcLambda,
    sharedYjLambda
  );

  // Compute Student-t(df=5) IRLS observation weights if robust_student_t is active
  const rowResidualsSq = parsedRows.map((_, rowIdx) => {
    const vals = sources
      .map(s => finalTransformedMap[s.id][rowIdx])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length < 2) return 0;
    const med = advMedian(vals);
    return vals.reduce((acc, v) => acc + (v - med) ** 2, 0) / vals.length;
  });
  const medRowSq = Math.max(1e-9, advMedian(rowResidualsSq.filter(v => v > 0)));

  const allValidObservations: AdvCleanedObservation[] = [];
  const completeObservations: AdvCleanedObservation[] = [];

  parsedRows.forEach((r, rowIdx) => {
    const transformedValues: Record<string, number | null> = {};
    let nNonNull = 0;
    sources.forEach(s => {
      const tv = finalTransformedMap[s.id][rowIdx];
      transformedValues[s.id] = tv;
      if (tv !== null && Number.isFinite(tv)) nNonNull++;
    });
    if (nNonNull === 0) return;

    const nu = 5;
    const stdSq = rowResidualsSq[rowIdx] / medRowSq;
    const robustWeight =
      chosenTransformation === 'robust_student_t' ? (nu + 1) / (nu + Math.min(25, stdSq)) : 1.0;

    const obs: AdvCleanedObservation = {
      rowIndex: r.rowIndex,
      entity: r.entity,
      entityIdx: entityMap.get(r.entity) ?? 0,
      time: r.time,
      timeIdx: periodMap.get(r.time) ?? 0,
      pairKey: r.pairKey,
      rawValues: r.rawValues,
      transformedValues,
      robustWeight
    };
    allValidObservations.push(obs);
    if (nNonNull === sources.length) {
      completeObservations.push(obs);
    }
  });

  const expectedGridSize = Math.max(1, entities.length * periods.length);
  const isBalancedPanel =
    completeObservations.length === expectedGridSize && duplicatePairKeys.length === 0;
  const entitiesInComplete = new Set(completeObservations.map(o => o.entity)).size;
  const periodsInComplete = new Set(completeObservations.map(o => o.time)).size;

  const baseUnit = sources[0]?.unit || 'satuan asli';
  const workingScaleLabel =
    chosenTransformation === 'none' || chosenTransformation === 'robust_student_t' || chosenTransformation === 'winsorize_2_5'
      ? baseUnit
      : `${chosenTransformation}(${baseUnit})`;

  const warnings: string[] = [];
  if (sources.length < 3) {
    warnings.push(
      `Jumlah sumber saat ini J = ${sources.length} (< 3): model faktor pengukuran laten tanpa referensi bersifat underidentified secara aljabar.`
    );
  }
  if (completeObservations.length < 6) {
    warnings.push(
      `Pasangan complete-case sangat terbatas (N = ${completeObservations.length}); ketidakpastian posterior tinggi.`
    );
  }
  if (duplicatePairKeys.length > 0) {
    warnings.push(
      `Ditemukan ${duplicatePairKeys.length} baris duplikat (Entity, Time)${dropDuplicatePairs ? ' — entri pertama dipertahankan secara deterministik.' : ' — duplikat masih aktif.'}`
    );
  }
  if (hasIncommensurableScale) {
    warnings.push(
      `Rasio simpangan baku antarsumber tinggi (${scaleSpreadRatioRaw.toFixed(2)}x) atau unit berbeda: perhatikan interpretasi bias lokasi pada skala terstandardisasi.`
    );
  }
  if (totalMissingCells > 0) {
    warnings.push(
      `Terdapat ${totalMissingCells} sel kosong. Mekanisme MCAR/MAR/MNAR tidak dapat dibuktikan mutlak hanya dari data terobservasi.`
    );
  }

  const hasBlockingError = sources.length < 2 || completeObservations.length < 3;

  const profile: AdvDataProfileReport = {
    entityColumn: cityIdColumn,
    timeColumn: yearColumn,
    nRowsRaw: observations.length,
    nCompletePairs: completeObservations.length,
    nAvailableRows: allValidObservations.length,
    nEntities: entities.length,
    nPeriods: periods.length,
    nSources: sources.length,
    isBalancedPanel,
    entityCoveragePct: entities.length > 0 ? (entitiesInComplete / entities.length) * 100 : 0,
    timeCoveragePct: periods.length > 0 ? (periodsInComplete / periods.length) * 100 : 0,
    duplicatePairKeys,
    invalidValueCount,
    totalMissingCells,
    missingnessPatternNote:
      totalMissingCells === 0
        ? 'Tidak ada nilai hilang pada kolom sumber yang dipetakan.'
        : `${totalMissingCells} sel hilang tersebar pada ${parsedRows.length - completeObservations.length} baris tidak lengkap; mekanisme MNAR tidak dapat disingkirkan secara empiris murni.`,
    scaleSpreadRatioRaw: Number(scaleSpreadRatioRaw.toFixed(4)),
    crossScaleHeteroscedasticityAbsT: Number(crossScaleHeteroscedasticityAbsT.toFixed(4)),
    hasAnyZeros,
    hasAnyNegatives,
    totalPanelMadOutliers,
    whyNotDefaultGrubbsNote:
      'Uji Grubbs klasik mengasumsikan pengamatan tunggal independen berdistribusi normal identik (i.i.d.). Pada data panel pengukuran berulang, efek tetap entitas dan tren waktu membuat uji Grubbs pooled keliru menandai entitas besar sebagai outlier; Option 3 memakai Panel Within-Entity MAD & IQR.',
    sourceProfiles,
    transformationEvaluations,
    chosenTransformation,
    boxCoxLambdaBySource,
    yeoJohnsonLambdaBySource,
    workingScaleLabel,
    warnings,
    hasBlockingError
  };

  return {
    profile,
    completeObservations,
    allValidObservations,
    entities,
    periods,
    sources
  };
}
