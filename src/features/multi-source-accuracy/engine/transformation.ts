
import {
  MsmaConstructClassificationResult,
  MsmaPanelStructureResult,
  MsmaRawSheet,
  MsmaSourceConfig,
  MsmaTransformationBundle,
  MsmaTransformationId,
  MsmaTransformationRecommendation
} from '../types';
import {
  covarianceMatrixFromColumns,
  mad,
  mean,
  median,
  parseSafeNumber,
  quantileSorted,
  sampleSd,
  sanitizeCellText,
  simpleLinearRegression,
  skewnessAndExcessKurtosis,
  toStataVarName
} from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';

export function extractAlignedBaseObservations(
  sheet: MsmaRawSheet,
  entityColumn: string,
  timeColumn: string,
  sources: MsmaSourceConfig[],
  options: {
    dropDuplicates: boolean;
    missingHandling: 'COMPLETE_CASE' | 'WITHIN_ENTITY_INTERPOLATE';
    outlierHandling: 'KEEP_ALL' | 'WINSORIZE_2_5' | 'TRIM_EXTREME_3_5_MAD';
  }
): AlignedPanelObservation[] {
  const seenKeys = new Set<string>();
  const rawList: AlignedPanelObservation[] = [];

  sheet.rows.forEach((r, idx) => {
    const ent = sanitizeCellText(r[entityColumn]);
    if (!ent) return;
    let period = parseSafeNumber(r[timeColumn]);
    if (period === null) {
      const m = String(r[timeColumn] ?? '').match(/(19|20)\d{2}/);
      if (m) period = Number(m[0]);
    }
    if (period === null) return;

    const pairKey = `${ent}|||${period}`;
    if (options.dropDuplicates && seenKeys.has(pairKey)) {
      return;
    }
    seenKeys.add(pairKey);

    const valuesBySource: Record<string, number | null> = {};
    for (const src of sources) {
      const rawNum = parseSafeNumber(r[src.columnKey]);
      if (rawNum === null) {
        valuesBySource[src.id] = null;
      } else {
        let scaled = rawNum * (Number.isFinite(src.unitScaleMultiplier) && src.unitScaleMultiplier !== 0 ? src.unitScaleMultiplier : 1);
        if (src.conversionModelEnabled) {
          scaled = src.conversionIntercept + src.conversionSlope * scaled;
        }
        valuesBySource[src.id] = scaled;
      }
    }

    rawList.push({
      rowIndex: idx,
      entity: ent,
      period,
      valuesBySource
    });
  });

  rawList.sort((a, b) => (a.entity === b.entity ? a.period - b.period : a.entity.localeCompare(b.entity)));

  // Optional linear interpolation within entity for isolated interior gaps
  if (options.missingHandling === 'WITHIN_ENTITY_INTERPOLATE') {
    const byEnt = new Map<string, AlignedPanelObservation[]>();
    for (const obs of rawList) {
      const list = byEnt.get(obs.entity) ?? [];
      list.push(obs);
      byEnt.set(obs.entity, list);
    }
    byEnt.forEach(list => {
      for (const src of sources) {
        for (let t = 1; t < list.length - 1; t++) {
          if (list[t].valuesBySource[src.id] === null) {
            const prev = list[t - 1].valuesBySource[src.id];
            const next = list[t + 1].valuesBySource[src.id];
            if (prev !== null && next !== null) {
              list[t].valuesBySource[src.id] = 0.5 * (prev + next);
            }
          }
        }
      }
    });
  }

  // Optional outlier sensitivity handling (immutable copy)
  if (options.outlierHandling !== 'KEEP_ALL') {
    for (const src of sources) {
      const vals = rawList
        .map(o => o.valuesBySource[src.id])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      if (vals.length < 8) continue;

      if (options.outlierHandling === 'WINSORIZE_2_5') {
        const sorted = [...vals].sort((a, b) => a - b);
        const lo = quantileSorted(sorted, 0.025);
        const hi = quantileSorted(sorted, 0.975);
        for (const o of rawList) {
          const v = o.valuesBySource[src.id];
          if (v !== null) {
            o.valuesBySource[src.id] = Math.min(hi, Math.max(lo, v));
          }
        }
      } else if (options.outlierHandling === 'TRIM_EXTREME_3_5_MAD') {
        const med = median(vals);
        const mScale = mad(vals);
        if (mScale > 1e-12) {
          for (const o of rawList) {
            const v = o.valuesBySource[src.id];
            if (v !== null && Math.abs(v - med) / mScale > 3.5) {
              o.valuesBySource[src.id] = null;
            }
          }
        }
      }
    }
  }

  return rawList;
}

function boxCoxTransform(x: number, lambda = 0.25): number {
  if (Math.abs(lambda) < 1e-8) return Math.log(x);
  return (Math.pow(x, lambda) - 1) / lambda;
}

