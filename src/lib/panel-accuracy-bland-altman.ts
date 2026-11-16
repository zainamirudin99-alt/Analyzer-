// ============================================================
// Comparative Measurement Accuracy Assessment — Bland-Altman Analysis
// Mean Bias, SD of Differences, 95% Limits of Agreement (LoA),
// Confidence Intervals & Proportional Bias Regression Test
// ============================================================

import {
  BlandAltmanPoint,
  BlandAltmanResult,
  MeasurementSource
} from './panel-accuracy-types';

// Accurate two-sided p-value for Student-t distribution
export function studentTPValueTwoSided(absT: number, df: number): number {
  if (!Number.isFinite(absT) || df <= 0) return 1;
  const t = Math.abs(absT);
  if (t < 1e-12) return 1;

  // Hill (1970) / Peizer-Pratt normal approximation for t -> z accurate to < 1e-4 for df >= 2
  if (df === 1) {
    return Math.max(0, Math.min(1, 1 - (2 / Math.PI) * Math.atan(t)));
  }
  if (df === 2) {
    return Math.max(0, Math.min(1, 1 - t / Math.sqrt(2 + t * t)));
  }
  const a = df - 0.5;
  const b = 48 * a * a;
  const z2 = a * Math.log(1 + (t * t) / df);
  const z =
    Math.sqrt(z2) *
    (1 -
      ((z2 + 3) / b) +
      ((4 * z2 * z2 + 33 * z2 + 24) / (10 * b * b)));
  return normalPValueTwoSided(z);
}

export function normalPValueTwoSided(absZ: number): number {
  const x = Math.abs(absZ);
  if (!Number.isFinite(x)) return 0;
  // Abramowitz & Stegun 7.1.26 error function approximation
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const probOneTail =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.max(0, Math.min(1, 2 * probOneTail));
}

export function studentTCritical95(df: number): number {
  if (df <= 1) return 12.706;
  if (df === 2) return 4.3027;
  if (df === 3) return 3.1824;
  if (df === 4) return 2.7764;
  if (df === 5) return 2.5706;
  if (df === 6) return 2.4469;
  if (df === 7) return 2.3646;
  if (df === 8) return 2.3060;
  if (df === 9) return 2.2622;
  if (df === 10) return 2.2281;
  // Cornlish-Fisher expansion for t_{0.975, df}
  const z = 1.959964;
  const g1 = (z * z * z + z) / 4;
  const g2 = (5 * Math.pow(z, 5) + 16 * z * z * z + 3 * z) / 96;
  return z + g1 / df + g2 / (df * df);
}

export function computeBlandAltmanAgreement(
  pairs: Array<{ city: string; year: number; compVal: number; refVal: number }>,
  source: Pick<MeasurementSource, 'id' | 'name' | 'label'>
): BlandAltmanResult {
  const n = pairs.length;
  if (n < 2) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceLabel: source.label,
      n,
      meanBias: 0,
      sdDiff: 0,
      seMeanBias: 0,
      meanBiasCiLower: 0,
      meanBiasCiUpper: 0,
      loaLower: 0,
      loaUpper: 0,
      seLoa: 0,
      loaLowerCi: [0, 0],
      loaUpperCi: [0, 0],
      outsideLoaCount: 0,
      outsideLoaPct: 0,
      propBiasIntercept: 0,
      propBiasSlope: 0,
      propBiasTStat: 0,
      propBiasPValue: 1,
      hasProportionalBias: false,
      points: []
    };
  }

  const diffs = pairs.map(p => p.compVal - p.refVal);
  const means = pairs.map(p => 0.5 * (p.compVal + p.refVal));

  const meanBias = diffs.reduce((a, b) => a + b, 0) / n;
  const varDiff = diffs.reduce((s, d) => s + (d - meanBias) ** 2, 0) / (n - 1);
  const sdDiff = Math.sqrt(Math.max(0, varDiff));

  const tCrit = studentTCritical95(n - 1);
  const seMeanBias = sdDiff / Math.sqrt(n);
  const meanBiasCiLower = meanBias - tCrit * seMeanBias;
  const meanBiasCiUpper = meanBias + tCrit * seMeanBias;

  // Bland & Altman (1986, 1999): 95% Limits of Agreement = d_bar +/- 1.96 * s_d
  const loaLower = meanBias - 1.96 * sdDiff;
  const loaUpper = meanBias + 1.96 * sdDiff;
  const seLoa = sdDiff * Math.sqrt(3 / n);
  const loaLowerCi: [number, number] = [loaLower - tCrit * seLoa, loaLower + tCrit * seLoa];
  const loaUpperCi: [number, number] = [loaUpper - tCrit * seLoa, loaUpper + tCrit * seLoa];

  const points: BlandAltmanPoint[] = pairs.map((p, idx) => {
    const diffVal = diffs[idx];
    const meanVal = means[idx];
    const isOutsideLoa = diffVal < loaLower || diffVal > loaUpper;
    return {
      city: p.city,
      year: p.year,
      compVal: p.compVal,
      refVal: p.refVal,
      meanVal,
      diffVal,
      absError: Math.abs(diffVal),
      isOutsideLoa
    };
  });

  const outsideLoaCount = points.filter(pt => pt.isOutsideLoa).length;
  const outsideLoaPct = (outsideLoaCount / n) * 100;

  // Proportional bias regression: diff_i = gamma_0 + gamma_1 * mean_i + u_i
  const meanOfMeans = means.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = means[i] - meanOfMeans;
    const dy = diffs[i] - meanBias;
    sxx += dx * dx;
    sxy += dx * dy;
  }

  let propBiasSlope = 0;
  let propBiasIntercept = meanBias;
  let propBiasTStat = 0;
  let propBiasPValue = 1;

  if (sxx > 1e-12 && n >= 3) {
    propBiasSlope = sxy / sxx;
    propBiasIntercept = meanBias - propBiasSlope * meanOfMeans;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const pred = propBiasIntercept + propBiasSlope * means[i];
      sse += (diffs[i] - pred) ** 2;
    }
    const mse = sse / Math.max(1, n - 2);
    const seSlope = Math.sqrt(Math.max(1e-12, mse / sxx));
    propBiasTStat = propBiasSlope / seSlope;
    propBiasPValue = studentTPValueTwoSided(propBiasTStat, n - 2);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceLabel: source.label,
    n,
    meanBias,
    sdDiff,
    seMeanBias,
    meanBiasCiLower,
    meanBiasCiUpper,
    loaLower,
    loaUpper,
    seLoa,
    loaLowerCi,
    loaUpperCi,
    outsideLoaCount,
    outsideLoaPct,
    propBiasIntercept,
    propBiasSlope,
    propBiasTStat,
    propBiasPValue,
    hasProportionalBias: propBiasPValue < 0.05,
    points
  };
}
