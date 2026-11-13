// ============================================================
// Panel Latent Variable Measurement Model — Bayesian MCMC Engine
// Native TypeScript Parameter-Expanded Blocked-Gibbs + Slice/MH
// Implements Multi-Chain MCMC, Half-Cauchy Scale-Mixture Priors,
// Student-t Scale-Mixture Likelihood, Optional AR(1), Split R-hat,
// Geyer ESS, MCSE, PPC, WAIC, Sensitivity & Model Comparison.
// ============================================================

import { computePearsonCorrelation } from './panel-latent-data';
import {
  CleanedLatentObservation,
  ConvergenceDiagnostics,
  IdentificationAuditResult,
  LatentEmissionEstimate,
  LikelihoodFamily,
  MCMCParameterSummary,
  MeasurementSourceKey,
  ModelComparisonEntry,
  PanelLatentMapping,
  PanelLatentModelSpec,
  PanelLatentPreprocessingOptions,
  PosteriorPredictiveMetrics,
  PriorRegime,
  PriorSensitivityEntry,
  SourceComparisonRow,
  SourceEvaluationSummary
} from './panel-latent-types';

export const DEFAULT_PANEL_LATENT_SPEC: PanelLatentModelSpec = {
  identification: 'anchor',
  anchorSource: 'X3',
  sourceSpecificBias: true,
  sourceSpecificLoading: true,
  includeCityIntercept: true,
  includeTimeEffect: true,
  includeAR1: false,
  priorRegime: 'weakly_informative',
  likelihood: 'normal',
  studentTDf: 5,
  chains: 4,
  warmup: 500,
  draws: 500,
  seed: 20261113,
  ciLevel: 0.95
};

// ---------------- Seeded PRNG & Samplers ----------------

class SeededRandom {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 123456789;
  }

  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const val = this.spare;
      this.spare = null;
      return mean + sd * val;
    }
    const u1 = Math.max(1e-12, this.next());
    const u2 = this.next();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);
    this.spare = z1;
    return mean + sd * z0;
  }

  /**
   * Marsaglia and Tsang (2000) exact Gamma(shape, rate=1) sampler.
   */
  gamma(shape: number, rate = 1): number {
    const k = Math.max(1e-4, shape);
    const r = Math.max(1e-12, rate);
    if (k < 1) {
      const u = Math.max(1e-12, this.next());
      return this.gamma(k + 1, r) * Math.pow(u, 1 / k);
    }
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x = this.normal(0, 1);
      let v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return (d * v) / r;
      if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return (d * v) / r;
    }
  }

  invGamma(shape: number, scale: number): number {
    const g = this.gamma(shape, Math.max(1e-12, scale));
    return 1 / Math.max(1e-12, g);
  }

  /**
   * Normal truncated to [lower, +inf) via inverse CDF or shifted exponential rejection.
   */
  truncatedNormalLower(mean: number, sd: number, lower: number): number {
    const s = Math.max(1e-8, sd);
    const a = (lower - mean) / s;
    if (a <= 0) {
      // Rejection is >= 50% efficient
      for (let i = 0; i < 64; i++) {
        const z = this.normal(0, 1);
        if (z >= a) return mean + s * z;
      }
      return lower + 1e-4;
    }
    // Robert (1995) exponential proposal for tail sampling
    const alphaStar = (a + Math.sqrt(a * a + 4)) / 2;
    for (let i = 0; i < 128; i++) {
      const z = a - Math.log(Math.max(1e-12, this.next())) / alphaStar;
      const rho = Math.exp(-0.5 * (z - alphaStar) * (z - alphaStar));
      if (this.next() <= rho) return mean + s * z;
    }
    return lower + 1e-3;
  }
}

// ---------------- Prior Hyperparameters ----------------

interface PriorHyperparams {
  tauAlpha: number;
  tauLambda: number;
  cauchyErrScale: number;
  cauchyStrucScale: number;
  rhoPriorSd: number;
}

function getPriorHyperparams(regime: PriorRegime): PriorHyperparams {
  switch (regime) {
    case 'skeptical_tight':
      return {
        tauAlpha: 0.45,
        tauLambda: 0.3,
        cauchyErrScale: 0.45,
        cauchyStrucScale: 0.5,
        rhoPriorSd: 0.4
      };
    case 'diffuse_wide':
      return {
        tauAlpha: 8.0,
        tauLambda: 2.5,
        cauchyErrScale: 4.0,
        cauchyStrucScale: 4.0,
        rhoPriorSd: 0.95
      };
    case 'weakly_informative':
    default:
      return {
        tauAlpha: 2.0,
        tauLambda: 0.85,
        cauchyErrScale: 1.0,
        cauchyStrucScale: 1.0,
        rhoPriorSd: 0.7
      };
  }
}

// ---------------- Convergence & Posterior Summaries ----------------

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeSplitRHat(chains: number[][]): number {
  const mOrig = chains.length;
  const nOrig = chains[0]?.length || 0;
  if (mOrig < 2 || nOrig < 8) return 1.0;

  const half = Math.floor(nOrig / 2);
  const splitChains: number[][] = [];
  for (let c = 0; c < mOrig; c++) {
    splitChains.push(chains[c].slice(0, half));
    splitChains.push(chains[c].slice(half, 2 * half));
  }

  const m = splitChains.length;
  const n = half;
  const chainMeans = splitChains.map(ch => ch.reduce((a, b) => a + b, 0) / n);
  const grandMean = chainMeans.reduce((a, b) => a + b, 0) / m;

  let B = 0;
  let W = 0;
  for (let c = 0; c < m; c++) {
    B += (chainMeans[c] - grandMean) ** 2;
    let s2 = 0;
    for (let i = 0; i < n; i++) s2 += (splitChains[c][i] - chainMeans[c]) ** 2;
    W += s2 / (n - 1);
  }
  B = (n / (m - 1)) * B;
  W /= m;

  if (W < 1e-16 && B < 1e-16) return 1.0; // Fixed parameter
  if (W < 1e-16) return 1.0;
  const varPlus = ((n - 1) / n) * W + B / n;
  return Math.sqrt(Math.max(1.0, varPlus / W));
}

function computeGeyerESS(chains: number[][]): number {
  const m = chains.length;
  const n = chains[0]?.length || 0;
  if (m === 0 || n < 6) return m * n;

  const chainMeans = chains.map(ch => ch.reduce((a, b) => a + b, 0) / n);
  let W = 0;
  const vars = chains.map((ch, idx) => {
    const s2 = ch.reduce((acc, v) => acc + (v - chainMeans[idx]) ** 2, 0) / (n - 1);
    W += s2;
    return s2;
  });
  W /= m;
  if (W < 1e-16) return m * n;

  const grandMean = chainMeans.reduce((a, b) => a + b, 0) / m;
  const B = (n / Math.max(1, m - 1)) * chainMeans.reduce((s, cm) => s + (cm - grandMean) ** 2, 0);
  const varPlus = ((n - 1) / n) * W + (m > 1 ? B / n : 0);

  const maxLag = Math.min(n - 2, 60);
  const rhoHat: number[] = [1];

  for (let lag = 1; lag <= maxLag; lag++) {
    let meanGamma = 0;
    for (let c = 0; c < m; c++) {
      let acov = 0;
      const ch = chains[c];
      const mu = chainMeans[c];
      for (let t = 0; t < n - lag; t++) {
        acov += (ch[t] - mu) * (ch[t + lag] - mu);
      }
      meanGamma += acov / n;
    }
    meanGamma /= m;
    const rho = 1 - (W - meanGamma) / Math.max(1e-16, varPlus);
    rhoHat.push(Math.max(-1, Math.min(1, rho)));
  }

  // Geyer Initial Positive Sequence (pairwise sums)
  let tau = -1;
  for (let k = 0; k + 1 < rhoHat.length; k += 2) {
    const pairSum = rhoHat[k] + rhoHat[k + 1];
    if (pairSum <= 0) break;
    tau += 2 * pairSum;
  }
  tau = Math.max(1, tau);
  return Math.max(1, Math.min(m * n, Math.round((m * n) / tau)));
}

function buildDensityHistogram(allDraws: number[], bins = 24): Array<{ x: number; density: number }> {
  if (allDraws.length === 0) return [];
  const min = Math.min(...allDraws);
  const max = Math.max(...allDraws);
  if (max - min < 1e-12) {
    return [{ x: min, density: 1 }];
  }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  allDraws.forEach(v => {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[idx]++;
  });
  const total = allDraws.length * width;
  return counts.map((c, i) => ({
    x: min + (i + 0.5) * width,
    density: c / Math.max(1e-12, total)
  }));
}