function yeoJohnsonTransform(x: number, lambda = 0.5): number {
  if (x >= 0) {
    return Math.abs(lambda) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, lambda) - 1) / lambda;
  }
  const twoMinusL = 2 - lambda;
  return Math.abs(twoMinusL) < 1e-8
    ? -Math.log(-x + 1)
    : -(Math.pow(-x + 1, twoMinusL) - 1) / twoMinusL;
}

export function applySelectedTransformation(
  baseObs: AlignedPanelObservation[],
  sources: MsmaSourceConfig[],
  transformId: MsmaTransformationId
): AlignedPanelObservation[] {
  const cloned: AlignedPanelObservation[] = baseObs.map(o => ({
    ...o,
    valuesBySource: { ...o.valuesBySource }
  }));

  if (
    transformId === 'NONE' ||
    transformId === 'MISSING_LISTWISE_COMPLETE' ||
    transformId === 'OUTLIER_WINSORIZE_SENSITIVITY' ||
    transformId === 'UNIT_CONSTRUCT_HARMONIZATION'
  ) {
    return cloned;
  }

  if (transformId === 'LOG') {
    for (const o of cloned) {
      for (const s of sources) {
        const v = o.valuesBySource[s.id];
        o.valuesBySource[s.id] = v !== null && v > 0 ? Math.log(v) : null;
      }
    }
    return cloned;
  }

  if (transformId === 'LOG1P') {
    for (const o of cloned) {
      for (const s of sources) {
        const v = o.valuesBySource[s.id];
        o.valuesBySource[s.id] = v !== null && v > -1 ? Math.log(v + 1) : null;
      }
    }
    return cloned;
  }

  if (transformId === 'SQRT') {
    for (const o of cloned) {
      for (const s of sources) {
        const v = o.valuesBySource[s.id];
        o.valuesBySource[s.id] = v !== null && v >= 0 ? Math.sqrt(v) : null;
      }
    }
    return cloned;
  }

  if (transformId === 'BOX_COX') {
    for (const o of cloned) {
      for (const s of sources) {
        const v = o.valuesBySource[s.id];
        o.valuesBySource[s.id] = v !== null && v > 0 ? boxCoxTransform(v, 0.25) : null;
      }
    }
    return cloned;
  }

  if (transformId === 'YEO_JOHNSON') {
    for (const o of cloned) {
      for (const s of sources) {
        const v = o.valuesBySource[s.id];
        o.valuesBySource[s.id] = v !== null ? yeoJohnsonTransform(v, 0.5) : null;
      }
    }
    return cloned;
  }

  if (transformId === 'STANDARDIZATION_Z') {
    for (const s of sources) {
      const vals = cloned.map(o => o.valuesBySource[s.id]).filter((v): v is number => v !== null);
      const m = mean(vals);
      const sd = Math.max(1e-12, sampleSd(vals));
      for (const o of cloned) {
        const v = o.valuesBySource[s.id];
        if (v !== null) o.valuesBySource[s.id] = (v - m) / sd;
      }
    }
    return cloned;
  }

  if (transformId === 'DEMEANING_WITHIN') {
    const byEnt = new Map<string, AlignedPanelObservation[]>();
    for (const o of cloned) {
      const list = byEnt.get(o.entity) ?? [];
      list.push(o);
      byEnt.set(o.entity, list);
    }
    for (const s of sources) {
      byEnt.forEach(list => {
        const vals = list.map(x => x.valuesBySource[s.id]).filter((v): v is number => v !== null);
        const em = mean(vals);
        for (const x of list) {
          const v = x.valuesBySource[s.id];
          if (v !== null) x.valuesBySource[s.id] = v - em;
        }
      });
    }
    return cloned;
  }

  if (transformId === 'FIRST_DIFFERENCE') {
    const byEnt = new Map<string, AlignedPanelObservation[]>();
    for (const o of cloned) {
      const list = byEnt.get(o.entity) ?? [];
      list.push(o);
      byEnt.set(o.entity, list);
    }
    byEnt.forEach(list => {
      list.sort((a, b) => a.period - b.period);
      for (let t = list.length - 1; t >= 0; t--) {
        if (t === 0) {
          for (const s of sources) list[t].valuesBySource[s.id] = null;
        } else {
          for (const s of sources) {
            const cur = list[t].valuesBySource[s.id];
            const prev = list[t - 1].valuesBySource[s.id];
            list[t].valuesBySource[s.id] = cur !== null && prev !== null ? cur - prev : null;
          }
        }
      }
    });
    return cloned;
  }

  if (transformId === 'TEMPORAL_DETRENDING') {
    for (const s of sources) {
      const pairs = cloned
        .map(o => ({ period: o.period, val: o.valuesBySource[s.id] }))
        .filter((p): p is { period: number; val: number } => p.val !== null);
      const reg = simpleLinearRegression(
        pairs.map(p => p.period),
        pairs.map(p => p.val)
      );
      const mVal = mean(pairs.map(p => p.val));
      for (const o of cloned) {
        const v = o.valuesBySource[s.id];
        if (v !== null) {
          o.valuesBySource[s.id] = v - (reg.intercept + reg.slope * o.period) + mVal;
        }
      }
    }
    return cloned;
  }

  if (transformId === 'SPATIAL_ADJUSTMENT') {
    // Center by period cross-sectional median to remove common macro shocks
    const byPeriod = new Map<number, AlignedPanelObservation[]>();
    for (const o of cloned) {
      const list = byPeriod.get(o.period) ?? [];
      list.push(o);
      byPeriod.set(o.period, list);
    }
    for (const s of sources) {
      const allVals = cloned.map(o => o.valuesBySource[s.id]).filter((v): v is number => v !== null);
      const grandMed = median(allVals);
      byPeriod.forEach(list => {
        const pVals = list.map(o => o.valuesBySource[s.id]).filter((v): v is number => v !== null);
        const pMed = median(pVals);
        for (const o of list) {
          const v = o.valuesBySource[s.id];
          if (v !== null) o.valuesBySource[s.id] = v - pMed + grandMed;
        }
      });
    }
    return cloned;
  }

  return cloned;
}

