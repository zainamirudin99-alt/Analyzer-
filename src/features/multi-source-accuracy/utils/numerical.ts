
export function sanitizeCellText(val: unknown): string {
  const s = String(val ?? '').trim();
  if (/^[=+\-@]/.test(s) && !/^-[0-9]+([.,][0-9]+)?$/.test(s)) {
    return `'${s}`;
  }
  return s;
}

export function parseSafeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const raw = String(val).trim();
  if (!raw || /^(na|n\/a|null|nan|none|-|\.|#n\/a|#value!|#ref!)$/i.test(raw)) {
    return null;
  }
  const normalized =
    raw.includes(',') && !raw.includes('.')
      ? raw.replace(',', '.')
      : raw.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function createSeededRng(seed = 20261126): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomStandardNormal(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < xs.length; i++) sum += xs[i];
  return sum / xs.length;
}

export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const clamped = Math.min(1, Math.max(0, p));
  const pos = (sorted.length - 1) * clamped;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return quantileSorted(sorted, 0.5);
}

export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const med = median(xs);
  const absDevs = xs.map(x => Math.abs(x - med));
  return median(absDevs) * 1.4826;
}

export function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m;
    acc += d * d;
  }
  return acc / (xs.length - 1);
}

export function sampleSd(xs: number[]): number {
  return Math.sqrt(Math.max(0, sampleVariance(xs)));
}

export function sampleCovariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (xs[i] - mx) * (ys[i] - my);
  }
  return acc / (n - 1);
}

export function skewnessAndExcessKurtosis(xs: number[]): { skewness: number; kurtosisExcess: number } {
  const n = xs.length;
  if (n < 3) return { skewness: 0, kurtosisExcess: 0 };
  const m = mean(xs);
  const sd = sampleSd(xs);
  if (sd <= 1e-14) return { skewness: 0, kurtosisExcess: 0 };
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const z = (xs[i] - m) / sd;
    const z2 = z * z;
    m3 += z2 * z;
    m4 += z2 * z2;
  }
  const skew = (n / ((n - 1) * (n - 2))) * m3;
  const kurt =
    n >= 4
      ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * m4 -
        (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
      : m4 / n - 3;
  return { skewness: skew, kurtosisExcess: kurt };
}

export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

export function twoSidedNormalP(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
}

export function studentTPValueTwoSided(tStat: number, df: number): number {
  if (!Number.isFinite(tStat) || df <= 0) return 1;
  if (df > 120) return twoSidedNormalP(tStat);
  // Peizer-Pratt / Hill accurate normal approximation for Student-t
  const absT = Math.abs(tStat);
  const a = df - 0.5;
  const b = 48 * a * a;
  const z2 = a * Math.log(1 + (absT * absT) / df);
  const z = Math.sqrt(z2) * (1 - (z2 + 3) / b);
  return twoSidedNormalP(z);
}

export function pearsonCorrAndP(xs: number[], ys: number[]): { r: number; p: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { r: 0, p: 1 };
  const sx = sampleSd(xs);
  const sy = sampleSd(ys);
  if (sx <= 1e-14 || sy <= 1e-14) return { r: 0, p: 1 };
  const cov = sampleCovariance(xs, ys);
  const r = Math.max(-1, Math.min(1, cov / (sx * sy)));
  if (Math.abs(r) >= 0.9999999) return { r, p: 0 };
  const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  return { r, p: studentTPValueTwoSided(t, n - 2) };
}

export function averageRanks(xs: number[]): number[] {
  const indexed = xs.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
  const ranks = Array.from({ length: xs.length }, () => 0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].val === indexed[i].val) {
      j++;
    }
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorrAndP(xs: number[], ys: number[]): { rho: number; p: number } {
  if (xs.length < 3 || xs.length !== ys.length) return { rho: 0, p: 1 };
  const rx = averageRanks(xs);
  const ry = averageRanks(ys);
  const { r, p } = pearsonCorrAndP(rx, ry);
  return { rho: r, p };
}

export function covarianceMatrixFromColumns(cols: number[][]): number[][] {
  const J = cols.length;
  const C: number[][] = Array.from({ length: J }, () => Array.from({ length: J }, () => 0));
  for (let i = 0; i < J; i++) {
    for (let j = i; j < J; j++) {
      const cov = i === j ? sampleVariance(cols[i]) : sampleCovariance(cols[i], cols[j]);
      C[i][j] = cov;
      C[j][i] = cov;
    }
  }
  return C;
}