function summarizeChains(
  name: string,
  label: string,
  group: MCMCParameterSummary['group'],
  chains: number[][],
  ciLevel: number,
  isFixed = false
): MCMCParameterSummary {
  const flat = chains.flat();
  const n = flat.length || 1;
  const mean = flat.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? flat.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(Math.max(0, variance));
  const sorted = [...flat].sort((a, b) => a - b);
  const alphaTail = (1 - ciLevel) / 2;
  const ciLower = quantileSorted(sorted, alphaTail);
  const ciUpper = quantileSorted(sorted, 1 - alphaTail);
  const median = quantileSorted(sorted, 0.5);

  const rHat = isFixed ? 1.0 : computeSplitRHat(chains);
  const essBulk = isFixed ? flat.length : computeGeyerESS(chains);

  // Tail ESS via indicator draws at 5% and 95% quantiles
  let essTail = essBulk;
  if (!isFixed) {
    const q05 = quantileSorted(sorted, 0.05);
    const q95 = quantileSorted(sorted, 0.95);
    const tailLow = chains.map(ch => ch.map(v => (v <= q05 ? 1 : 0)));
    const tailHigh = chains.map(ch => ch.map(v => (v >= q95 ? 1 : 0)));
    essTail = Math.min(computeGeyerESS(tailLow), computeGeyerESS(tailHigh));
  }

  const mcse = sd / Math.sqrt(Math.max(1, essBulk));

  // Downsample traces cleanly for UI charts (max 150 points per chain)
  const downsample = (arr: number[]) => {
    if (arr.length <= 150) return arr;
    const step = arr.length / 150;
    const out: number[] = [];
    for (let i = 0; i < 150; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  };

  return {
    name,
    label,
    group,
    mean,
    sd,
    median,
    ciLower,
    ciUpper,
    rHat,
    essBulk,
    essTail,
    mcse,
    isFixed,
    chainTraces: chains.map(downsample),
    densityBins: isFixed ? [{ x: mean, density: 1 }] : buildDensityHistogram(flat)
  };
}

// ---------------- Core Single-Spec MCMC Engine ----------------

interface RawMCMCOutput {
  alphaChains: number[][][]; // [3][chain][draw]
  lambdaChains: number[][][]; // [3][chain][draw]
  sigmaEpsChains: number[][][]; // [3][chain][draw]
  muChains: number[][];
  sigmaEtaChains: number[][];
  sigmaUChains: number[][];
  sigmaGammaChains: number[][];
  rhoChains: number[][];
  latentSum: number[]; // per obs
  latentSqSum: number[];
  latentChainMeans: number[][]; // [obs][chain] (split-RHat for latent estimates)
  latentDrawsSample: number[][]; // [obs][sampled draws <= 400] for exact CI
  residualSums: [number[], number[], number[]]; // per source per obs
  pointLogLikSum: number[]; // per obs
  pointLogLikSqSum: number[];
  repMeansPerDraw: [number[], number[], number[]];
  repSdsPerDraw: [number[], number[], number[]];
  obsMeans: [number, number, number];
  obsSds: [number, number, number];
  totalDraws: number;
  numericalWarnings: number;
  ar1ActuallyActive: boolean;
  ar1SkippedReason?: string;
}

function runCoreMCMCSampler(
  observations: CleanedLatentObservation[],
  citiesCount: number,
  yearsCount: number,
  spec: PanelLatentModelSpec
): RawMCMCOutput {
  const nObs = observations.length;
  const anchorIdx = spec.anchorSource === 'X1' ? 0 : spec.anchorSource === 'X2' ? 1 : 2;
  const prior = getPriorHyperparams(spec.priorRegime);

  // Determine working scale factor S0 for numerical stability across units
  const getSourceArr = (j: 0 | 1 | 2) =>
    observations
      .map(o => (j === 0 ? o.x1 : j === 1 ? o.x2 : o.x3))
      .filter((v): v is number => v !== null);

  const anchorArr = getSourceArr(anchorIdx as 0 | 1 | 2);
  const allValid = [...getSourceArr(0), ...getSourceArr(1), ...getSourceArr(2)];
  const baseArr = anchorArr.length >= 2 ? anchorArr : allValid;
  const baseMean = baseArr.reduce((a, b) => a + b, 0) / Math.max(1, baseArr.length);
  const baseVar =
    baseArr.length > 1
      ? baseArr.reduce((s, v) => s + (v - baseMean) ** 2, 0) / (baseArr.length - 1)
      : 1;
  const S0 = Math.sqrt(Math.max(1e-8, baseVar));

  // Center around baseMean and scale by S0 for scale/shift-invariant MCMC conditioning (crucial for log1p/multi-scale data)
  const xWork: [Array<number | null>, Array<number | null>, Array<number | null>] = [
    observations.map(o => (o.x1 === null ? null : (o.x1 - baseMean) / S0)),
    observations.map(o => (o.x2 === null ? null : (o.x2 - baseMean) / S0)),
    observations.map(o => (o.x3 === null ? null : (o.x3 - baseMean) / S0))
  ];
  const seWork: [number[], number[], number[]] = [
    observations.map(o => o.se1 / S0),
    observations.map(o => o.se2 / S0),
    observations.map(o => o.se3 / S0)
  ];

  // Group observations per city sorted chronologically for AR(1) and random intercepts
  const cityObsIndices: number[][] = Array.from({ length: citiesCount }, () => []);
  const yearObsIndices: number[][] = Array.from({ length: yearsCount }, () => []);
  observations.forEach((o, k) => {
    cityObsIndices[o.cityIdx].push(k);
    yearObsIndices[o.yearIdx].push(k);
  });

  // Check AR(1) validity (needs >= 3 distinct years)
  let ar1Active = spec.includeAR1 && yearsCount >= 3;
  let ar1SkippedReason: string | undefined;
  if (spec.includeAR1 && yearsCount < 3) {
    ar1Active = false;
    ar1SkippedReason = `Komponen AR(1) otomatis dinonaktifkan karena jumlah periode T = ${yearsCount} < 3.`;
  }

  // Initial row-wise average proxy for dispersed MCMC initialization (centered around 0)
  const yProxy = observations.map((_, k) => {
    const vals: number[] = [];
    if (xWork[0][k] !== null) vals.push(xWork[0][k]!);
    if (xWork[1][k] !== null) vals.push(xWork[1][k]!);
    if (xWork[2][k] !== null) vals.push(xWork[2][k]!);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  const chains = Math.max(2, Math.min(8, spec.chains || 4));
  const warmup = Math.max(100, spec.warmup || 500);
  const draws = Math.max(100, spec.draws || 500);
  const totalIter = warmup + draws;

  const alphaChains: number[][][] = [0, 1, 2].map(() => Array.from({ length: chains }, () => []));
  const lambdaChains: number[][][] = [0, 1, 2].map(() => Array.from({ length: chains }, () => []));
  const sigmaEpsChains: number[][][] = [0, 1, 2].map(() => Array.from({ length: chains }, () => []));
  const muChains: number[][] = Array.from({ length: chains }, () => []);
  const sigmaEtaChains: number[][] = Array.from({ length: chains }, () => []);
  const sigmaUChains: number[][] = Array.from({ length: chains }, () => []);
  const sigmaGammaChains: number[][] = Array.from({ length: chains }, () => []);
  const rhoChains: number[][] = Array.from({ length: chains }, () => []);

  const latentSum = new Array(nObs).fill(0);
  const latentSqSum = new Array(nObs).fill(0);
  const latentChainMeans: number[][] = Array.from({ length: nObs }, () => new Array(chains).fill(0));
  const latentDrawsSample: number[][] = Array.from({ length: nObs }, () => []);
  const sampleStride = Math.max(1, Math.floor((chains * draws) / 400));

  const residualSums: [number[], number[], number[]] = [
    new Array(nObs).fill(0),
    new Array(nObs).fill(0),
    new Array(nObs).fill(0)
  ];

  const pointLogLikSum = new Array(nObs).fill(0);
  const pointLogLikSqSum = new Array(nObs).fill(0);
  const repMeansPerDraw: [number[], number[], number[]] = [[], [], []];
  const repSdsPerDraw: [number[], number[], number[]] = [[], [], []];

  // Empirical observed means & SDs on original scale (to compare PPC)
  const obsMeans: [number, number, number] = [0, 0, 0];
  const obsSds: [number, number, number] = [0, 0, 0];
  ([0, 1, 2] as const).forEach(j => {
    const arr = getSourceArr(j);
    const m = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const v = arr.length > 1 ? arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1) : 1;
    obsMeans[j] = m;
    obsSds[j] = Math.sqrt(Math.max(1e-12, v));
  });

  let numericalWarnings = 0;
  let globalDrawCounter = 0;
  const nu = Math.max(2.5, spec.studentTDf || 5);

  // Method-of-moments 3-indicator triad initializer for fast, well-conditioned chain warm start
  const pairCov = (a: 0 | 1 | 2, b: 0 | 1 | 2): number => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < nObs; k++) {
      const va = xWork[a][k];
      const vb = xWork[b][k];
      if (va !== null && vb !== null) {
        xs.push(va);
        ys.push(vb);
      }
    }
    if (xs.length < 3) return 0.5;
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let c = 0;
    for (let i = 0; i < xs.length; i++) c += (xs[i] - mx) * (ys[i] - my);
    return c / Math.max(1, xs.length - 1);
  };
  const c12 = Math.max(1e-4, pairCov(0, 1));
  const c13 = Math.max(1e-4, pairCov(0, 2));
  const c23 = Math.max(1e-4, pairCov(1, 2));
  const cXX = [0, 1, 2].map(j => {
    const arr = xWork[j].filter((v): v is number => v !== null);
    if (arr.length < 3) return 1.0;
    const m = arr.reduce((s, v) => s + v, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length - 1);
  });
  const sigInit = [
    Math.max(1e-4, (c12 * c13) / c23),
    Math.max(1e-4, (c12 * c23) / c13),
    Math.max(1e-4, (c13 * c23) / c12)
  ];
  const momErrVar = [0, 1, 2].map(j => Math.min(2.0, Math.max(0.003, cXX[j] - sigInit[j])));
  const momLam = [0, 1, 2].map(j => Math.min(4.0, Math.max(0.25, Math.sqrt(sigInit[j] / sigInit[anchorIdx]))));

  // Exact Kalman-marginal log-posterior of log-variances integrating out latent Y*_{it}
  const marginalVarianceLogPost = (
    candEpsSq: number[],
    candEtaSq: number,
    alphaCur: number[],
    lambdaCur: number[],
    muCur: number,
    uCur: number[],
    gammaCur: number[],
    rhoCur: number,
    omegaCur: [number[], number[], number[]]
  ): number => {
    const oneMR2 = ar1Active ? Math.max(1e-4, 1 - rhoCur * rhoCur) : 1;
    let lp =
      0.5 * Math.log(candEtaSq) - Math.log(candEtaSq + prior.cauchyStrucScale * prior.cauchyStrucScale);
    for (let j = 0; j < 3; j++) {
      lp += 0.5 * Math.log(candEpsSq[j]) - Math.log(candEpsSq[j] + prior.cauchyErrScale * prior.cauchyErrScale);
    }

    for (let ci = 0; ci < citiesCount; ci++) {
      const idxs = cityObsIndices[ci];
      let m = 0;
      let v = candEtaSq / oneMR2;

      for (let pos = 0; pos < idxs.length; pos++) {
        const k = idxs[pos];
        const obs = observations[k];
        const base = muCur + uCur[ci] + gammaCur[obs.yearIdx];

        if (pos > 0) {
          if (ar1Active) {
            const kPrev = idxs[pos - 1];
            const dt = Math.max(1, obs.year - observations[kPrev].year);
            const rD = Math.pow(rhoCur, dt);
            m = rD * m;
            v = rD * rD * v + candEtaSq * ((1 - rD * rD) / oneMR2);
          } else {
            m = 0;
            v = candEtaSq;
          }
        }

        let tauEff = 0;
        let numEff = 0;
        let sumLogV = 0;
        let sumTauR2 = 0;
        for (let j = 0; j < 3; j++) {
          const xVal = xWork[j][k];
          if (xVal === null) continue;
          const vjk = Math.max(1e-8, candEpsSq[j] / omegaCur[j][k] + seWork[j][k] * seWork[j][k]);
          const tau = 1 / vjk;
          const r = xVal - (alphaCur[j] + lambdaCur[j] * base);
          tauEff += tau * lambdaCur[j] * lambdaCur[j];
          numEff += tau * lambdaCur[j] * r;
          sumLogV += Math.log(vjk);
          sumTauR2 += tau * r * r;
        }

        const priorPrec = 1 / Math.max(1e-8, v);
        const sPrec = priorPrec + tauEff;
        const postMeanNum = m * priorPrec + numEff;
        lp += -0.5 * (sumLogV + Math.log(Math.max(1e-12, v * sPrec)) + sumTauR2 + m * m * priorPrec - (postMeanNum * postMeanNum) / sPrec);

        m = postMeanNum / sPrec;
        v = 1 / sPrec;
      }
    }
    return lp;
  };

  for (let c = 0; c < chains; c++) {
    const rng = new SeededRandom((spec.seed || 20261113) + c * 9973);

    // Overdispersed initial states around triad method-of-moments estimate
    const alpha = [0, 1, 2].map(j =>
      spec.identification === 'anchor' && j === anchorIdx
        ? 0
        : spec.sourceSpecificBias
        ? rng.normal(0, 0.15)
        : 0
    );
    const lambda = [0, 1, 2].map(j =>
      spec.identification === 'anchor' && j === anchorIdx
        ? 1
        : spec.sourceSpecificLoading
        ? Math.max(0.2, momLam[j] * Math.exp(rng.normal(0, 0.12)))
        : 1.0
    );
    const sigmaEpsSq = [0, 1, 2].map(j => Math.max(1e-4, momErrVar[j] * Math.exp(rng.normal(0, 0.25))));
    const aEps = [1.0, 1.0, 1.0];

    let mu = spec.identification === 'standardized' ? 0 : rng.normal(0, 0.3);
    const u = new Array(citiesCount).fill(0).map(() => (spec.includeCityIntercept ? rng.normal(0, 0.2) : 0));
    const gamma = new Array(yearsCount).fill(0).map(() => (spec.includeTimeEffect ? rng.normal(0, 0.15) : 0));

    let sigmaEtaSq = 0.25 + rng.next() * 0.3;
    let aEta = 1.0;
    let sigmaUSq = 0.25 + rng.next() * 0.25;
    let aU = 1.0;
    let sigmaGammaSq = 0.15 + rng.next() * 0.2;
    let aGamma = 1.0;
    let rho = ar1Active ? rng.normal(0.3, 0.2) : 0;
    rho = Math.max(-0.85, Math.min(0.85, rho));

    const yStar = yProxy.map(v => v + rng.normal(0, 0.15));
    const omega: [number[], number[], number[]] = [
      new Array(nObs).fill(1),
      new Array(nObs).fill(1),
      new Array(nObs).fill(1)
    ];

    const chainLatentSum = new Array(nObs).fill(0);

    for (let iter = 0; iter < totalIter; iter++) {
      // 1. Update Student-t latent precision scale-mixture omega_{j,k}
      if (spec.likelihood === 'student_t') {
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < nObs; k++) {
            const xVal = xWork[j][k];
            if (xVal === null) continue;
            const resid = xVal - (alpha[j] + lambda[j] * yStar[k]);
            const scaleTotal = Math.max(1e-8, sigmaEpsSq[j] + seWork[j][k] * seWork[j][k]);
            omega[j][k] = rng.gamma((nu + 1) / 2, (nu + (resid * resid) / scaleTotal) / 2);
          }
        }
      }

      // 1b. Collapsed MH update on (sigmaEpsSq[0..2], sigmaEtaSq) integrating out Y*_{it}
      //     Includes a joint anti-correlated ridge move on (sigma_eps_anchor, sigma_eta) for Normal likelihood
      {
        let curVarLp = marginalVarianceLogPost(sigmaEpsSq, sigmaEtaSq, alpha, lambda, mu, u, gamma, rho, omega);
        if (spec.likelihood === 'normal') {
          const ridgeDelta = rng.normal(0, 0.28);
          const propSqRidge = [...sigmaEpsSq];
          propSqRidge[anchorIdx] = Math.min(25, Math.max(1e-5, sigmaEpsSq[anchorIdx] * Math.exp(ridgeDelta)));
          const propEtaRidge = Math.min(25, Math.max(1e-5, sigmaEtaSq * Math.exp(-ridgeDelta)));
          const propRidgeLp = marginalVarianceLogPost(propSqRidge, propEtaRidge, alpha, lambda, mu, u, gamma, rho, omega);
          if (Math.log(Math.max(1e-12, rng.next())) < propRidgeLp - curVarLp) {
            sigmaEpsSq[anchorIdx] = propSqRidge[anchorIdx];
            sigmaEtaSq = propEtaRidge;
            curVarLp = propRidgeLp;
          }
        }
        for (let j = 0; j < 3; j++) {
          const propSq = [...sigmaEpsSq];
          propSq[j] = Math.min(25, Math.max(1e-5, sigmaEpsSq[j] * Math.exp(rng.normal(0, 0.25))));
          const propLp = marginalVarianceLogPost(propSq, sigmaEtaSq, alpha, lambda, mu, u, gamma, rho, omega);
          if (Math.log(Math.max(1e-12, rng.next())) < propLp - curVarLp) {
            sigmaEpsSq[j] = propSq[j];
            curVarLp = propLp;
          }
        }
        const propEta = Math.min(25, Math.max(1e-5, sigmaEtaSq * Math.exp(rng.normal(0, 0.22))));
        const propEtaLp = marginalVarianceLogPost(sigmaEpsSq, propEta, alpha, lambda, mu, u, gamma, rho, omega);
        if (Math.log(Math.max(1e-12, rng.next())) < propEtaLp - curVarLp) {
          sigmaEtaSq = propEta;
        }
      }

      // 2. Update Latent Y*_{it}
      if (!ar1Active) {
        const priorPrec = 1 / Math.max(1e-8, sigmaEtaSq);
        for (let k = 0; k < nObs; k++) {
          const obs = observations[k];
          let measPrec = 0;
          let measMeanNum = 0;
          for (let j = 0; j < 3; j++) {
            const xVal = xWork[j][k];
            if (xVal === null) continue;
            const varJK = Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k]);
            const tauJK = 1 / varJK;
            measPrec += tauJK * lambda[j] * lambda[j];
            measMeanNum += tauJK * lambda[j] * (xVal - alpha[j]);
          }
          const base = mu + u[obs.cityIdx] + gamma[obs.yearIdx];
          const postVar = 1 / (measPrec + priorPrec);
          const postMean = postVar * (measMeanNum + base * priorPrec);
          yStar[k] = rng.normal(postMean, Math.sqrt(postVar));
        }
      } else {
        // Exact AR(1) conditional updates per city
        const oneMinusRho2 = Math.max(1e-4, 1 - rho * rho);
        for (let ci = 0; ci < citiesCount; ci++) {
          const idxs = cityObsIndices[ci];
          for (let pos = 0; pos < idxs.length; pos++) {
            const k = idxs[pos];
            const obs = observations[k];
            const base = mu + u[ci] + gamma[obs.yearIdx];

            let measPrec = 0;
            let measMeanNum = 0;
            for (let j = 0; j < 3; j++) {
              const xVal = xWork[j][k];
              if (xVal === null) continue;
              const varJK = Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k]);
              const tauJK = 1 / varJK;
              measPrec += tauJK * lambda[j] * lambda[j];
              measMeanNum += tauJK * lambda[j] * (xVal - alpha[j]);
            }

            let priorPrec = 0;
            let priorNum = 0;
            if (pos === 0) {
              const p0 = oneMinusRho2 / Math.max(1e-8, sigmaEtaSq);
              priorPrec += p0;
              priorNum += p0 * base;
            } else {
              const kPrev = idxs[pos - 1];
              const obsPrev = observations[kPrev];
              const dt = Math.max(1, obs.year - obsPrev.year);
              const rhoD = Math.pow(rho, dt);
              const vD = Math.max(1e-8, sigmaEtaSq * ((1 - rhoD * rhoD) / oneMinusRho2));
              const predMean = base + rhoD * (yStar[kPrev] - (mu + u[ci] + gamma[obsPrev.yearIdx]));
              priorPrec += 1 / vD;
              priorNum += predMean / vD;
            }

            if (pos + 1 < idxs.length) {
              const kNext = idxs[pos + 1];
              const obsNext = observations[kNext];
              const dt = Math.max(1, obsNext.year - obs.year);
              const rhoD = Math.pow(rho, dt);
              const vD = Math.max(1e-8, sigmaEtaSq * ((1 - rhoD * rhoD) / oneMinusRho2));
              const dNext = yStar[kNext] - (mu + u[ci] + gamma[obsNext.yearIdx]);
              priorPrec += (rhoD * rhoD) / vD;
              priorNum += (rhoD * (dNext + rhoD * base)) / vD;
            }

            const postVar = 1 / Math.max(1e-8, measPrec + priorPrec);
            const postMean = postVar * (measMeanNum + priorNum);
            yStar[k] = rng.normal(postMean, Math.sqrt(postVar));
          }
        }
      }

      // 3. Parameter-Expanded (PX) projection for standardized factor identification
      if (spec.identification === 'standardized') {
        const yMean = yStar.reduce((a, b) => a + b, 0) / Math.max(1, nObs);
        const ySd = Math.sqrt(
          Math.max(1e-6, yStar.reduce((s, v) => s + (v - yMean) ** 2, 0) / Math.max(1, nObs - 1))
        );
        for (let k = 0; k < nObs; k++) yStar[k] = (yStar[k] - yMean) / ySd;
        for (let ci = 0; ci < citiesCount; ci++) u[ci] /= ySd;
        for (let ti = 0; ti < yearsCount; ti++) gamma[ti] /= ySd;
        mu = 0;
        for (let j = 0; j < 3; j++) {
          alpha[j] += lambda[j] * yMean;
          lambda[j] = Math.max(0.05, lambda[j] * ySd);
        }
        sigmaEtaSq = Math.max(1e-4, sigmaEtaSq / (ySd * ySd));
        sigmaUSq = Math.max(1e-4, sigmaUSq / (ySd * ySd));
        sigmaGammaSq = Math.max(1e-4, sigmaGammaSq / (ySd * ySd));
      }

      // 4. Update alpha_j & lambda_j
      for (let j = 0; j < 3; j++) {
        const isAnchored = spec.identification === 'anchor' && j === anchorIdx;
        if (isAnchored) {
          alpha[j] = 0;
          lambda[j] = 1;
          continue;
        }

        // Joint 2x2 collapsed block update for (alpha_j, lambda_j)
        if (spec.sourceSpecificBias && spec.sourceSpecificLoading) {
          const priorMeanA = 0;
          const priorPrecA = 1 / ((prior.tauAlpha + (spec.identification === 'standardized' ? 2.0 : 0)) ** 2);
          const priorPrecL = 1 / (prior.tauLambda * prior.tauLambda);

          let sumTau = 0;
          let sumTauY = 0;
          let sumTauY2 = 0;
          let sumTauX = 0;
          let sumTauYX = 0;
          for (let k = 0; k < nObs; k++) {
            const xVal = xWork[j][k];
            if (xVal === null) continue;
            const tauJK = 1 / Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k]);
            const yk = yStar[k];
            sumTau += tauJK;
            sumTauY += tauJK * yk;
            sumTauY2 += tauJK * yk * yk;
            sumTauX += tauJK * xVal;
            sumTauYX += tauJK * yk * xVal;
          }

          const p11 = sumTau + priorPrecA;
          const p12 = sumTauY;
          const p22 = sumTauY2 + priorPrecL;
          const h1 = sumTauX + priorMeanA * priorPrecA;
          const h2 = sumTauYX + 1.0 * priorPrecL;
          const det = Math.max(1e-12, p11 * p22 - p12 * p12);

          const v22 = p11 / det;
          const mLambda = (p11 * h2 - p12 * h1) / det;
          lambda[j] = rng.truncatedNormalLower(mLambda, Math.sqrt(Math.max(1e-10, v22)), 0.05);

          const condMeanA = (h1 - p12 * lambda[j]) / p11;
          alpha[j] = rng.normal(condMeanA, Math.sqrt(1 / p11));
        } else {
          // Single-parameter constrained conditional updates
          if (spec.sourceSpecificBias) {
            const priorMeanA = 0;
            const priorPrecA = 1 / ((prior.tauAlpha + (spec.identification === 'standardized' ? 2.0 : 0)) ** 2);
            let sumTau = 0;
            let sumTauRes = 0;
            for (let k = 0; k < nObs; k++) {
              const xVal = xWork[j][k];
              if (xVal === null) continue;
              const tauJK = 1 / Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k]);
              sumTau += tauJK;
              sumTauRes += tauJK * (xVal - lambda[j] * yStar[k]);
            }
            const postVarA = 1 / (sumTau + priorPrecA);
            alpha[j] = rng.normal(postVarA * (sumTauRes + priorMeanA * priorPrecA), Math.sqrt(postVarA));
          } else {
            alpha[j] = 0;
          }

          if (spec.sourceSpecificLoading) {
            const priorPrecL = 1 / (prior.tauLambda * prior.tauLambda);
            let sumTauY2 = 0;
            let sumTauYRes = 0;
            for (let k = 0; k < nObs; k++) {
              const xVal = xWork[j][k];
              if (xVal === null) continue;
              const tauJK = 1 / Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k]);
              const yk = yStar[k];
              sumTauY2 += tauJK * yk * yk;
              sumTauYRes += tauJK * yk * (xVal - alpha[j]);
            }
            const postVarL = 1 / (sumTauY2 + priorPrecL);
            lambda[j] = rng.truncatedNormalLower(postVarL * (sumTauYRes + 1.0 * priorPrecL), Math.sqrt(postVarL), 0.05);
          } else {
            lambda[j] = 1.0;
          }
        }
      }

      // 5. Update measurement error variance sigma_{eps,j}^2 via Half-Cauchy auxiliary scale mixture
      for (let j = 0; j < 3; j++) {
        let rss = 0;
        let countJ = 0;
        for (let k = 0; k < nObs; k++) {
          const xVal = xWork[j][k];
          if (xVal === null) continue;
          const r = xVal - (alpha[j] + lambda[j] * yStar[k]);
          rss += omega[j][k] * r * r;
          countJ++;
        }
        sigmaEpsSq[j] = Math.max(
          1e-5,
          rng.invGamma(0.5 * (countJ + 1), 1 / Math.max(1e-6, aEps[j]) + 0.5 * rss)
        );
        aEps[j] = rng.invGamma(1.0, 1 / (prior.cauchyErrScale * prior.cauchyErrScale) + 1 / sigmaEpsSq[j]);
      }

      // 6. Update hierarchical panel terms: mu, u_i, gamma_t
      if (spec.identification === 'anchor') {
        const priorPrecMu = 1 / 16.0;
        let sumPrec = 0;
        let sumNum = 0;
        const pEta = 1 / Math.max(1e-8, sigmaEtaSq);
        for (let k = 0; k < nObs; k++) {
          const obs = observations[k];
          sumPrec += pEta;
          sumNum += pEta * (yStar[k] - u[obs.cityIdx] - gamma[obs.yearIdx]);
        }
        const postVarMu = 1 / (sumPrec + priorPrecMu);
        const postMeanMu = postVarMu * sumNum;
        mu = rng.normal(postMeanMu, Math.sqrt(postVarMu));
      } else {
        mu = 0;
      }

      if (spec.includeCityIntercept) {
        const pU = 1 / Math.max(1e-8, sigmaUSq);
        const pEta = 1 / Math.max(1e-8, sigmaEtaSq);
        for (let ci = 0; ci < citiesCount; ci++) {
          const idxs = cityObsIndices[ci];
          let sumRes = 0;
          for (let q = 0; q < idxs.length; q++) {
            const k = idxs[q];
            sumRes += yStar[k] - mu - gamma[observations[k].yearIdx];
          }
          const postVarU = 1 / (idxs.length * pEta + pU);
          const postMeanU = postVarU * (pEta * sumRes);
          u[ci] = rng.normal(postMeanU, Math.sqrt(postVarU));
        }
        const uMean = u.reduce((a, b) => a + b, 0) / Math.max(1, citiesCount);
        for (let ci = 0; ci < citiesCount; ci++) u[ci] -= uMean;
        if (spec.identification === 'anchor') mu += uMean;

        const sumU2 = u.reduce((s, v) => s + v * v, 0);
        sigmaUSq = Math.max(1e-5, rng.invGamma(0.5 * (citiesCount + 1), 1 / aU + 0.5 * sumU2));
        aU = rng.invGamma(1.0, 1 / (prior.cauchyStrucScale * prior.cauchyStrucScale) + 1 / sigmaUSq);
      } else {
        u.fill(0);
      }

      if (spec.includeTimeEffect) {
        const pG = 1 / Math.max(1e-8, sigmaGammaSq);
        const pEta = 1 / Math.max(1e-8, sigmaEtaSq);
        for (let ti = 0; ti < yearsCount; ti++) {
          const idxs = yearObsIndices[ti];
          let sumRes = 0;
          for (let q = 0; q < idxs.length; q++) {
            const k = idxs[q];
            sumRes += yStar[k] - mu - u[observations[k].cityIdx];
          }
          const postVarG = 1 / (idxs.length * pEta + pG);
          const postMeanG = postVarG * (pEta * sumRes);
          gamma[ti] = rng.normal(postMeanG, Math.sqrt(postVarG));
        }
        const gMean = gamma.reduce((a, b) => a + b, 0) / Math.max(1, yearsCount);
        for (let ti = 0; ti < yearsCount; ti++) gamma[ti] -= gMean;
        if (spec.identification === 'anchor') mu += gMean;

        const sumG2 = gamma.reduce((s, v) => s + v * v, 0);
        sigmaGammaSq = Math.max(1e-5, rng.invGamma(0.5 * (yearsCount + 1), 1 / aGamma + 0.5 * sumG2));
        aGamma = rng.invGamma(1.0, 1 / (prior.cauchyStrucScale * prior.cauchyStrucScale) + 1 / sigmaGammaSq);
      } else {
        gamma.fill(0);
      }

      // 7. Update AR(1) rho (if active) and latent innovation variance sigma_eta^2
      const arLogPost = (rCandidate: number): number => {
        if (Math.abs(rCandidate) >= 0.97) return -Infinity;
        const oneMR2 = 1 - rCandidate * rCandidate;
        let lp = -0.5 * ((rCandidate * rCandidate) / (prior.rhoPriorSd * prior.rhoPriorSd));
        for (let ci = 0; ci < citiesCount; ci++) {
          const idxs = cityObsIndices[ci];
          if (idxs.length === 0) continue;
          const k0 = idxs[0];
          const d0 = yStar[k0] - mu - u[ci] - gamma[observations[k0].yearIdx];
          lp += 0.5 * Math.log(oneMR2) - 0.5 * (oneMR2 / sigmaEtaSq) * d0 * d0;
          for (let pos = 1; pos < idxs.length; pos++) {
            const kp = idxs[pos - 1];
            const kc = idxs[pos];
            const dt = Math.max(1, observations[kc].year - observations[kp].year);
            const rD = Math.pow(rCandidate, dt);
            const vD = Math.max(1e-8, sigmaEtaSq * ((1 - rD * rD) / oneMR2));
            const dp = yStar[kp] - mu - u[ci] - gamma[observations[kp].yearIdx];
            const dc = yStar[kc] - mu - u[ci] - gamma[observations[kc].yearIdx];
            const innov = dc - rD * dp;
            lp += -0.5 * Math.log(vD) - 0.5 * ((innov * innov) / vD);
          }
        }
        return lp;
      };

      if (ar1Active) {
        let curLp = arLogPost(rho);
        for (let mh = 0; mh < 3; mh++) {
          const prop = rho + rng.normal(0, 0.12);
          const propLp = arLogPost(prop);
          if (Math.log(Math.max(1e-12, rng.next())) < propLp - curLp) {
            rho = prop;
            curLp = propLp;
          }
        }
      } else {
        rho = 0;
      }

      let ssEta = 0;
      let countEta = 0;
      if (!ar1Active) {
        for (let k = 0; k < nObs; k++) {
          const obs = observations[k];
          const d = yStar[k] - mu - u[obs.cityIdx] - gamma[obs.yearIdx];
          ssEta += d * d;
          countEta++;
        }
      } else {
        const oneMR2 = Math.max(1e-4, 1 - rho * rho);
        for (let ci = 0; ci < citiesCount; ci++) {
          const idxs = cityObsIndices[ci];
          if (idxs.length === 0) continue;
          const k0 = idxs[0];
          const d0 = yStar[k0] - mu - u[ci] - gamma[observations[k0].yearIdx];
          ssEta += oneMR2 * d0 * d0;
          countEta++;
          for (let pos = 1; pos < idxs.length; pos++) {
            const kp = idxs[pos - 1];
            const kc = idxs[pos];
            const dt = Math.max(1, observations[kc].year - observations[kp].year);
            const rD = Math.pow(rho, dt);
            const factor = oneMR2 / Math.max(1e-4, 1 - rD * rD);
            const dp = yStar[kp] - mu - u[ci] - gamma[observations[kp].yearIdx];
            const dc = yStar[kc] - mu - u[ci] - gamma[observations[kc].yearIdx];
            const innov = dc - rD * dp;
            ssEta += factor * innov * innov;
            countEta++;
          }
        }
      }

      sigmaEtaSq = Math.max(1e-5, rng.invGamma(0.5 * (countEta + 1), 1 / aEta + 0.5 * ssEta));
      aEta = rng.invGamma(1.0, 1 / (prior.cauchyStrucScale * prior.cauchyStrucScale) + 1 / sigmaEtaSq);

      // Check finite state
      if (!Number.isFinite(mu) || !Number.isFinite(sigmaEtaSq) || sigmaEpsSq.some(v => !Number.isFinite(v))) {
        numericalWarnings++;
        continue;
      }

      // Store post-warmup draws transformed cleanly back to working data units (baseMean + × S0)
      if (iter >= warmup) {
        const yShift = spec.identification === 'anchor' ? baseMean : 0;
        for (let j = 0; j < 3; j++) {
          const alphaData =
            spec.identification === 'anchor'
              ? alpha[j] * S0 + (1 - lambda[j]) * baseMean
              : alpha[j] * S0 + baseMean;
          alphaChains[j][c].push(alphaData);
          lambdaChains[j][c].push(lambda[j]);
          sigmaEpsChains[j][c].push(Math.sqrt(sigmaEpsSq[j]) * S0);
        }
        muChains[c].push(spec.identification === 'anchor' ? mu * S0 + baseMean : 0);
        sigmaEtaChains[c].push(Math.sqrt(sigmaEtaSq) * S0);
        sigmaUChains[c].push(Math.sqrt(sigmaUSq) * S0);
        sigmaGammaChains[c].push(Math.sqrt(sigmaGammaSq) * S0);
        rhoChains[c].push(rho);

        const keepSample = globalDrawCounter % sampleStride === 0;
        globalDrawCounter++;

        // Accumulate latent draws, residuals, and pointwise log-likelihood for WAIC
        const repBuckets: [number[], number[], number[]] = [[], [], []];
        for (let k = 0; k < nObs; k++) {
          const yOrig = yStar[k] * S0 + yShift;
          latentSum[k] += yOrig;
          latentSqSum[k] += yOrig * yOrig;
          chainLatentSum[k] += yOrig;
          if (keepSample) latentDrawsSample[k].push(yOrig);

          let llObs = 0;
          for (let j = 0; j < 3; j++) {
            const xVal = xWork[j][k];
            if (xVal === null) continue;
            const predOrig = (alpha[j] + lambda[j] * yStar[k]) * S0 + baseMean;
            const xOrig = xVal * S0 + baseMean;
            const err = xOrig - predOrig;
            residualSums[j][k] += err;

            const sdOrig = Math.sqrt(Math.max(1e-8, sigmaEpsSq[j] / omega[j][k] + seWork[j][k] * seWork[j][k])) * S0;
            llObs += -0.5 * Math.log(2 * Math.PI * sdOrig * sdOrig) - 0.5 * ((err * err) / (sdOrig * sdOrig));

            // Generate posterior predictive draw X^{rep}_{j,k}
            const rep = predOrig + rng.normal(0, sdOrig);
            repBuckets[j].push(rep);
          }
          pointLogLikSum[k] += llObs;
          pointLogLikSqSum[k] += llObs * llObs;
        }

        ([0, 1, 2] as const).forEach(j => {
          const arr = repBuckets[j];
          if (arr.length > 1) {
            const rm = arr.reduce((a, b) => a + b, 0) / arr.length;
            const rsd = Math.sqrt(arr.reduce((s, v) => s + (v - rm) ** 2, 0) / (arr.length - 1));
            repMeansPerDraw[j].push(rm);
            repSdsPerDraw[j].push(rsd);
          }
        });
      }
    }

    for (let k = 0; k < nObs; k++) {
      latentChainMeans[k][c] = chainLatentSum[k] / draws;
    }
  }

  return {
    alphaChains,
    lambdaChains,
    sigmaEpsChains,
    muChains,
    sigmaEtaChains,
    sigmaUChains,
    sigmaGammaChains,
    rhoChains,
    latentSum,
    latentSqSum,
    latentChainMeans,
    latentDrawsSample,
    residualSums,
    pointLogLikSum,
    pointLogLikSqSum,
    repMeansPerDraw,
    repSdsPerDraw,
    obsMeans,
    obsSds,
    totalDraws: chains * draws,
    numericalWarnings,
    ar1ActuallyActive: ar1Active,
    ar1SkippedReason
  };
}