function computeMaxQuadraticDeltaR2(
  obs: AlignedPanelObservation[],
  sources: MsmaSourceConfig[]
): number {
  const complete = obs.filter(o =>
    sources.every(s => o.valuesBySource[s.id] !== null && Number.isFinite(o.valuesBySource[s.id]))
  );
  if (complete.length < 8 || sources.length < 2) return 0;

  let maxDelta = 0;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const xs = complete.map(o => o.valuesBySource[sources[i].id] as number);
      const ys = complete.map(o => o.valuesBySource[sources[j].id] as number);
      const lin = simpleLinearRegression(xs, ys);
      const mx = mean(xs);
      const resLin = xs.map((x, idx) => ys[idx] - (lin.intercept + lin.slope * x));
      const xSq = xs.map(x => (x - mx) * (x - mx));
      const quad = simpleLinearRegression(xSq, resLin);
      if (quad.r2 > maxDelta) maxDelta = quad.r2;
    }
  }
  return maxDelta;
}

function probeCandidateIdentifiability(
  obs: AlignedPanelObservation[],
  sources: MsmaSourceConfig[],
  allowsJointCollocation: boolean
): {
  identifiable: boolean;
  hasHeywood: boolean;
  topSourceName: string | null;
} {
  if (!allowsJointCollocation) {
    return { identifiable: false, hasHeywood: false, topSourceName: null };
  }
  const complete = obs.filter(o =>
    sources.every(s => o.valuesBySource[s.id] !== null && Number.isFinite(o.valuesBySource[s.id]))
  );
  const J = sources.length;
  if (J === 2) {
    if (complete.length < 6) return { identifiable: false, hasHeywood: false, topSourceName: null };
    const s1 = sampleSd(complete.map(c => c.valuesBySource[sources[0].id] as number));
    const s2 = sampleSd(complete.map(c => c.valuesBySource[sources[1].id] as number));
    return { identifiable: s1 > 1e-10 && s2 > 1e-10, hasHeywood: false, topSourceName: null };
  }
  if (complete.length < 12) {
    return { identifiable: false, hasHeywood: false, topSourceName: null };
  }

  const cols = sources.map(s => complete.map(c => c.valuesBySource[s.id] as number));
  const C = covarianceMatrixFromColumns(cols);

  if (J === 3) {
    const c11 = C[0][0];
    const c22 = C[1][1];
    const c33 = C[2][2];
    const c12 = C[0][1];
    const c13 = C[0][2];
    const c23 = C[1][2];
    if (
      Math.min(c11, c22, c33) <= 1e-12 ||
      Math.abs(c12) <= 1e-12 ||
      Math.abs(c13) <= 1e-12 ||
      Math.abs(c23) <= 1e-12
    ) {
      return { identifiable: false, hasHeywood: false, topSourceName: null };
    }
    const sigT1 = (c12 * c13) / c23;
    const sigT2 = (c12 * c23) / c13;
    const sigT3 = (c13 * c23) / c12;
    if (sigT1 <= 0 || sigT2 <= 0 || sigT3 <= 0) {
      return { identifiable: false, hasHeywood: true, topSourceName: null };
    }
    const e1 = c11 - sigT1;
    const e2 = c22 - sigT2;
    const e3 = c33 - sigT3;
    const hasHeywood = e1 < 0 || e2 < 0 || e3 < 0;
    if (hasHeywood) {
      return { identifiable: false, hasHeywood: true, topSourceName: null };
    }
    const b2 = c23 / c13;
    const b3 = c23 / c12;
    const g = Math.cbrt(Math.abs(b2 * b3));
    const cal = [e1 * g * g, (e2 * g * g) / (b2 * b2), (e3 * g * g) / (b3 * b3)];
    let bestIdx = 0;
    if (cal[1] < cal[bestIdx]) bestIdx = 1;
    if (cal[2] < cal[bestIdx]) bestIdx = 2;
    return {
      identifiable: true,
      hasHeywood: false,
      topSourceName: sources[bestIdx]?.displayName ?? null
    };
  }

  // J >= 4 probe
  const betas = Array.from({ length: J }, (_, k) => {
    if (k === 0) return 1;
    const ratios: number[] = [];
    for (let m = 1; m < J; m++) {
      if (m !== k && Math.abs(C[0][m]) > 1e-10 && C[k][m] * C[0][m] > 0) {
        ratios.push(C[k][m] / C[0][m]);
      }
    }
    return ratios.length > 0 ? median(ratios) : NaN;
  });
  if (betas.some(b => !Number.isFinite(b) || Math.abs(b) <= 1e-10)) {
    return { identifiable: false, hasHeywood: true, topSourceName: null };
  }
  const g = Math.exp(mean(betas.map(b => Math.log(Math.abs(b)))));
  const bSym = betas.map(b => b / g);
  const Cz = Array.from({ length: J }, (_, i) =>
    Array.from({ length: J }, (__, j) => C[i][j] / (bSym[i] * bSym[j]))
  );
  const errMedians: number[] = [];
  let hasHeywood = false;
  for (let k = 0; k < J; k++) {
    const ests: number[] = [];
    for (let a = 0; a < J; a++) {
      if (a === k) continue;
      for (let b = a + 1; b < J; b++) {
        if (b === k || Cz[a][b] <= 1e-10) continue;
        ests.push(Cz[k][k] - (Cz[k][a] * Cz[k][b]) / Cz[a][b]);
      }
    }
    if (ests.length === 0) return { identifiable: false, hasHeywood: true, topSourceName: null };
    const med = median(ests);
    if (med < 0) hasHeywood = true;
    errMedians.push(Math.max(0, med));
  }
  let bestIdx = 0;
  for (let k = 1; k < J; k++) {
    if (errMedians[k] < errMedians[bestIdx]) bestIdx = k;
  }
  return {
    identifiable: true,
    hasHeywood,
    topSourceName: sources[bestIdx]?.displayName ?? null
  };
}