/**
 * Jacobi symmetric eigenvalue solver for real symmetric matrices (J <= 20).
 * Returns eigenvalues sorted ascending and eigenvectors.
 */
export function jacobiSymmetricEigen(matrix: number[][]): {
  eigenvalues: number[];
  minEigenvalue: number;
  maxEigenvalue: number;
  conditionNumber: number;
} {
  const n = matrix.length;
  if (n === 0) {
    return { eigenvalues: [], minEigenvalue: 0, maxEigenvalue: 0, conditionNumber: 1 };
  }
  const A = matrix.map(row => [...row]);
  const maxIter = 80 * n * n;

  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0;
    let q = 1;
    let maxOff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(A[i][j]);
        if (v > maxOff) {
          maxOff = v;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-12) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    A[p][p] = app - t * apq;
    A[q][q] = aqq + t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let k = 0; k < n; k++) {
      if (k !== p && k !== q) {
        const akp = A[k][p];
        const akq = A[k][q];
        A[k][p] = c * akp - s * akq;
        A[p][k] = A[k][p];
        A[k][q] = s * akp + c * akq;
        A[q][k] = A[k][q];
      }
    }
  }

  const eigenvalues = Array.from({ length: n }, (_, i) => A[i][i]).sort((a, b) => a - b);
  const minEig = eigenvalues[0];
  const maxEig = eigenvalues[eigenvalues.length - 1];
  const cond =
    Math.abs(minEig) <= 1e-12
      ? 1e12
      : Math.abs(maxEig / minEig);

  return {
    eigenvalues,
    minEigenvalue: minEig,
    maxEigenvalue: maxEig,
    conditionNumber: cond
  };
}

export function invertSymmetricPositiveMatrix(mat: number[][], ridge = 1e-10): number[][] | null {
  const n = mat.length;
  const aug: number[][] = mat.map((row, i) => [
    ...row.map((v, j) => (i === j ? v + ridge : v)),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  ]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      const cand = Math.abs(aug[r][col]);
      if (cand > maxAbs) {
        maxAbs = cand;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-13) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const piv = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let c = 0; c < 2 * n; c++) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }

  return aug.map(row => row.slice(n));
}

export function simpleLinearRegression(xs: number[], ys: number[]): {
  slope: number;
  intercept: number;
  r2: number;
  tSlope: number;
  pSlope: number;
} {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { slope: 0, intercept: mean(ys), r2: 0, tSlope: 0, pSlope: 1 };
  const vx = sampleVariance(xs);
  if (vx <= 1e-14) return { slope: 0, intercept: mean(ys), r2: 0, tSlope: 0, pSlope: 1 };
  const cov = sampleCovariance(xs, ys);
  const slope = cov / vx;
  const intercept = mean(ys) - slope * mean(xs);
  let sse = 0;
  let sst = 0;
  const my = mean(ys);
  for (let i = 0; i < n; i++) {
    const err = ys[i] - (intercept + slope * xs[i]);
    sse += err * err;
    const dy = ys[i] - my;
    sst += dy * dy;
  }
  const r2 = sst > 1e-14 ? Math.max(0, Math.min(1, 1 - sse / sst)) : 0;
  const s2 = sse / Math.max(1, n - 2);
  const seSlope = Math.sqrt(s2 / Math.max(1e-14, (n - 1) * vx));
  const tSlope = seSlope > 1e-14 ? slope / seSlope : 0;
  return {
    slope,
    intercept,
    r2,
    tSlope,
    pSlope: studentTPValueTwoSided(tSlope, n - 2)
  };
}

export function fmtNum(val: number | null | undefined, digits = 4): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  if (abs > 0 && (abs >= 1e6 || abs < 1e-3)) {
    return val.toExponential(Math.max(2, digits - 1));
  }
  return val.toFixed(digits);
}

export function fmtAdaptive(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  if (abs === 0) return '0.0000';
  if (abs >= 1000) return val.toFixed(2);
  if (abs >= 10) return val.toFixed(3);
  if (abs >= 0.01) return val.toFixed(4);
  return val.toExponential(3);
}

export function toStataVarName(raw: string, fallbackIdx = 1): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return `src_${fallbackIdx}`;
  if (/^[0-9]/.test(cleaned)) return `v_${cleaned}`.slice(0, 28);
  return cleaned.slice(0, 28);
}