// ---------------- Public Orchestrator & Diagnostics ----------------

export function runPanelLatentBayesianAnalysis(
  observations: CleanedLatentObservation[],
  cities: string[],
  years: number[],
  mapping: PanelLatentMapping,
  preprocessing: PanelLatentPreprocessingOptions,
  spec: PanelLatentModelSpec,
  scaleContext: {
    wasLog1p: boolean;
    wasStandardized: boolean;
    meansBeforeStd: Record<MeasurementSourceKey, number>;
    sdsBeforeStd: Record<MeasurementSourceKey, number>;
  },
  options?: { lightweight?: boolean }
): Omit<PanelLatentFitResultPlaceholder, never> {
  const raw = runCoreMCMCSampler(observations, cities.length, years.length, spec);
  const nObs = observations.length;
  const anchorIdx = spec.anchorSource === 'X1' ? 0 : spec.anchorSource === 'X2' ? 1 : 2;
  const sourceLabels: [string, string, string] = [
    mapping.x1Label || 'Self-Reporting (X1)',
    mapping.x2Label || 'Satellite (X2)',
    mapping.x3Label || 'Sensor (X3)'
  ];

  // Summarize parameters
  const parameters: MCMCParameterSummary[] = [];
  if (spec.identification === 'anchor') {
    parameters.push(summarizeChains('mu', 'Grand Intercept (μ)', 'structural', raw.muChains, spec.ciLevel, false));
  } else {
    parameters.push(summarizeChains('mu', 'Grand Mean (μ = 0, Standardized)', 'structural', raw.muChains, spec.ciLevel, true));
  }

  ([0, 1, 2] as const).forEach(j => {
    const key = j === 0 ? 'X1' : j === 1 ? 'X2' : 'X3';
    const isAnc = spec.identification === 'anchor' && j === anchorIdx;
    parameters.push(
      summarizeChains(
        `alpha_${key}`,
        `Relative Bias α_${key} (${sourceLabels[j]})`,
        'bias',
        raw.alphaChains[j],
        spec.ciLevel,
        isAnc || !spec.sourceSpecificBias
      )
    );
  });

  ([0, 1, 2] as const).forEach(j => {
    const key = j === 0 ? 'X1' : j === 1 ? 'X2' : 'X3';
    const isAnc = spec.identification === 'anchor' && j === anchorIdx;
    parameters.push(
      summarizeChains(
        `lambda_${key}`,
        `Loading λ_${key} (${sourceLabels[j]})`,
        'loading',
        raw.lambdaChains[j],
        spec.ciLevel,
        isAnc || !spec.sourceSpecificLoading
      )
    );
  });

  ([0, 1, 2] as const).forEach(j => {
    const key = j === 0 ? 'X1' : j === 1 ? 'X2' : 'X3';
    parameters.push(
      summarizeChains(
        `sigma_eps_${key}`,
        `Error SD σ_ε,${key} (${sourceLabels[j]})`,
        'error_sd',
        raw.sigmaEpsChains[j],
        spec.ciLevel,
        false
      )
    );
  });

  parameters.push(summarizeChains('sigma_eta', 'Latent Innovation SD (σ_η)', 'structural', raw.sigmaEtaChains, spec.ciLevel, false));
  if (spec.includeCityIntercept) {
    parameters.push(summarizeChains('sigma_u', 'City Random Intercept SD (σ_u)', 'structural', raw.sigmaUChains, spec.ciLevel, false));
  }
  if (spec.includeTimeEffect) {
    parameters.push(summarizeChains('sigma_gamma', 'Time Effect SD (σ_γ)', 'structural', raw.sigmaGammaChains, spec.ciLevel, false));
  }
  if (raw.ar1ActuallyActive) {
    parameters.push(summarizeChains('rho', 'AR(1) Persistence (ρ)', 'structural', raw.rhoChains, spec.ciLevel, false));
  }

  // Latent estimates Y*_{it}
  const alphaTail = (1 - spec.ciLevel) / 2;
  const latentEstimates: LatentEmissionEstimate[] = observations.map((o, k) => {
    const mean = raw.latentSum[k] / Math.max(1, raw.totalDraws);
    const variance = Math.max(0, raw.latentSqSum[k] / Math.max(1, raw.totalDraws) - mean * mean);
    const sd = Math.sqrt(variance);
    const sorted = [...raw.latentDrawsSample[k]].sort((a, b) => a - b);
    const ciLower = sorted.length ? quantileSorted(sorted, alphaTail) : mean - 1.96 * sd;
    const ciUpper = sorted.length ? quantileSorted(sorted, 1 - alphaTail) : mean + 1.96 * sd;

    // Approximate R-hat across chains for observation latent mean vs posterior variance
    const cm = raw.latentChainMeans[k];
    const grand = cm.reduce((a, b) => a + b, 0) / Math.max(1, cm.length);
    const betweenVar =
      cm.length > 1 ? cm.reduce((s, v) => s + (v - grand) ** 2, 0) / (cm.length - 1) : 0;
    const obsRHat = variance > 1e-12 ? Math.sqrt(1 + betweenVar / variance) : 1.0;

    return {
      city: o.city,
      year: o.year,
      x1: o.x1,
      x2: o.x2,
      x3: o.x3,
      latentMean: mean,
      latentSd: sd,
      ciLower,
      ciUpper,
      rHat: Number(obsRHat.toFixed(4)),
      ess: Math.max(50, Math.round(raw.totalDraws / Math.max(1, obsRHat * obsRHat)))
    };
  });

  // Latent sample variance across observations for scale-invariant reliability formula
  const latMeanAll = latentEstimates.reduce((s, r) => s + r.latentMean, 0) / Math.max(1, latentEstimates.length);
  const varYStar = Math.max(
    1e-8,
    latentEstimates.reduce((s, r) => s + (r.latentMean - latMeanAll) ** 2, 0) / Math.max(1, latentEstimates.length - 1)
  );

  // Source Reliability Comparison Table
  const sourceKeys: MeasurementSourceKey[] = ['X1', 'X2', 'X3'];
  const sourceComparison: SourceComparisonRow[] = sourceKeys.map((sk, j) => {
    const aParam = parameters.find(p => p.name === `alpha_${sk}`)!;
    const lParam = parameters.find(p => p.name === `lambda_${sk}`)!;
    const eParam = parameters.find(p => p.name === `sigma_eps_${sk}`)!;

    const errDraws = raw.sigmaEpsChains[j].flat();
    const errVarMean = errDraws.reduce((s, v) => s + v * v, 0) / Math.max(1, errDraws.length);

    const signalVar = lParam.mean * lParam.mean * varYStar;
    const reliability = signalVar / Math.max(1e-12, signalVar + errVarMean);
    const nsr = Math.sqrt(errVarMean) / Math.max(1e-8, Math.abs(lParam.mean) * Math.sqrt(varYStar));

    return {
      sourceKey: sk,
      sourceLabel: sourceLabels[j],
      relativeBiasMean: aParam.mean,
      relativeBiasSd: aParam.sd,
      relativeBiasCI: [aParam.ciLower, aParam.ciUpper],
      loadingMean: lParam.mean,
      loadingSd: lParam.sd,
      loadingCI: [lParam.ciLower, lParam.ciUpper],
      errorVarianceMean: errVarMean,
      errorSdMean: eParam.mean,
      reliability,
      uncertaintySd: eParam.mean,
      noiseToSignalRatio: nsr,
      isAnchor: spec.identification === 'anchor' && j === anchorIdx
    };
  });

  const sortedByErrVar = [...sourceComparison].sort((a, b) => a.errorVarianceMean - b.errorVarianceMean);
  const sortedByRel = [...sourceComparison].sort((a, b) => b.reliability - a.reliability);
  const sortedByUnc = [...sourceComparison].sort((a, b) => b.uncertaintySd - a.uncertaintySd);
  const biasedSources = sourceComparison
    .filter(s => !s.isAnchor && (s.relativeBiasCI[0] > 0 || s.relativeBiasCI[1] < 0))
    .map(s => s.sourceKey);

  const sourceEvaluation: SourceEvaluationSummary = {
    lowestErrorVarianceSource: sortedByErrVar[0].sourceKey,
    mostConsistentSource: sortedByRel[0].sourceKey,
    highestUncertaintySource: sortedByUnc[0].sourceKey,
    highestReliabilitySource: sortedByRel[0].sourceKey,
    biasedSources,
    relativeOnlyCaveat:
      'Tanpa data ground truth independen, metrik reliabilitas, bias relatif (α), dan sensitivitas (λ) hanya bersifat relatif terhadap asumsi identifikasi dan independensi kondisional model.'
  };

  // Convergence diagnostics
  const freeParams = parameters.filter(p => !p.isFixed);
  const maxRHat = Math.max(...freeParams.map(p => p.rHat), 1.0);
  const minEssBulk = Math.min(...freeParams.map(p => p.essBulk), raw.totalDraws);
  const minEssTail = Math.min(...freeParams.map(p => p.essTail), raw.totalDraws);
  const maxMcseRatio = Math.max(...freeParams.map(p => (p.sd > 1e-12 ? p.mcse / p.sd : 0)), 0);

  const convergenceMessages: string[] = [];
  let status: ConvergenceDiagnostics['convergenceStatusLabel'] = 'KONVERGEN';
  if (maxRHat > 1.05 || raw.numericalWarnings > 0) {
    status = 'TIDAK_KONVERGEN';
    convergenceMessages.push(
      `Split R-hat maksimum (${maxRHat.toFixed(3)}) melebihi ambang 1.05 atau terjadi peringatan numerik (${raw.numericalWarnings}). Hasil estimasi BELUM dapat dinyatakan konvergen!`
    );
  } else if (maxRHat > 1.01 || minEssBulk < 100) {
    status = 'PERINGATAN_KONVERGENSI';
    convergenceMessages.push(
      `Konvergensi parsial: R-hat maks = ${maxRHat.toFixed(3)}, ESS minimum = ${minEssBulk}. Pertimbangkan menaikkan warmup/draws pada Step 5.`
    );
  } else {
    convergenceMessages.push(
      `Seluruh parameter bebas mencapai konvergensi baik (R-hat maks = ${maxRHat.toFixed(3)} ≤ 1.01, ESS min = ${minEssBulk}, MCSE/SD maks = ${(maxMcseRatio * 100).toFixed(2)}%).`
    );
  }

  const diagnostics: ConvergenceDiagnostics = {
    chains: spec.chains,
    warmup: spec.warmup,
    drawsPerChain: spec.draws,
    totalPostWarmupDraws: raw.totalDraws,
    maxRHat,
    minEssBulk,
    minEssTail,
    maxMcseRatio,
    numericalWarningsCount: raw.numericalWarnings,
    isConverged: status !== 'TIDAK_KONVERGEN',
    convergenceStatusLabel: status,
    convergenceMessages,
    ar1SkippedReason: raw.ar1SkippedReason
  };

  // Residual error correlation & Model Identification Audit (Section 4.4)
  const getObsPairwiseCorr = (a: 0 | 1 | 2, b: 0 | 1 | 2) => {
    const xs: number[] = [];
    const ys: number[] = [];
    observations.forEach(o => {
      const va = a === 0 ? o.x1 : a === 1 ? o.x2 : o.x3;
      const vb = b === 0 ? o.x1 : b === 1 ? o.x2 : o.x3;
      if (va !== null && vb !== null) {
        xs.push(va);
        ys.push(vb);
      }
    });
    return computePearsonCorrelation(xs, ys);
  };
  const srcPairCorr = {
    r12: getObsPairwiseCorr(0, 1),
    r13: getObsPairwiseCorr(0, 2),
    r23: getObsPairwiseCorr(1, 2)
  };

  const avgRes = [0, 1, 2].map(j =>
    raw.residualSums[j].map((s, k) => {
      const val = j === 0 ? observations[k].x1 : j === 1 ? observations[k].x2 : observations[k].x3;
      return val === null ? null : s / Math.max(1, raw.totalDraws);
    })
  );
  const getResCorr = (a: 0 | 1 | 2, b: 0 | 1 | 2) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < nObs; k++) {
      if (avgRes[a][k] !== null && avgRes[b][k] !== null) {
        xs.push(avgRes[a][k]!);
        ys.push(avgRes[b][k]!);
      }
    }
    return computePearsonCorrelation(xs, ys);
  };
  const resPairCorr = {
    r12: getResCorr(0, 1),
    r13: getResCorr(0, 2),
    r23: getResCorr(1, 2)
  };

  const identWarnings: string[] = [];
  let identStatus: IdentificationAuditResult['status'] = 'teridentifikasi';
  const minObsCorr = Math.min(srcPairCorr.r12, srcPairCorr.r13, srcPairCorr.r23);
  if (minObsCorr < 0.15) {
    identStatus = 'teridentifikasi_lemah';
    identWarnings.push(
      `Korelasi minimum antarsumber rendah (r = ${minObsCorr.toFixed(3)} < 0.15). Indikator mungkin tidak mengukur variabel laten yang sama secara kuat.`
    );
  }
  const maxResCorr = Math.max(Math.abs(resPairCorr.r12), Math.abs(resPairCorr.r13), Math.abs(resPairCorr.r23));
  const condIndFlag = maxResCorr > 0.35;
  if (condIndFlag) {
    identStatus = identStatus === 'teridentifikasi' ? 'teridentifikasi_lemah' : identStatus;
    identWarnings.push(
      `Terdeteksi korelasi residu antar sumber cukup besar (|r_resid| maks = ${maxResCorr.toFixed(3)} > 0.35). Asumsi conditional independence ε_j ⊥ ε_k | Y* kemungkinan dilanggar (kemungkinan dua sumber berbagi bias metodologis serupa).`
    );
  }
  if (!spec.sourceSpecificLoading && !spec.sourceSpecificBias) {
    identWarnings.push('Seluruh bias α_j dan loading λ_j dimatikan; model tereduksi menjadi pengukuran ekuivalen paralel.');
  }
  if (!diagnostics.isConverged) {
    identStatus = 'tidak_teridentifikasi';
    identWarnings.push('Sampler MCMC tidak konvergen (R-hat > 1.05); identifikasi parameter posterior tidak dapat dipastikan.');
  }

  const identificationAudit: IdentificationAuditResult = {
    status: identStatus,
    isIdentified: identStatus !== 'tidak_teridentifikasi',
    strategy: spec.identification,
    anchorSource: spec.anchorSource,
    scaleConstraint:
      spec.identification === 'anchor'
        ? `λ_${spec.anchorSource} = 1.0 (skala Y* mengikuti ${sourceLabels[anchorIdx]})`
        : 'SD(Y*) = 1.0 dengan pembatasan λ_j > 0 (Standardized Factor)',
    locationConstraint:
      spec.identification === 'anchor'
        ? `α_${spec.anchorSource} = 0.0 (titik nol Y* dijangkarkan pada ${sourceLabels[anchorIdx]})`
        : 'μ = 0.0 dengan pusat data terstandarisasi',
    pairwiseSourceCorrelations: srcPairCorr,
    residualErrorCorrelations: resPairCorr,
    conditionalIndependenceFlag: condIndFlag,
    warnings: identWarnings,
    explanation:
      'Model tiga indikator tanpa ground truth hanya dapat teridentifikasi bila lokasi dan skala Y* ditetapkan secara eksplisit serta error antar sumber diasumsikan independen secara kondisional: Cov(ε_j, ε_k | Y*) = 0 untuk j ≠ k.'
  };

  // Posterior Predictive Checks & WAIC
  const calcPVal = (reps: number[], target: number) =>
    reps.length ? reps.filter(v => v >= target).length / reps.length : 0.5;
  const pMean =
    (calcPVal(raw.repMeansPerDraw[0], raw.obsMeans[0]) +
      calcPVal(raw.repMeansPerDraw[1], raw.obsMeans[1]) +
      calcPVal(raw.repMeansPerDraw[2], raw.obsMeans[2])) /
    3;
  const pSd =
    (calcPVal(raw.repSdsPerDraw[0], raw.obsSds[0]) +
      calcPVal(raw.repSdsPerDraw[1], raw.obsSds[1]) +
      calcPVal(raw.repSdsPerDraw[2], raw.obsSds[2])) /
    3;

  const obsVsPred: PosteriorPredictiveMetrics['obsVsPred'] = [];
  const sseByJ: [number, number, number] = [0, 0, 0];
  const cntByJ: [number, number, number] = [0, 0, 0];
  observations.forEach((o, k) => {
    const yLat = latentEstimates[k].latentMean;
    sourceComparison.forEach((sc, j) => {
      const obsVal = j === 0 ? o.x1 : j === 1 ? o.x2 : o.x3;
      if (obsVal === null) return;
      const pred = sc.relativeBiasMean + sc.loadingMean * yLat;
      const resid = obsVal - pred;
      sseByJ[j] += resid * resid;
      cntByJ[j]++;
      obsVsPred.push({
        city: o.city,
        year: o.year,
        source: sc.sourceKey,
        observed: obsVal,
        predicted: pred,
        residual: resid
      });
    });
  });

  const rmseBySource: Record<MeasurementSourceKey, number> = {
    X1: Math.sqrt(sseByJ[0] / Math.max(1, cntByJ[0])),
    X2: Math.sqrt(sseByJ[1] / Math.max(1, cntByJ[1])),
    X3: Math.sqrt(sseByJ[2] / Math.max(1, cntByJ[2]))
  };
  const totalSse = sseByJ[0] + sseByJ[1] + sseByJ[2];
  const totalCnt = cntByJ[0] + cntByJ[1] + cntByJ[2];
  const rmseOverall = Math.sqrt(totalSse / Math.max(1, totalCnt));

  // WAIC computation (Gelman, Hwang, Vehtari 2014)
  let lppd = 0;
  let pWaic = 0;
  for (let k = 0; k < nObs; k++) {
    const meanLl = raw.pointLogLikSum[k] / Math.max(1, raw.totalDraws);
    const varLl = Math.max(0, raw.pointLogLikSqSum[k] / Math.max(1, raw.totalDraws) - meanLl * meanLl);
    lppd += meanLl;
    pWaic += varLl;
  }
  const waic = -2 * (lppd - pWaic);

  const ppc: PosteriorPredictiveMetrics = {
    bayesianPValueMean: pMean,
    bayesianPValueSd: pSd,
    rmseOverall,
    rmseBySource,
    waic,
    lppd,
    pWaic,
    obsVsPred
  };

  const lightweight = Boolean(options?.lightweight);

  // Compact Prior Sensitivity Analysis (3 regimes)
  const compactSpecBase: PanelLatentModelSpec = {
    ...spec,
    chains: 2,
    warmup: 180,
    draws: 180
  };
  const regimes: Array<{ regime: PriorRegime; label: string }> = [
    { regime: 'weakly_informative', label: 'Weakly Informative (Default)' },
    { regime: 'skeptical_tight', label: 'Skeptical Tight Prior' },
    { regime: 'diffuse_wide', label: 'Diffuse Wide Prior' }
  ];
  const baseLam = {
    X1: sourceComparison[0].loadingMean,
    X2: sourceComparison[1].loadingMean,
    X3: sourceComparison[2].loadingMean
  };
  const sensitivity: PriorSensitivityEntry[] = lightweight
    ? []
    : regimes.map(({ regime, label }) => {
    if (regime === spec.priorRegime) {
      return {
        regime,
        regimeLabel: label,
        loadingMeans: { ...baseLam },
        biasMeans: {
          X1: sourceComparison[0].relativeBiasMean,
          X2: sourceComparison[1].relativeBiasMean,
          X3: sourceComparison[2].relativeBiasMean
        },
        errorSdMeans: {
          X1: sourceComparison[0].errorSdMean,
          X2: sourceComparison[1].errorSdMean,
          X3: sourceComparison[2].errorSdMean
        },
        latentGrandMean: latMeanAll,
        maxRelativeShiftPct: 0
      };
    }
    const rSens = runCoreMCMCSampler(observations, cities.length, years.length, {
      ...compactSpecBase,
      priorRegime: regime
    });
    const meanArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const lMeans = {
      X1: meanArr(rSens.lambdaChains[0].flat()),
      X2: meanArr(rSens.lambdaChains[1].flat()),
      X3: meanArr(rSens.lambdaChains[2].flat())
    };
    const shifts = (['X1', 'X2', 'X3'] as MeasurementSourceKey[]).map(
      k => (Math.abs(lMeans[k] - baseLam[k]) / Math.max(0.1, Math.abs(baseLam[k]))) * 100
    );
    const latAvg =
      rSens.latentSum.reduce((a, b) => a + b / Math.max(1, rSens.totalDraws), 0) / Math.max(1, nObs);
    return {
      regime,
      regimeLabel: label,
      loadingMeans: lMeans,
      biasMeans: {
        X1: meanArr(rSens.alphaChains[0].flat()),
        X2: meanArr(rSens.alphaChains[1].flat()),
        X3: meanArr(rSens.alphaChains[2].flat())
      },
      errorSdMeans: {
        X1: meanArr(rSens.sigmaEpsChains[0].flat()),
        X2: meanArr(rSens.sigmaEpsChains[1].flat()),
        X3: meanArr(rSens.sigmaEpsChains[2].flat())
      },
      latentGrandMean: latAvg,
      maxRelativeShiftPct: Math.max(...shifts)
    };
  });

  // Alternative Model Specification Comparison (Normal vs Student-t vs AR1)
  const altSpecs: Array<{
    id: string;
    label: string;
    likelihood: LikelihoodFamily;
    includeAR1: boolean;
    includeTimeEffect: boolean;
  }> = [
    {
      id: 'active',
      label: `Model Aktif (${spec.likelihood === 'student_t' ? 'Student-t' : 'Normal'}${raw.ar1ActuallyActive ? ' + AR(1)' : ''})`,
      likelihood: spec.likelihood,
      includeAR1: raw.ar1ActuallyActive,
      includeTimeEffect: spec.includeTimeEffect
    },
    {
      id: 'alt_likelihood',
      label: spec.likelihood === 'normal' ? 'Alternatif: Student-t Likelihood (Robust Outlier)' : 'Alternatif: Normal Likelihood',
      likelihood: spec.likelihood === 'normal' ? 'student_t' : 'normal',
      includeAR1: raw.ar1ActuallyActive,
      includeTimeEffect: spec.includeTimeEffect
    }
  ];
  if (years.length >= 3) {
    altSpecs.push({
      id: 'alt_ar1',
      label: raw.ar1ActuallyActive ? 'Alternatif: Tanpa AR(1)' : 'Alternatif: Dengan Komponen AR(1)',
      likelihood: spec.likelihood,
      includeAR1: !raw.ar1ActuallyActive,
      includeTimeEffect: spec.includeTimeEffect
    });
  }

  const modelComparison: ModelComparisonEntry[] = lightweight
    ? []
    : altSpecs.map(alt => {
    if (alt.id === 'active') {
      return {
        id: alt.id,
        specLabel: alt.label,
        likelihood: alt.likelihood,
        includeAR1: alt.includeAR1,
        includeTimeEffect: alt.includeTimeEffect,
        waic,
        rmseOverall,
        maxRHat,
        minESS: minEssBulk,
        isConverged: diagnostics.isConverged
      };
    }
    const rAlt = runCoreMCMCSampler(observations, cities.length, years.length, {
      ...compactSpecBase,
      likelihood: alt.likelihood,
      includeAR1: alt.includeAR1,
      includeTimeEffect: alt.includeTimeEffect
    });
    let altLppd = 0;
    let altPWaic = 0;
    for (let k = 0; k < nObs; k++) {
      const ml = rAlt.pointLogLikSum[k] / Math.max(1, rAlt.totalDraws);
      const vl = Math.max(0, rAlt.pointLogLikSqSum[k] / Math.max(1, rAlt.totalDraws) - ml * ml);
      altLppd += ml;
      altPWaic += vl;
    }
    const altWaic = -2 * (altLppd - altPWaic);

    let sseAlt = 0;
    let cntAlt = 0;
    for (let k = 0; k < nObs; k++) {
      for (let j = 0; j < 3; j++) {
        const val = j === 0 ? observations[k].x1 : j === 1 ? observations[k].x2 : observations[k].x3;
        if (val === null) continue;
        const rMean = rAlt.residualSums[j][k] / Math.max(1, rAlt.totalDraws);
        sseAlt += rMean * rMean;
        cntAlt++;
      }
    }
    const altLambdas = [0, 1, 2].map(j => computeSplitRHat(rAlt.lambdaChains[j]));
    const altErrs = [0, 1, 2].map(j => computeSplitRHat(rAlt.sigmaEpsChains[j]));
    const altMaxR = Math.max(...altLambdas, ...altErrs);
    const altMinEss = Math.min(...[0, 1, 2].map(j => computeGeyerESS(rAlt.sigmaEpsChains[j])));

    return {
      id: alt.id,
      specLabel: alt.label,
      likelihood: alt.likelihood,
      includeAR1: alt.includeAR1,
      includeTimeEffect: alt.includeTimeEffect,
      waic: altWaic,
      rmseOverall: Math.sqrt(sseAlt / Math.max(1, cntAlt)),
      maxRHat: altMaxR,
      minESS: altMinEss,
      isConverged: altMaxR <= 1.05
    };
  });

  // Check balanced flag
  const isBalanced = nObs === cities.length * years.length;
  const workingUnitNote = scaleContext.wasStandardized
    ? 'Standardized (Z-score, SD = 1)'
    : scaleContext.wasLog1p
    ? 'Skala Logaritmik log(1+x)'
    : mapping.x3Unit || mapping.x1Unit || 'Unit Data Asli';

  return {
    engineAttribution: 'Native TypeScript Parameter-Expanded Blocked-Gibbs/Slice MCMC Engine (Non-R/Stan Server Runtime)',
    spec,
    mapping,
    preprocessing,
    nObs,
    nCities: cities.length,
    nYears: years.length,
    isBalanced,
    scaleContext: {
      workingUnitNote,
      ...scaleContext
    },
    parameters,
    sourceComparison,
    sourceEvaluation,
    latentEstimates,
    diagnostics,
    identificationAudit,
    ppc,
    sensitivity,
    modelComparison
  };
}

// Helper intermediate type before interpretation & codegen decoration
export type PanelLatentFitResultPlaceholder = {
  engineAttribution: string;
  spec: PanelLatentModelSpec;
  mapping: PanelLatentMapping;
  preprocessing: PanelLatentPreprocessingOptions;
  nObs: number;
  nCities: number;
  nYears: number;
  isBalanced: boolean;
  scaleContext: {
    workingUnitNote: string;
    wasLog1p: boolean;
    wasStandardized: boolean;
    meansBeforeStd: Record<MeasurementSourceKey, number>;
    sdsBeforeStd: Record<MeasurementSourceKey, number>;
  };
  parameters: MCMCParameterSummary[];
  sourceComparison: SourceComparisonRow[];
  sourceEvaluation: SourceEvaluationSummary;
  latentEstimates: LatentEmissionEstimate[];
  diagnostics: ConvergenceDiagnostics;
  identificationAudit: IdentificationAuditResult;
  ppc: PosteriorPredictiveMetrics;
  sensitivity: PriorSensitivityEntry[];
  modelComparison: ModelComparisonEntry[];
};