function winsorizePreviewCopy(
  baseObs: AlignedPanelObservation[],
  sources: MsmaSourceConfig[]
): AlignedPanelObservation[] {
  const copy: AlignedPanelObservation[] = baseObs.map(o => ({
    ...o,
    valuesBySource: { ...o.valuesBySource }
  }));
  for (const s of sources) {
    const vals = copy
      .map(o => o.valuesBySource[s.id])
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length < 8) continue;
    const lo = quantileSorted(vals, 0.025);
    const hi = quantileSorted(vals, 0.975);
    for (const o of copy) {
      const v = o.valuesBySource[s.id];
      if (v !== null) o.valuesBySource[s.id] = Math.min(hi, Math.max(lo, v));
    }
  }
  return copy;
}

function summarizeObsMetrics(
  obs: AlignedPanelObservation[],
  sources: MsmaSourceConfig[]
): { meanAbsSkew: number; completeCases: number; scaleSummary: string } {
  const completeCases = obs.filter(o =>
    sources.every(s => o.valuesBySource[s.id] !== null && Number.isFinite(o.valuesBySource[s.id]))
  ).length;
  const skews: number[] = [];
  const ranges: string[] = [];
  for (const s of sources) {
    const vals = obs.map(o => o.valuesBySource[s.id]).filter((v): v is number => v !== null && Number.isFinite(v));
    skews.push(Math.abs(skewnessAndExcessKurtosis(vals).skewness));
    if (vals.length > 0 && ranges.length < 2) {
      ranges.push(`${s.displayName}: μ=${mean(vals).toFixed(2)}, SD=${sampleSd(vals).toFixed(2)}`);
    }
  }
  return {
    meanAbsSkew: mean(skews),
    completeCases,
    scaleSummary: ranges.join(' | ')
  };
}

export function evaluateTransformationRecommendations(params: {
  baseObservations: AlignedPanelObservation[];
  sources: MsmaSourceConfig[];
  panel: MsmaPanelStructureResult;
  classification: MsmaConstructClassificationResult;
  activeTransformation: MsmaTransformationId;
  rejectedTransformations: MsmaTransformationId[];
  dropDuplicates: boolean;
  outlierHandling: 'KEEP_ALL' | 'WINSORIZE_2_5' | 'TRIM_EXTREME_3_5_MAD';
  missingHandling: 'COMPLETE_CASE' | 'WITHIN_ENTITY_INTERPOLATE';
}): MsmaTransformationBundle {
  const {
    baseObservations,
    sources,
    panel,
    classification,
    activeTransformation,
    rejectedTransformations,
    outlierHandling,
    missingHandling
  } = params;

  const allValues: number[] = [];
  for (const s of sources) {
    for (const o of baseObservations) {
      const v = o.valuesBySource[s.id];
      if (v !== null && Number.isFinite(v)) allValues.push(v);
    }
  }

  const hasZeroOrNegative = allValues.some(v => v <= 0);
  const hasNegative = allValues.some(v => v < 0);
  const baseMetrics = summarizeObsMetrics(baseObservations, sources);
  const baseQuadDeltaR2 = computeMaxQuadraticDeltaR2(baseObservations, sources);
  const baseProbe = probeCandidateIdentifiability(
    baseObservations,
    sources,
    classification.allowsJointCollocationRanking
  );

  const stataVars = sources.map((s, idx) => toStataVarName(s.columnKey, idx + 1));

  const interpretabilityBonus = (id: MsmaTransformationId): number => {
    switch (id) {
      case 'NONE':
        return 5;
      case 'LOG':
      case 'SQRT':
      case 'BOX_COX':
      case 'YEO_JOHNSON':
        return 4;
      case 'SPATIAL_ADJUSTMENT':
      case 'TEMPORAL_DETRENDING':
      case 'OUTLIER_WINSORIZE_SENSITIVITY':
        return 3;
      case 'DEMEANING_WITHIN':
      case 'FIRST_DIFFERENCE':
        return 2;
      default:
        return 0;
    }
  };

  const mkCandidate = (
    id: MsmaTransformationId,
    issueDetected: string,
    recommendationLabel: string,
    statisticalRationale: string,
    interpretationConsequence: string,
    eligible: boolean,
    ineligibilityReason: string | null,
    stataCmd: string
  ): MsmaTransformationRecommendation => {
    const previewObs = !eligible
      ? baseObservations
      : id === 'OUTLIER_WINSORIZE_SENSITIVITY'
        ? winsorizePreviewCopy(baseObservations, sources)
        : applySelectedTransformation(baseObservations, sources, id);

    const afterMetrics = summarizeObsMetrics(previewObs, sources);
    const afterQuadR2 = eligible ? computeMaxQuadraticDeltaR2(previewObs, sources) : baseQuadDeltaR2;
    const probe = eligible
      ? probeCandidateIdentifiability(previewObs, sources, classification.allowsJointCollocationRanking)
      : { identifiable: false, hasHeywood: false, topSourceName: null };

    const idScore = probe.identifiable && !probe.hasHeywood ? 50 : probe.identifiable ? 35 : 0;
    const linScore = 20 * Math.max(0, 1 - afterQuadR2 / 0.12);
    const skewScore = 15 * Math.max(0, 1 - afterMetrics.meanAbsSkew / 2.5);
    const retScore =
      10 * Math.min(1, afterMetrics.completeCases / Math.max(1, baseMetrics.completeCases));
    const rawScore = !eligible
      ? 0
      : !classification.allowsJointCollocationRanking
        ? id === 'UNIT_CONSTRUCT_HARMONIZATION'
          ? 95
          : 10
        : Math.round(
            Math.min(
              100,
              idScore + linScore + skewScore + retScore + interpretabilityBonus(id)
            )
          );

    const isApplied =
      activeTransformation === id ||
      (id === 'OUTLIER_WINSORIZE_SENSITIVITY' && outlierHandling !== 'KEEP_ALL') ||
      (id === 'MISSING_LISTWISE_COMPLETE' && missingHandling === 'WITHIN_ENTITY_INTERPOLATE');
    const isRejected = rejectedTransformations.includes(id);

    return {
      id,
      issueDetected,
      recommendationLabel,
      statisticalRationale,
      interpretationConsequence,
      stataCommand: eligible ? stataCmd : `* TIDAK DIREKOMENDASIKAN / TIDAK SAH PADA DATA SAAT INI: ${ineligibilityReason ?? ''}`,
      eligibleOnCurrentData: eligible,
      ineligibilityReason,
      isPrimaryRecommendation: false,
      empiricalScore: rawScore,
      identifiableAfter: probe.identifiable,
      hasHeywoodAfter: probe.hasHeywood,
      maxQuadDeltaR2Before: baseQuadDeltaR2,
      maxQuadDeltaR2After: afterQuadR2,
      topSourceAfter: probe.topSourceName,
      status: isApplied ? 'Diterapkan' : isRejected ? 'Ditolak' : 'Belum diterapkan',
      beforeAfterPreview: {
        meanSkewnessBefore: baseMetrics.meanAbsSkew,
        meanSkewnessAfter: afterMetrics.meanAbsSkew,
        completeCasesBefore: baseMetrics.completeCases,
        completeCasesAfter: afterMetrics.completeCases,
        scaleSummaryBefore: baseMetrics.scaleSummary,
        scaleSummaryAfter: afterMetrics.scaleSummary
      }
    };
  };

  const recommendations: MsmaTransformationRecommendation[] = [
    mkCandidate(
      'NONE',
      `Rata-rata |skewness| awal = ${baseMetrics.meanAbsSkew.toFixed(2)}`,
      'Pertahankan Skala Asli (Tanpa Transformasi Non-Linear)',
      'Menjaga model aditif X_k = α_k + β_k T + ε_k langsung dalam satuan fisik asli tanpa bias balik transformasi (retransformation bias).',
      'Error variance dan Error SD dibaca langsung dalam satuan pengukuran asli (mis. kt CO₂/tahun).',
      true,
      null,
      '* Data tetap pada skala asli tanpa modifikasi variabel sumber'
    ),
    mkCandidate(
      'LOG',
      hasZeroOrNegative
        ? 'Terdapat nilai ≤ 0 pada sumber pengukuran'
        : `Kemiringan kanan |skewness| = ${baseMetrics.meanAbsSkew.toFixed(2)} & potensi galat proporsional`,
      '1. Log Transformation — ln(X)',
      'Mengubah struktur galat multiplikatif menjadi aditif dan menekan heteroskedastisitas pada kota beremisi besar.',
      'Estimasi σ_ε merepresentasikan galat relatif logaritmik (mendekati koefisien variasi / persentase galat), bukan ton absolut.',
      !hasZeroOrNegative,
      hasZeroOrNegative
        ? 'Log transform TIDAK boleh diterapkan langsung karena ditemukan nilai nol atau negatif pada data.'
        : null,
      stataVars.map(v => `gen double ln_${v} = ln(${v})`).join('\n')
    ),
    mkCandidate(
      'SQRT',
      hasNegative ? 'Terdapat nilai negatif pada data' : 'Stabilitas varians moderat pada data cacah/fluks non-negatif',
      '2. Square Root Transformation — √X',
      'Menekan kecondongan kanan moderat dan sah pada nilai tepat nol (x ≥ 0), lebih ringan daripada logaritma.',
      'Satuan varians galat berpindah ke akar satuan asli (√satuan).',
      !hasNegative,
      hasNegative ? 'Akar kuadrat tidak terdefinisi pada bilangan riil negatif.' : null,
      stataVars.map(v => `gen double sqrt_${v} = sqrt(${v})`).join('\n')
    ),
    mkCandidate(
      'BOX_COX',
      hasZeroOrNegative ? 'Terdapat nilai ≤ 0' : 'Penyesuaian pangkat keluarga Box-Cox (λ = 0.25)',
      '3. Box-Cox Power Transformation',
      'Menyediakan jembatan kontinu antara transformasi akar dan logaritmik untuk mendekati simetri distribusi.',
      'Parameter varians galat berada pada skala Box-Cox; peringkat relatif tetap valid namun besaran absolut perlu kehati-hatian.',
      !hasZeroOrNegative,
      hasZeroOrNegative ? 'Box-Cox klasik mensyaratkan seluruh observasi bernilai positif murni (x > 0).' : null,
      stataVars.map(v => `gen double bc_${v} = (${v}^0.25 - 1) / 0.25`).join('\n')
    ),
    mkCandidate(
      'YEO_JOHNSON',
      `Distribusi miring (|skewness| = ${baseMetrics.meanAbsSkew.toFixed(2)}) dengan dukungan penuh nilai ≤ 0`,
      '4. Yeo-Johnson Transformation (λ = 0.5)',
      'Generalisasi Box-Cox yang terdefinisi mulus pada seluruh garis bilangan riil termasuk nol dan negatif.',
      'Skala pengukuran berubah ke domain pangkat Yeo-Johnson; peringkat invarian skala (ETC R²) direkomendasikan sebagai acuan pendamping.',
      true,
      null,
      stataVars
        .map(
          v =>
            `gen double yj_${v} = cond(${v} >= 0, ((${v} + 1)^0.5 - 1)/0.5, -((-${v} + 1)^1.5 - 1)/1.5)`
        )
        .join('\n')
    ),
    mkCandidate(
      'STANDARDIZATION_Z',
      'Perbedaan rentang numerik antarsumber (HANYA penyetaraan skala statistik, BUKAN penyamaan konstruk!)',
      '5. Standardization (Z-Score per Sumber)',
      'Menyetarakan mean = 0 dan SD = 1 pada tiap sumber untuk inspeksi korelasi bebas skala.',
      'PERINGATAN: Standardisasi menghilangkan perbedaan varians total C_kk = 1 dan TIDAK membuat konstruk berbeda (Contoh B) menjadi sama.',
      classification.allowsJointCollocationRanking,
      !classification.allowsJointCollocationRanking
        ? 'Diblokir pada Contoh B: Z-score tidak menyamakan besaran fisik berbeda.'
        : null,
      stataVars.map(v => `egen double z_${v} = std(${v})`).join('\n')
    ),
    mkCandidate(
      'DEMEANING_WITHIN',
      'Heterogenitas efek tetap kota (variasi level antarkota tinggi)',
      '6. Entity Within-Demeaning (X_it − X̄_i)',
      'Memfokuskan evaluasi murni pada akurasi pelacakan fluktuasi antar-tahun di dalam masing-masing kota.',
      'KONSEKUENSI PENTING: Menghapus seluruh variasi sinyal antarkota; jika emisi kota lambat berubah antar-tahun, rasio sinyal-terhadap-derau (SNR) dapat turun tajam.',
      panel.nPeriods >= 3,
      panel.nPeriods < 3 ? 'Membutuhkan minimal 3 periode waktu per kota.' : null,
      stataVars.map(v => `bysort city_id: egen double mean_${v} = mean(${v})\ngen double dm_${v} = ${v} - mean_${v}`).join('\n')
    ),
    mkCandidate(
      'FIRST_DIFFERENCE',
      'Non-stasioneritas atau autokorelasi serial tinggi antar-tahun',
      '7. First Difference (ΔX_it = X_it − X_i,t-1)',
      'Mengukur akurasi sumber dalam menangkap perubahan tahunan (annual emission change) dan meredam random walk.',
      'KONSEKUENSI PENTING: Mengubah target estimasi dari level emisi menjadi perubahan emisi tahunan, menghilangkan tahun pertama tiap kota, dan melipatgandakan varians white-noise sebesar 2×.',
      panel.nPeriods >= 3,
      panel.nPeriods < 3 ? 'Membutuhkan minimal 3 periode berurutan.' : null,
      `xtset city_id tahun\n` + stataVars.map(v => `gen double fd_${v} = D.${v}`).join('\n')
    ),
    mkCandidate(
      'TEMPORAL_DETRENDING',
      'Tren sekuler bersama lintas tahun',
      '8. Linear Temporal Detrending',
      'Menghilangkan tren linear makro tahunan agar kovarians tidak didominasi tren waktu bersama.',
      'Mengevaluasi akurasi pada deviasi di sekitar garis tren temporal.',
      panel.nPeriods >= 4,
      panel.nPeriods < 4 ? 'Membutuhkan minimal 4 periode untuk detrending stabil.' : null,
      stataVars.map(v => `quietly reg ${v} c.tahun\npredict double dt_${v}, residuals`).join('\n')
    ),
    mkCandidate(
      'SPATIAL_ADJUSTMENT',
      'Guncangan tahunan makro bersama (mis. anomali pandemi 2020 di seluruh kota)',
      '9. Cross-Sectional Period Median Adjustment',
      'Menyesuaikan pergeseran median tahunan nasional agar perbandingan antarkota lebih bersih dari guncangan serentak.',
      'Mempertahankan variasi antarkota sambil menstabilkan rata-rata lintas tahun.',
      panel.nEntities >= 5,
      panel.nEntities < 5 ? 'Membutuhkan minimal 5 entitas per periode.' : null,
      stataVars.map(v => `bysort tahun: egen double pmed_${v} = median(${v})\ngen double sp_${v} = ${v} - pmed_${v}`).join('\n')
    ),
    mkCandidate(
      'MISSING_LISTWISE_COMPLETE',
      panel.missingPanelCells > 0
        ? `Terdapat ${panel.missingPanelCells} sel panel kosong (Unbalanced)`
        : 'Panel lengkap tanpa missing internal',
      '10. Penanganan Missing Data (Complete-Case vs Interpolasi Interior Terbatas)',
      'Secara baku menggunakan Complete-Case agar tidak menyuntikkan kelicinan buatan; interpolasi interior hanya untuk uji sensitivitas celah 1-tahun.',
      'Interpolasi linear dapat mengecilkan varians galat semu jika porsi missing besar; gunakan hanya sebagai pembanding.',
      true,
      null,
      `misstable summarize ${stataVars.join(' ')}\n* Opsi konservatif utama: analisis complete-case tanpa imputasi agresif`
    ),
    mkCandidate(
      'OUTLIER_WINSORIZE_SENSITIVITY',
      'Pemeriksaan pengaruh observasi ekstrem (> 3.5 Panel MAD)',
      '11. Analisis Sensitivitas Outlier (Winsorize 2.5% / Trim 3.5 MAD)',
      'Menguji apakah peringkat sumber didikte oleh segelintir observasi ekstrem tanpa membuang data secara sepihak pada model utama.',
      'CATATAN ETIKA STATISTIK: Winsorization bukan alat untuk menghapus data yang tidak disukai; wajib disajikan berdampingan dengan data asli.',
      true,
      null,
      stataVars
        .map(v => `_pctile ${v}, p(2.5 97.5)\ngen double w_${v} = min(max(${v}, r(r1)), r(r2)) if !missing(${v})`)
        .join('\n')
    ),
    mkCandidate(
      'UNIT_CONSTRUCT_HARMONIZATION',
      classification.finalClassification === 'CONTOH_B'
        ? 'Perbedaan satuan / konstruk fisik antarsumber (Contoh B)'
        : 'Pemeriksaan keseragaman faktor satuan (Contoh A)',
      '12. Harmonisasi Satuan & Model Konversi Fisik',
      'Menyetarakan satuan metrik deterministik (mis. ton × 0.001 -> kt) atau menerapkan persamaan konversi fisik terdokumentasi beserta propagasi varians ketidakpastiannya.',
      'Menjamin seluruh sumber merepresentasikan besaran fisik dan satuan target yang identik sebelum masuk ke matriks kovarians.',
      true,
      null,
      sources
        .map((s, idx) => {
          const v = stataVars[idx];
          return `gen double harm_${v} = ${s.conversionIntercept} + ${s.conversionSlope} * (${v} * ${s.unitScaleMultiplier})`;
        })
        .join('\n')
    )
  ];

  // Rank candidates empirically across multi-criteria score
  const scoringPoolIds = new Set<MsmaTransformationId>([
    'NONE',
    'LOG',
    'SQRT',
    'BOX_COX',
    'YEO_JOHNSON',
    'DEMEANING_WITHIN',
    'FIRST_DIFFERENCE',
    'TEMPORAL_DETRENDING',
    'SPATIAL_ADJUSTMENT',
    'OUTLIER_WINSORIZE_SENSITIVITY'
  ]);

  const identifiableCandidates = recommendations.filter(
    r => r.eligibleOnCurrentData && scoringPoolIds.has(r.id) && r.identifiableAfter && !r.hasHeywoodAfter
  );

  let primaryId: MsmaTransformationId = 'NONE';
  let primaryReason = '';
  let noSilverBulletWarning: string | null = null;

  if (!classification.allowsJointCollocationRanking) {
    primaryId = 'UNIT_CONSTRUCT_HARMONIZATION';
    primaryReason =
      'Terdeteksi perbedaan konstruk fisik antarsumber (Contoh B). Harmonisasi berbasis model konversi fisik pada Step 4 wajib diselesaikan terlebih dahulu; transformasi statistik murni (log/Z-score) tidak menyamakan besaran fisik berbeda.';
  } else if (identifiableCandidates.length > 0) {
    // Pick highest empirical multi-criteria score among identifiable candidates
    const sortedBest = [...identifiableCandidates].sort((a, b) => b.empiricalScore - a.empiricalScore);
    const best = sortedBest[0];
    primaryId = best.id;

    if (!baseProbe.identifiable || baseProbe.hasHeywood) {
      primaryReason = `Data asli (NONE) mengalami kegagalan identifikasi / kasus Heywood, sedangkan simulasi empiris menemukan bahwa "${best.recommendationLabel}" memulihkan keteridentifikasian matriks kovarians (Skor Kelayakan ${best.empiricalScore}/100, ΔR²_quad = ${best.maxQuadDeltaR2After.toFixed(4)}, |skew| = ${best.beforeAfterPreview.meanSkewnessAfter.toFixed(2)}). Klik "Terapkan Rekomendasi Terbaik" di bawah untuk mengaktifkannya.`;
    } else if (best.id === 'NONE') {
      primaryReason = `Data pada skala asli (NONE) sudah teridentifikasi penuh bebas kasus Heywood (Skor Kelayakan ${best.empiricalScore}/100, |skew| = ${baseMetrics.meanAbsSkew.toFixed(2)}, ΔR²_quad = ${baseQuadDeltaR2.toFixed(4)}); mempertahankan satuan fisik asli menjaga kemudahan interpretasi Error SD.`;
    } else {
      primaryReason = `Simulasi multi-kriteria memilih "${best.recommendationLabel}" (Skor Kelayakan ${best.empiricalScore}/100 vs NONE ${recommendations[0].empiricalScore}/100): model teridentifikasi bebas Heywood, menekan |skewness| dari ${baseMetrics.meanAbsSkew.toFixed(2)} menjadi ${best.beforeAfterPreview.meanSkewnessAfter.toFixed(2)}, dan memperbaiki kelengkungan ΔR²_quad dari ${baseQuadDeltaR2.toFixed(4)} menjadi ${best.maxQuadDeltaR2After.toFixed(4)}.`;
    }
  } else {
    // Honest scientific disclosure when NO transformation cures Heywood / non-identifiability
    primaryId = !hasZeroOrNegative && baseMetrics.meanAbsSkew > 1.35 ? 'LOG' : 'NONE';
    primaryReason =
      'Simulasi pra-evaluasi telah menguji seluruh 12 opsi transformasi, namun tidak ada transformasi matematis tunggal yang memulihkan keteridentifikasian matriks kovarians penuh pada dataset ini.';
    noSilverBulletWarning =
      'BATAS METODOLOGIS TRANSFORMASI DATA: Seluruh kandidat transformasi tetap menghasilkan kasus Heywood (σ̂²_T ≤ 0 atau σ̂²_ε < 0). Hal ini membuktikan masalah bukan sekadar kemiringan distribusi, melainkan salah satu dari: (1) sumber sebenarnya mengukur besaran/polutan fisik berbeda (Contoh B, mis. emisi CO₂ vs kolom NO₂ vs PM2.5 — periksa kembali Step 3 & Step 4), (2) korelasi negatif antarsumber, atau (3) korelasi galat positif kuat antara dua sumber yang membutuhkan sumber independen ke-4 (Extended Collocation).';
  }

  for (const r of recommendations) {
    r.isPrimaryRecommendation = r.id === primaryId;
  }

  return {
    activeTransformation,
    dropDuplicates: params.dropDuplicates,
    outlierHandling,
    missingHandling,
    primaryRecommendationId: primaryId,
    primarySelectionReason: primaryReason,
    anyCandidateIdentifiable: identifiableCandidates.length > 0,
    identifiableCandidateIds: identifiableCandidates.map(c => c.id),
    noSilverBulletWarning,
    recommendations
  };
}
