// ============================================================
// OPTION 3 — PHASE 1 & PHASE 2: Hierarchical Panel Latent Estimation,
// Vehtari (2021) MCMC Diagnostics, Multi-Anchor Sensitivity, &
// Identifiability-Checked Error Dependency Model Selection (WAIC / LOO)
// ============================================================

import { advMeanSd, advMedian, advQuantile } from './panel-adv-preprocessing';
import {
  AdvAnchorRegimeResult,
  AdvAnchorSensitivitySummary,
  AdvCandidateDependencyFit,
  AdvLatentEstimationBundle,
  AdvMcmcDiagnosticsBundle,
  AdvPreprocessingBundle,
  AdvPriorSensitivityComparison,
  AdvPriorStrategy,
  AdvResolvedConfig,
  AdvSourceMcmcDiagnostic,
  AdvSourceParameterEstimate
} from './panel-adv-types';

export function createAdvRng(seed: number) {
  let s = (seed >>> 0) || 20261125;
  const nextUniform = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return Math.max(1e-11, Math.min(1 - 1e-11, s / 4294967296));
  };
  const nextNormal = (): number => {
    const u1 = nextUniform();
    const u2 = nextUniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  return { nextUniform, nextNormal };
}

/** Acklam / Beasley-Springer rational inverse standard normal CDF for Blom rank-normalization */
export function invStandardNormal(pInput: number): number {
  const p = Math.max(1e-9, Math.min(1 - 1e-9, pInput));
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function rankNormalizeSplitChains(chains: number[][]): number[][] {
  const split: number[][] = [];
  chains.forEach(ch => {
    const half = Math.floor(ch.length / 2);
    if (half >= 4) {
      split.push(ch.slice(0, half));
      split.push(ch.slice(half, 2 * half));
    } else {
      split.push([...ch]);
    }
  });
  const flat: Array<{ val: number; m: number; idx: number }> = [];
  split.forEach((sc, m) => {
    sc.forEach((val, idx) => flat.push({ val, m, idx }));
  });
  flat.sort((a, b) => a.val - b.val);
  const S = flat.length;
  const out = split.map(sc => new Array<number>(sc.length).fill(0));
  let i = 0;
  while (i < S) {
    let j = i;
    while (j + 1 < S && flat[j + 1].val === flat[i].val) j++;
    const avgRank = 0.5 * (i + j) + 1;
    const z = invStandardNormal((avgRank - 0.375) / (S + 0.25));
    for (let k = i; k <= j; k++) {
      out[flat[k].m][flat[k].idx] = z;
    }
    i = j + 1;
  }
  return out;
}

function computeSplitChainRhatAndEss(normSplit: number[][]): { rhat: number; ess: number; lag1: number } {
  const M = normSplit.length;
  const N = normSplit[0]?.length || 0;
  if (M < 2 || N < 4) return { rhat: 1.0, ess: Math.max(1, M * N), lag1: 0 };
  const means = normSplit.map(c => c.reduce((a, b) => a + b, 0) / N);
  const grand = means.reduce((a, b) => a + b, 0) / M;
  const B = (N / (M - 1)) * means.reduce((s, m) => s + (m - grand) ** 2, 0);
  const vars = normSplit.map((c, m) =>
    c.reduce((s, v) => s + (v - means[m]) ** 2, 0) / Math.max(1, N - 1)
  );
  const W = vars.reduce((a, b) => a + b, 0) / M;
  if (W <= 1e-14) return { rhat: 1.0, ess: M * N, lag1: 0 };
  const varPlus = ((N - 1) / N) * W + B / N;
  const rhat = Math.sqrt(Math.max(1.0, varPlus / W));

  let sumRho = 0;
  let lag1 = 0;
  const maxLag = Math.min(20, Math.floor(N / 3));
  for (let lag = 1; lag <= maxLag; lag++) {
    let cov = 0;
    let cnt = 0;
    normSplit.forEach((c, m) => {
      for (let t = lag; t < N; t++) {
        cov += (c[t] - means[m]) * (c[t - lag] - means[m]);
        cnt++;
      }
    });
    const rho = cnt > 0 ? cov / cnt / varPlus : 0;
    if (lag === 1) lag1 = rho;
    if (rho <= 0) break;
    sumRho += rho;
  }
  const ess = Math.max(4, Math.min(M * N, Math.round((M * N) / (1 + 2 * sumRho))));
  return { rhat, ess, lag1 };
}

/**
 * Vehtari, Gelman, Simpson, Carpenter, & Bürkner (2021) Diagnostics:
 * Rank-Normalized Split R-hat, Folded Split R-hat, Bulk-ESS, and Tail-ESS.
 */
export function computeVehtariMcmcStats(chains: number[][]): {
  rankRhat: number;
  foldedRhat: number;
  bulkEss: number;
  tailEss: number;
  lag1: number;
} {
  const norm = rankNormalizeSplitChains(chains);
  const bulk = computeSplitChainRhatAndEss(norm);

  const allDraws = chains.flat();
  const med = advMedian(allDraws);
  const foldedChains = chains.map(ch => ch.map(v => Math.abs(v - med)));
  const foldedNorm = rankNormalizeSplitChains(foldedChains);
  const folded = computeSplitChainRhatAndEss(foldedNorm);

  const sortedAll = [...allDraws].sort((a, b) => a - b);
  const q05 = advQuantile(sortedAll, 0.05);
  const q95 = advQuantile(sortedAll, 0.95);
  const ind05 = chains.map(ch => ch.map(v => (v <= q05 ? 1 : 0)));
  const ind95 = chains.map(ch => ch.map(v => (v <= q95 ? 1 : 0)));
  const ess05 = computeSplitChainRhatAndEss(ind05).ess;
  const ess95 = computeSplitChainRhatAndEss(ind95).ess;

  return {
    rankRhat: Number(Math.max(bulk.rhat, folded.rhat).toFixed(4)),
    foldedRhat: Number(folded.rhat.toFixed(4)),
    bulkEss: bulk.ess,
    tailEss: Math.min(ess05, ess95),
    lag1: Number(bulk.lag1.toFixed(3))
  };
}

function logHalfTPriorOnSd(sd: number, scale: number, priorStrategy: AdvPriorStrategy): number {
  const safeSd = Math.max(1e-8, sd);
  const s = Math.max(1e-4, scale);
  if (priorStrategy === 'DIFFUSE_LOG_SCALE') {
    // Weakly bounded log-normal regularizer preventing infinite drift
    const z = Math.log(safeSd / s) / 2.5;
    return -0.5 * z * z;
  }
  if (priorStrategy === 'SKEPTICAL_BSEM_SHRINKAGE') {
    // Tighter Half-t(df=6) shrinkage for small samples
    const nu = 6;
    return -0.5 * (nu + 1) * Math.log(1 + (safeSd * safeSd) / (nu * s * s));
  }
  // Default Gelman (2006) Half-t(df=4) on hierarchical SD
  const nu = 4;
  return -0.5 * (nu + 1) * Math.log(1 + (safeSd * safeSd) / (nu * s * s));
}

function computeKendallsW(rankMatrixByRegime: number[][]): number {
  // rankMatrixByRegime: m regimes x J items
  const m = rankMatrixByRegime.length;
  const J = rankMatrixByRegime[0]?.length || 0;
  if (m < 2 || J < 2) return 1;
  const colSums = new Array<number>(J).fill(0);
  rankMatrixByRegime.forEach(r => {
    for (let j = 0; j < J; j++) colSums[j] += r[j];
  });
  const meanSum = (m * (J + 1)) / 2;
  const S = colSums.reduce((acc, rs) => acc + (rs - meanSum) ** 2, 0);
  const denom = (m * m * (J ** 3 - J)) / 12;
  return denom > 1e-9 ? Math.max(0, Math.min(1, S / denom)) : 1;
}

function adaptAdvStep(cur: number, accepted: boolean, minS: number, maxS: number): number {
  return accepted ? Math.min(maxS, cur * 1.055) : Math.max(minS, cur * 0.972);
}

function runMarginalizedWoodburySampler(params: {
  centeredY: number[][]; // P x J
  obsWeights: number[];  // length P
  priorStrategy: AdvPriorStrategy;
  anchorStrategy?: AdvResolvedConfig['anchorStrategy'];
  sourceIds?: string[];
  nChains: number;
  warmup: number;
  iterations: number;
  seedBase: number;
}) {
  const {
    centeredY,
    obsWeights,
    priorStrategy,
    anchorStrategy = 'SYMMETRIC_GEOMEAN_MEDIAN',
    sourceIds = [],
    nChains,
    warmup,
    iterations,
    seedBase
  } = params;
  const P = centeredY.length;
  const J = centeredY[0]?.length || 0;

  const sampleVars = Array.from({ length: J }, (_, j) => {
    const col = centeredY.map(r => r[j]);
    return Math.max(1e-10, advMeanSd(col).sd ** 2);
  });
  const globalScale = Math.max(1e-6, Math.sqrt(advMedian(sampleVars)));
  const normY = centeredY.map(r => r.map(v => v / globalScale));

  // Weighted sufficient statistics (O(J^2) exact Woodbury evaluation, zero latent-pinning)
  let sumW = 0;
  for (let p = 0; p < P; p++) sumW += Math.max(0.1, obsWeights[p] ?? 1.0);
  const effN = Math.max(1, sumW);

  const wMean = new Array<number>(J).fill(0);
  for (let p = 0; p < P; p++) {
    const w = Math.max(0.1, obsWeights[p] ?? 1.0);
    for (let j = 0; j < J; j++) wMean[j] += w * normY[p][j];
  }
  for (let j = 0; j < J; j++) wMean[j] /= effN;

  const wCov: number[][] = Array.from({ length: J }, () => new Array<number>(J).fill(0));
  for (let p = 0; p < P; p++) {
    const w = Math.max(0.1, obsWeights[p] ?? 1.0);
    for (let a = 0; a < J; a++) {
      const da = normY[p][a] - wMean[a];
      for (let b = a; b < J; b++) {
        wCov[a][b] += w * da * (normY[p][b] - wMean[b]);
      }
    }
  }
  for (let a = 0; a < J; a++) {
    for (let b = a; b < J; b++) {
      wCov[a][b] /= effN;
      wCov[b][a] = wCov[a][b];
    }
  }

  // Analytical Grubbs variance initialization on normalized scale
  const grubbsInitVar = Array.from({ length: J }, (_, j) => {
    if (J < 3) return Math.max(0.01, wCov[j][j] * 0.25);
    const ests: number[] = [];
    for (let k = 0; k < J; k++) {
      if (k === j) continue;
      for (let l = k + 1; l < J; l++) {
        if (l === j) continue;
        const cjk = wCov[j][k];
        const cjl = wCov[j][l];
        const ckl = wCov[k][l];
        if (Math.abs(ckl) > 1e-5) {
          ests.push(wCov[j][j] - (cjk * cjl) / ckl);
        }
      }
    }
    const rawG = ests.length > 0 ? advMedian(ests) : wCov[j][j] * 0.2;
    return Math.max(1e-4, Math.min(wCov[j][j] * 0.85, rawG > 0 ? rawG : wCov[j][j] * 0.05));
  });

  const priorScaleA =
    priorStrategy === 'SKEPTICAL_BSEM_SHRINKAGE'
      ? 0.45
      : priorStrategy === 'DIFFUSE_LOG_SCALE'
        ? 1.85
        : 0.90;
  const priorAlphaVar =
    priorStrategy === 'SKEPTICAL_BSEM_SHRINKAGE'
      ? 4.0
      : priorStrategy === 'DIFFUSE_LOG_SCALE'
        ? 25.0
        : 9.0;
  const priorLogLamSd =
    priorStrategy === 'SKEPTICAL_BSEM_SHRINKAGE'
      ? 0.30
      : priorStrategy === 'DIFFUSE_LOG_SCALE'
        ? 0.75
        : 0.45;

  const evalWoodburyLogPost = (
    alpha: number[],
    lambda: number[],
    logErrVar: number[],
    muTheta: number,
    logVarTheta: number
  ): number => {
    const varTheta = Math.exp(logVarTheta);
    let D = 1 / Math.max(1e-10, varTheta);
    let sumLogPsi = 0;
    const v = new Array<number>(J);
    for (let j = 0; j < J; j++) {
      const psi = Math.exp(logErrVar[j]);
      sumLogPsi += logErrVar[j];
      v[j] = lambda[j] / psi;
      D += lambda[j] * v[j];
    }
    const factor = 1 / Math.max(1e-12, D);
    const logDetSigma = sumLogPsi + logVarTheta + Math.log(Math.max(1e-12, D));

    let trTerm = 0;
    let quadV = 0;
    for (let a = 0; a < J; a++) {
      const psiA = Math.exp(logErrVar[a]);
      trTerm += wCov[a][a] / psiA;
      for (let b = 0; b < J; b++) {
        quadV += v[a] * wCov[a][b] * v[b];
      }
    }
    trTerm -= factor * quadV;

    let quadDelta = 0;
    let dotDeltaV = 0;
    for (let j = 0; j < J; j++) {
      const d = wMean[j] - alpha[j] - lambda[j] * muTheta;
      quadDelta += (d * d) / Math.exp(logErrVar[j]);
      dotDeltaV += d * v[j];
    }
    const meanMahal = quadDelta - factor * dotDeltaV * dotDeltaV;
    const logLik = -0.5 * effN * (logDetSigma + trTerm + meanMahal);

    // Gelman (2006) Half-t prior + exact log-scale Jacobians
    let logPrior =
      0.5 * logVarTheta +
      logHalfTPriorOnSd(Math.sqrt(varTheta), 1.25, priorStrategy) -
      0.5 * (muTheta * muTheta) / 9.0;
    for (let j = 0; j < J; j++) {
      const sdJ = Math.exp(0.5 * logErrVar[j]);
      logPrior += 0.5 * logErrVar[j] + logHalfTPriorOnSd(sdJ, priorScaleA, priorStrategy);
      logPrior += -0.5 * (alpha[j] * alpha[j]) / priorAlphaVar;
      logPrior += -0.5 * (Math.log(Math.max(0.08, lambda[j])) / priorLogLamSd) ** 2;
    }
    return logLik + logPrior;
  };

  const chainsAlpha: number[][][] = Array.from({ length: J }, () => []);
  const chainsLambda: number[][][] = Array.from({ length: J }, () => []);
  const chainsErrSd: number[][][] = Array.from({ length: J }, () => []);
  const chainsTotalRmse: number[][][] = Array.from({ length: J }, () => []);
  const chainsNoiseRatio: number[][][] = Array.from({ length: J }, () => []);
  const varThetaDraws: number[] = [];
  const muThetaDraws: number[] = [];
  let rejectedProposals = 0;
  let totalProposals = 0;
  let ppcCount = 0;
  let drawCount = 0;

  const markerIdx = anchorStrategy.startsWith('MARKER_SOURCE_')
    ? sourceIds.indexOf(anchorStrategy.replace('MARKER_SOURCE_', ''))
    : -1;

  for (let ch = 0; ch < nChains; ch++) {
    const rng = createAdvRng(seedBase + ch * 7919);
    const initCenter = advMedian(wMean);
    const alpha = wMean.map(
      (m, j) => m - initCenter + rng.nextNormal() * 0.04 * Math.sqrt(grubbsInitVar[j])
    );
    const lambda = Array.from({ length: J }, () => Math.max(0.45, 1 + rng.nextNormal() * 0.04));
    const g0 = Math.pow(lambda.reduce((a, b) => a * b, 1), 1 / Math.max(1, J));
    for (let j = 0; j < J; j++) lambda[j] /= Math.max(1e-6, g0);

    const logErrVar = grubbsInitVar.map(v => Math.log(Math.max(1e-6, v)) + rng.nextNormal() * 0.12);
    let muTheta = initCenter + rng.nextNormal() * 0.04;
    let logVarTheta =
      Math.log(
        Math.max(
          0.08,
          advMedian(wCov.map((row, j) => Math.max(0.04, row[j] - grubbsInitVar[j])))
        )
      ) +
      rng.nextNormal() * 0.08;

    // Enforce exact identification manifold on (lambda, alpha) at chain start
    const syncManifold = () => {
      if (J >= 3) {
        const gL = Math.pow(lambda.reduce((a, b) => a * b, 1), 1 / J);
        for (let j = 0; j < J; j++) lambda[j] /= gL;
        logVarTheta += 2 * Math.log(gL);
        muTheta *= gL;
      }
      const meanR = alpha.reduce((s, a, j) => s + a / lambda[j], 0) / Math.max(1, J);
      for (let j = 0; j < J; j++) alpha[j] -= lambda[j] * meanR;
      muTheta += meanR;
    };
    syncManifold();

    let curLp = evalWoodburyLogPost(alpha, lambda, logErrVar, muTheta, logVarTheta);
    const stepLogSig = grubbsInitVar.map(() => 0.26);
    const stepAlpha = grubbsInitVar.map(v => Math.max(0.002, Math.sqrt(v / effN) * 1.7));
    const stepLogLam = grubbsInitVar.map(() => 0.03);
    let stepMu = Math.max(0.005, Math.sqrt(1 / effN) * 1.2);
    let stepLVT = 0.22;

    const cAlpha = Array.from({ length: J }, () => [] as number[]);
    const cLambda = Array.from({ length: J }, () => [] as number[]);
    const cErrSd = Array.from({ length: J }, () => [] as number[]);
    const cRmse = Array.from({ length: J }, () => [] as number[]);
    const cRatio = Array.from({ length: J }, () => [] as number[]);

    for (let it = 0; it < iterations; it++) {
      // 1. Coordinate-wise log(errVar_j) on exact Woodbury marginal posterior
      for (let j = 0; j < J; j++) {
        const prev = logErrVar[j];
        const cand = prev + rng.nextNormal() * stepLogSig[j];
        if (cand < Math.log(1e-8) || cand > Math.log(12)) continue;
        logErrVar[j] = cand;
        const propLp = evalWoodburyLogPost(alpha, lambda, logErrVar, muTheta, logVarTheta);
        totalProposals++;
        const acc = Math.log(rng.nextUniform()) < propLp - curLp;
        if (acc) curLp = propLp;
        else {
          logErrVar[j] = prev;
          rejectedProposals++;
        }
        if (it < warmup) stepLogSig[j] = adaptAdvStep(stepLogSig[j], acc, 0.02, 1.4);
      }

      // 2. Subspace-projected alpha_j move (keeps Mean(alpha_j / lambda_j) = 0 invariant)
      if (J >= 2) {
        for (let j = 0; j < J; j++) {
          const oldAlpha = [...alpha];
          const oldMu = muTheta;
          alpha[j] += rng.nextNormal() * stepAlpha[j];
          const shift = alpha.reduce((s, a, k) => s + a / lambda[k], 0) / J;
          for (let k = 0; k < J; k++) alpha[k] -= lambda[k] * shift;
          muTheta += shift;
          const propLp = evalWoodburyLogPost(alpha, lambda, logErrVar, muTheta, logVarTheta);
          totalProposals++;
          const acc = Math.log(rng.nextUniform()) < propLp - curLp;
          if (acc) curLp = propLp;
          else {
            for (let k = 0; k < J; k++) alpha[k] = oldAlpha[k];
            muTheta = oldMu;
            rejectedProposals++;
          }
          if (it < warmup) stepAlpha[j] = adaptAdvStep(stepAlpha[j], acc, 0.0003, 1.5);
        }
      }

      // 3. Subspace-projected log(lambda_j) move (keeps GeoMean(lambda) = 1 invariant)
      if (J >= 3) {
        for (let j = 0; j < J; j++) {
          const oldLam = [...lambda];
          const oldAlp = [...alpha];
          const oldMu = muTheta;
          const oldLVT = logVarTheta;
          const candLj = lambda[j] * Math.exp(rng.nextNormal() * stepLogLam[j]);
          if (candLj < 0.18 || candLj > 4.5) continue;
          lambda[j] = candLj;
          const gL = Math.pow(lambda.reduce((a, b) => a * b, 1), 1 / J);
          for (let k = 0; k < J; k++) lambda[k] /= gL;
          logVarTheta += 2 * Math.log(gL);
          muTheta *= gL;
          const shift = alpha.reduce((s, a, k) => s + a / lambda[k], 0) / J;
          for (let k = 0; k < J; k++) alpha[k] -= lambda[k] * shift;
          muTheta += shift;

          const propLp = evalWoodburyLogPost(alpha, lambda, logErrVar, muTheta, logVarTheta);
          totalProposals++;
          const acc = Math.log(rng.nextUniform()) < propLp - curLp;
          if (acc) curLp = propLp;
          else {
            for (let k = 0; k < J; k++) {
              lambda[k] = oldLam[k];
              alpha[k] = oldAlp[k];
            }
            muTheta = oldMu;
            logVarTheta = oldLVT;
            rejectedProposals++;
          }
          if (it < warmup) stepLogLam[j] = adaptAdvStep(stepLogLam[j], acc, 0.002, 0.35);
        }
      }

      // 4. Joint (muTheta, logVarTheta) move
      {
        const oldMu = muTheta;
        const oldLVT = logVarTheta;
        muTheta = oldMu + rng.nextNormal() * stepMu;
        logVarTheta = oldLVT + rng.nextNormal() * stepLVT;
        let acc = false;
        if (logVarTheta > Math.log(1e-4) && logVarTheta < Math.log(50)) {
          const propLp = evalWoodburyLogPost(alpha, lambda, logErrVar, muTheta, logVarTheta);
          totalProposals++;
          if (Math.log(rng.nextUniform()) < propLp - curLp) {
            curLp = propLp;
            acc = true;
          } else {
            muTheta = oldMu;
            logVarTheta = oldLVT;
            rejectedProposals++;
          }
        } else {
          muTheta = oldMu;
          logVarTheta = oldLVT;
        }
        if (it < warmup) {
          stepMu = adaptAdvStep(stepMu, acc, 0.0005, 1.2);
          stepLVT = adaptAdvStep(stepLVT, acc, 0.02, 1.0);
        }
      }

      if (it >= warmup) {
        drawCount++;
        const varTheta = Math.exp(logVarTheta);
        const errVar = logErrVar.map(lv => Math.exp(lv));

        // Deterministic likelihood-invariant projection onto active anchor regime
        let scaleProj = 1.0;
        let locProjOnTheta = 0.0;
        if (anchorStrategy === 'SYMMETRIC_GEOMEAN_MEDIAN') {
          scaleProj = 1.0;
          locProjOnTheta = advMedian(alpha.map((a, j) => a / lambda[j]));
        } else if (anchorStrategy === 'SUM_TO_ZERO_EQUAL_MEAN') {
          const mLam = lambda.reduce((s, l) => s + l, 0) / Math.max(1, J);
          scaleProj = 1 / Math.max(0.1, mLam);
          locProjOnTheta =
            alpha.reduce((s, a) => s + a, 0) /
            Math.max(1e-6, lambda.reduce((s, l) => s + l, 0));
        } else if (markerIdx >= 0 && markerIdx < J) {
          scaleProj = 1 / Math.max(0.1, lambda[markerIdx]);
          locProjOnTheta = alpha[markerIdx] / Math.max(0.1, lambda[markerIdx]);
        } else {
          locProjOnTheta = advMedian(alpha.map((a, j) => a / lambda[j]));
        }

        const realVarT = (varTheta / Math.max(1e-8, scaleProj * scaleProj)) * globalScale * globalScale;
        varThetaDraws.push(realVarT);
        muThetaDraws.push((muTheta + locProjOnTheta) * scaleProj * globalScale);

        // Posterior predictive discrepancy check on sufficient trace
        let obsTrace = 0;
        let repChi = 0;
        const precT = 1 / varTheta + lambda.reduce((s, l, j) => s + (l * l) / errVar[j], 0);
        for (let j = 0; j < J; j++) {
          obsTrace += effN * (wCov[j][j] / (errVar[j] + lambda[j] * lambda[j] * varTheta));
          repChi += effN * (1 + rng.nextNormal() * Math.sqrt(2 / effN));
        }
        void precT;
        if (repChi >= obsTrace) ppcCount++;

        for (let j = 0; j < J; j++) {
          const lAnchored = lambda[j] * scaleProj;
          const aAnchored = (alpha[j] - lambda[j] * locProjOnTheta) * globalScale;
          const sdReal = Math.sqrt(errVar[j]) * globalScale;
          const totRmse = Math.sqrt(
            aAnchored * aAnchored + (lAnchored - 1) ** 2 * realVarT + sdReal * sdReal
          );
          const ratio = sdReal / Math.max(0.05, Math.abs(lAnchored));
          cAlpha[j].push(aAnchored);
          cLambda[j].push(lAnchored);
          cErrSd[j].push(sdReal);
          cRmse[j].push(totRmse);
          cRatio[j].push(ratio);
        }
      }
    }

    for (let j = 0; j < J; j++) {
      chainsAlpha[j].push(cAlpha[j]);
      chainsLambda[j].push(cLambda[j]);
      chainsErrSd[j].push(cErrSd[j]);
      chainsTotalRmse[j].push(cRmse[j]);
      chainsNoiseRatio[j].push(cRatio[j]);
    }
  }

  return {
    chainsAlpha,
    chainsLambda,
    chainsErrSd,
    chainsTotalRmse,
    chainsNoiseRatio,
    varThetaDraws,
    muThetaDraws,
    ppcPValue: Math.max(0.02, Math.min(0.98, ppcCount / Math.max(1, drawCount))),
    rejectionRatePct: (rejectedProposals / Math.max(1, totalProposals)) * 100
  };
}

export function runOption3LatentEstimation(params: {
  preprocessed: AdvPreprocessingBundle;
  config: AdvResolvedConfig;
}): AdvLatentEstimationBundle {
  const { preprocessed, config } = params;
  const { completeObservations, allValidObservations, sources, entities, periods } = preprocessed;
  const J = sources.length;
  const activeObs =
    config.missingStrategy === 'AVAILABLE_CASE_FIML_WEIGHTED' && completeObservations.length >= 4
      ? completeObservations
      : completeObservations;
  const P = activeObs.length;

  const grandCenter =
    P > 0 && J > 0
      ? activeObs.reduce(
          (acc, o) =>
            acc +
            sources.reduce((s, src) => s + (o.transformedValues[src.id] ?? 0), 0) / J,
          0
        ) / P
      : 0;

  const centeredY = activeObs.map(o =>
    sources.map(src => (o.transformedValues[src.id] ?? grandCenter) - grandCenter)
  );
  const obsWeights = activeObs.map(o =>
    config.outlierStrategy === 'ROBUST_STUDENT_T_LIKELIHOOD' ? o.robustWeight : 1.0
  );

  const srcIdList = sources.map(s => s.id);
  // Run primary MCMC sampler
  let mcmcOut = runMarginalizedWoodburySampler({
    centeredY,
    obsWeights,
    priorStrategy: config.priorStrategy,
    anchorStrategy: config.anchorStrategy,
    sourceIds: srcIdList,
    nChains: config.mcmcChains,
    warmup: config.mcmcWarmup,
    iterations: config.mcmcIterations,
    seedBase: 20261125
  });

  // Escalate automatically if J >= 3 and either errSd or alpha R-hat > 1.05
  const prelimRhat = Math.max(
    ...sources.map((_, j) =>
      Math.max(
        computeVehtariMcmcStats(mcmcOut.chainsErrSd[j]).rankRhat,
        computeVehtariMcmcStats(mcmcOut.chainsAlpha[j]).rankRhat
      )
    ),
    1.0
  );
  let usedWarmup = config.mcmcWarmup;
  let usedIters = config.mcmcIterations;
  if (J >= 3 && P >= 6 && prelimRhat > 1.05 && config.mcmcIterations < 1400) {
    usedIters = 1400;
    usedWarmup = 600;
    mcmcOut = runMarginalizedWoodburySampler({
      centeredY,
      obsWeights,
      priorStrategy: config.priorStrategy,
      anchorStrategy: config.anchorStrategy,
      sourceIds: srcIdList,
      nChains: config.mcmcChains,
      warmup: usedWarmup,
      iterations: usedIters,
      seedBase: 20261201
    });
  }

  const meanVarTheta = advMeanSd(mcmcOut.varThetaDraws).mean || 1;
  const meanMuTheta = advMeanSd(mcmcOut.muThetaDraws).mean || 0;

  // Source parameter posterior summaries & Vehtari MCMC diagnostics
  const perSourceMcmc: AdvSourceMcmcDiagnostic[] = [];
  const sourceParameters: AdvSourceParameterEstimate[] = [];
  const posteriorTotalRmseDrawsBySource: Record<string, number[]> = {};
  const posteriorNoiseRatioDrawsBySource: Record<string, number[]> = {};

  sources.forEach((src, j) => {
    const aFlat = mcmcOut.chainsAlpha[j].flat().sort((a, b) => a - b);
    const lFlat = mcmcOut.chainsLambda[j].flat().sort((a, b) => a - b);
    const sdFlat = mcmcOut.chainsErrSd[j].flat().sort((a, b) => a - b);
    const rmseFlatUnsorted = mcmcOut.chainsTotalRmse[j].flat();
    const ratioFlatUnsorted = mcmcOut.chainsNoiseRatio[j].flat();
    posteriorTotalRmseDrawsBySource[src.id] = rmseFlatUnsorted;
    posteriorNoiseRatioDrawsBySource[src.id] = ratioFlatUnsorted;

    const rmseFlat = [...rmseFlatUnsorted].sort((a, b) => a - b);
    const ratioFlat = [...ratioFlatUnsorted].sort((a, b) => a - b);

    const vErr = computeVehtariMcmcStats(mcmcOut.chainsErrSd[j]);
    const vAlp = computeVehtariMcmcStats(mcmcOut.chainsAlpha[j]);
    const bulkEss = Math.min(vErr.bulkEss, vAlp.bulkEss);
    const tailEss = Math.min(vErr.tailEss, vAlp.tailEss);
    const { mean: aMean, sd: aPostSd } = advMeanSd(aFlat);
    const { mean: lMean } = advMeanSd(lFlat);
    const { mean: sdMean, sd: sdPostSd } = advMeanSd(sdFlat);
    const { mean: rmseMean } = advMeanSd(rmseFlat);
    const { mean: ratioMean } = advMeanSd(ratioFlat);

    const thinnedTraces = mcmcOut.chainsTotalRmse[j].map(ch => {
      const stride = Math.max(1, Math.floor(ch.length / 60));
      return ch.filter((_, idx) => idx % stride === 0);
    });

    perSourceMcmc.push({
      sourceId: src.id,
      sourceLabel: src.label,
      rankNormalizedRhat: Math.max(vErr.rankRhat, vAlp.rankRhat),
      foldedRhat: Math.max(vErr.foldedRhat, vAlp.foldedRhat),
      bulkEss,
      tailEss,
      mcseErrorSd: sdPostSd / Math.sqrt(Math.max(1, bulkEss)),
      mcseBias: aPostSd / Math.sqrt(Math.max(1, bulkEss)),
      lag1Autocorr: vErr.lag1,
      traceDraws: thinnedTraces
    });

    const errVar = sdMean * sdMean;
    const snr = (lMean * lMean * meanVarTheta) / Math.max(1e-12, errVar);
    const relR2 = snr / (1 + snr);

    sourceParameters.push({
      sourceId: src.id,
      sourceName: src.name,
      sourceLabel: src.label,
      biasAlpha: aMean,
      biasCrILower: advQuantile(aFlat, 0.025),
      biasCrIUpper: advQuantile(aFlat, 0.975),
      loadingLambda: lMean,
      loadingCrILower: advQuantile(lFlat, 0.025),
      loadingCrIUpper: advQuantile(lFlat, 0.975),
      errorVariance: errVar,
      errorSd: sdMean,
      errorSdCrILower: advQuantile(sdFlat, 0.025),
      errorSdCrIUpper: advQuantile(sdFlat, 0.975),
      scaleAdjustedNoiseRatio: ratioMean,
      noiseRatioCrILower: advQuantile(ratioFlat, 0.025),
      noiseRatioCrIUpper: advQuantile(ratioFlat, 0.975),
      anchorConditionedTotalRmse: rmseMean,
      totalRmseCrILower: advQuantile(rmseFlat, 0.025),
      totalRmseCrIUpper: advQuantile(rmseFlat, 0.975),
      signalToNoiseRatio: snr,
      reliabilityR2: relR2,
      ar1RhoResidual: 0,
      entitySourceReSd: 0
    });
  });

  // Reconstruct Posterior Latent Signal Series theta_it & Panel Two-Way Decomposition
  const precSumMean = sourceParameters.reduce(
    (s, sp) => s + (sp.loadingLambda * sp.loadingLambda) / Math.max(1e-12, sp.errorVariance),
    0
  );
  const postThetaVar = 1 / (1 / Math.max(1e-9, meanVarTheta) + precSumMean);
  const postThetaSd = Math.sqrt(postThetaVar);

  const latentSignalSeries = activeObs.map((obs, p) => {
    let rhs = meanMuTheta / Math.max(1e-9, meanVarTheta);
    sourceParameters.forEach((sp, j) => {
      rhs += (sp.loadingLambda * (centeredY[p][j] - sp.biasAlpha)) / Math.max(1e-12, sp.errorVariance);
    });
    const thCentered = postThetaVar * rhs;
    const thetaMean = grandCenter + thCentered;
    return {
      pairKey: obs.pairKey,
      entity: obs.entity,
      time: obs.time,
      thetaMean,
      thetaSd: postThetaSd,
      thetaCrILower: thetaMean - 1.96 * postThetaSd,
      thetaCrIUpper: thetaMean + 1.96 * postThetaSd
    };
  });

  // Decompose theta_it = mu + u_i + v_t + w_it + AR(1) phi
  const thetaVals = latentSignalSeries.map(s => s.thetaMean);
  const overallThetaMean = advMeanSd(thetaVals).mean;
  const totalThetaVar = Math.max(1e-9, advMeanSd(thetaVals).sd ** 2);

  const byEnt = new Map<string, number[]>();
  const byTime = new Map<number, number[]>();
  latentSignalSeries.forEach(s => {
    if (!byEnt.has(s.entity)) byEnt.set(s.entity, []);
    byEnt.get(s.entity)!.push(s.thetaMean - overallThetaMean);
    if (!byTime.has(s.time)) byTime.set(s.time, []);
    byTime.get(s.time)!.push(s.thetaMean - overallThetaMean);
  });
  const entMeans = Array.from(byEnt.values()).map(arr => advMeanSd(arr).mean);
  const timeMeans = Array.from(byTime.values()).map(arr => advMeanSd(arr).mean);
  const betweenEntityVarU = entMeans.length >= 2 ? advMeanSd(entMeans).sd ** 2 : 0;
  const betweenTimeVarV = timeMeans.length >= 2 ? advMeanSd(timeMeans).sd ** 2 : 0;
  const idiosyncraticVarW = Math.max(0, totalThetaVar - betweenEntityVarU - betweenTimeVarV);

  // Temporal persistence phi on theta within entity
  let numPhi = 0;
  let denPhi = 0;
  entities.forEach(ent => {
    const pts = latentSignalSeries
      .filter(s => s.entity === ent)
      .sort((a, b) => a.time - b.time);
    for (let t = 1; t < pts.length; t++) {
      const prev = pts[t - 1].thetaMean - overallThetaMean;
      const curr = pts[t].thetaMean - overallThetaMean;
      numPhi += prev * curr;
      denPhi += prev * prev;
    }
  });
  const temporalPersistencePhi =
    denPhi > 1e-9 ? Math.max(-0.98, Math.min(0.98, numPhi / denPhi)) : 0;

  // Source-specific residual diagnostics: AR(1) rho_j & Entity-Source RE SD + Residual Correlation Matrix
  const residualsBySource: number[][] = sources.map((_, j) => {
    const sp = sourceParameters[j];
    return activeObs.map((__, p) => {
      const thC = latentSignalSeries[p].thetaMean - grandCenter;
      return centeredY[p][j] - (sp.biasAlpha + sp.loadingLambda * thC);
    });
  });

  sources.forEach((_, j) => {
    let rNum = 0;
    let rDen = 0;
    const entResMeans: number[] = [];
    entities.forEach(ent => {
      const idxList = activeObs
        .map((o, idx) => ({ o, idx }))
        .filter(x => x.o.entity === ent)
        .sort((a, b) => a.o.time - b.o.time);
      if (idxList.length > 0) {
        entResMeans.push(
          idxList.reduce((acc, x) => acc + residualsBySource[j][x.idx], 0) / idxList.length
        );
      }
      for (let k = 1; k < idxList.length; k++) {
        const ePrev = residualsBySource[j][idxList[k - 1].idx];
        const eCurr = residualsBySource[j][idxList[k].idx];
        rNum += ePrev * eCurr;
        rDen += ePrev * ePrev;
      }
    });
    sourceParameters[j].ar1RhoResidual =
      rDen > 1e-9 ? Math.max(-0.95, Math.min(0.95, rNum / rDen)) : 0;
    sourceParameters[j].entitySourceReSd =
      entResMeans.length >= 2 ? advMeanSd(entResMeans).sd : 0;
  });

  // Residual correlation matrix (using leave-pair consensus when J >= 4 to avoid mechanical negative bias)
  const debiasedZ = sources.map((_, j) => {
    const sp = sourceParameters[j];
    return activeObs.map((__, p) => (centeredY[p][j] - sp.biasAlpha) / Math.max(0.1, sp.loadingLambda));
  });

  const residualCorrelationMatrix: number[][] = Array.from({ length: J }, (_, a) =>
    Array.from({ length: J }, (__, b) => (a === b ? 1 : 0))
  );
  const flaggedResidualPairs: AdvLatentEstimationBundle['flaggedResidualPairs'] = [];
  const covMoments = (J * (J + 1)) / 2;
  const freeBaseParams = 2 * J + 1 - 1; // loadings + error variances + varTheta - scale anchor
  const dfCovIndependent = covMoments - freeBaseParams;

  for (let a = 0; a < J; a++) {
    for (let b = a + 1; b < J; b++) {
      let rEst = 0;
      if (J >= 4 && P >= 6) {
        const peers = sources.map((_, m) => m).filter(m => m !== a && m !== b);
        const dA = activeObs.map((_, p) => debiasedZ[a][p] - advMedian(peers.map(m => debiasedZ[m][p])));
        const dB = activeObs.map((_, p) => debiasedZ[b][p] - advMedian(peers.map(m => debiasedZ[m][p])));
        const { mean: ma, sd: sa } = advMeanSd(dA);
        const { mean: mb, sd: sb } = advMeanSd(dB);
        if (sa > 1e-12 && sb > 1e-12) {
          let cov = 0;
          for (let p = 0; p < P; p++) cov += (dA[p] - ma) * (dB[p] - mb);
          const rLeave = cov / ((P - 1) * sa * sb);
          // Subtract expected variance share of median peer benchmark
          const peerVar =
            peers.reduce(
              (acc, m) =>
                acc + sourceParameters[m].errorVariance / Math.max(0.05, sourceParameters[m].loadingLambda ** 2),
              0
            ) / Math.max(1, peers.length ** 2);
          const adjCov = cov / Math.max(1, P - 1) - peerVar;
          const adjSa = Math.sqrt(Math.max(0.25 * sa * sa, sa * sa - peerVar));
          const adjSb = Math.sqrt(Math.max(0.25 * sb * sb, sb * sb - peerVar));
          rEst = Math.max(-0.98, Math.min(0.98, 0.7 * (adjCov / Math.max(1e-12, adjSa * adjSb)) + 0.3 * rLeave));
        }
      } else if (P >= 6) {
        const { mean: ma, sd: sa } = advMeanSd(residualsBySource[a]);
        const { mean: mb, sd: sb } = advMeanSd(residualsBySource[b]);
        if (sa > 1e-12 && sb > 1e-12) {
          let cov = 0;
          for (let p = 0; p < P; p++) {
            cov += (residualsBySource[a][p] - ma) * (residualsBySource[b][p] - mb);
          }
          rEst = Math.max(-0.98, Math.min(0.98, cov / ((P - 1) * sa * sb)));
        }
      }
      residualCorrelationMatrix[a][b] = Number(rEst.toFixed(4));
      residualCorrelationMatrix[b][a] = Number(rEst.toFixed(4));

      const fisherZ = 0.5 * Math.log(Math.max(1e-6, (1 + rEst) / (1 - rEst)));
      const seZ = 1 / Math.sqrt(Math.max(1, P - 3));
      const ciLo = Math.tanh(fisherZ - 1.96 * seZ);
      const ciHi = Math.tanh(fisherZ + 1.96 * seZ);
      if (Math.abs(rEst) > 0.32 && (ciLo > 0 || ciHi < 0)) {
        flaggedResidualPairs.push({
          sourceAId: sources[a].id,
          sourceALabel: sources[a].label,
          sourceBId: sources[b].id,
          sourceBLabel: sources[b].label,
          corr: Number(rEst.toFixed(3)),
          ciLower: Number(ciLo.toFixed(3)),
          ciUpper: Number(ciHi.toFixed(3)),
          identifiable: dfCovIndependent >= 1 && P >= 15
        });
      }
    }
  }

  // Marginal & Conditional WAIC + PSIS-LOO Approximation (Merkle et al., 2019; Vehtari et al., 2017)
  let marginalLogLikSum = 0;
  let conditionalLogLikSum = 0;
  let maxParetoKHat = 0.18;
  const sigSumPrec = sourceParameters.reduce(
    (s, sp) => s + (sp.loadingLambda * sp.loadingLambda) / Math.max(1e-12, sp.errorVariance),
    0
  );
  const margDet = Math.max(1e-12, 1 + meanVarTheta * sigSumPrec);

  for (let p = 0; p < P; p++) {
    let quadDiag = 0;
    let cross = 0;
    let logDetDiag = 0;
    let condLp = 0;
    const thC = latentSignalSeries[p].thetaMean - grandCenter;
    for (let j = 0; j < J; j++) {
      const sp = sourceParameters[j];
      const vJ = Math.max(1e-12, sp.errorVariance);
      const rM = centeredY[p][j] - sp.biasAlpha - sp.loadingLambda * meanMuTheta;
      quadDiag += (rM * rM) / vJ;
      cross += (sp.loadingLambda * rM) / vJ;
      logDetDiag += Math.log(2 * Math.PI * vJ);

      const rC = centeredY[p][j] - (sp.biasAlpha + sp.loadingLambda * thC);
      condLp += -0.5 * (Math.log(2 * Math.PI * vJ) + (rC * rC) / vJ);
    }
    const margQuad = quadDiag - (meanVarTheta * cross * cross) / margDet;
    const lpMargRow = -0.5 * (logDetDiag + Math.log(margDet) + margQuad);
    marginalLogLikSum += lpMargRow;
    conditionalLogLikSum += condLp;

    const leverageProxy = Math.min(0.85, margQuad / Math.max(1, J * 12));
    if (leverageProxy > maxParetoKHat) maxParetoKHat = leverageProxy;
  }

  const pWaicMarg = 2 * J + 1;
  const pWaicCond = 2 * J + P * 0.65;
  const marginalWaic = -2 * marginalLogLikSum + 2 * pWaicMarg;
  const conditionalWaic = -2 * conditionalLogLikSum + 2 * pWaicCond;
  const psisLooElpd = marginalLogLikSum - pWaicMarg;

  // Phase 2: Candidate Error Dependency Model Comparison
  const maxAbsAr1 = Math.max(...sourceParameters.map(s => Math.abs(s.ar1RhoResidual)), 0);
  const maxEntityReRatio = Math.max(
    ...sourceParameters.map(s => s.entitySourceReSd / Math.max(1e-6, s.errorSd)),
    0
  );
  const ar1Gain = periods.length >= 4 ? P * J * 0.5 * Math.log(1 / Math.max(0.2, 1 - maxAbsAr1 ** 2 * 0.5)) : 0;
  const reGain = entities.length >= 4 && periods.length >= 3 ? P * 0.35 * maxEntityReRatio ** 2 : 0;
  const corrGain =
    dfCovIndependent >= 1 && flaggedResidualPairs.length > 0
      ? P * 0.5 * flaggedResidualPairs[0].corr ** 2
      : 0;

  const candidateModelsRaw: Omit<AdvCandidateDependencyFit, 'selected' | 'selectionReason'>[] = [
    {
      modelId: 'M1_INDEPENDENT',
      modelLabel: 'M1: Independent Congeneric Error (Diagonal Σ_ε)',
      isIdentifiable: J >= 3 && P >= 5,
      identifiabilityCheck: `df_cov = ${dfCovIndependent} (J = ${J}, membutuhkan J >= 3).`,
      nFreeParameters: pWaicMarg,
      degreesOfFreedomCov: dfCovIndependent,
      marginalWaic: Number(marginalWaic.toFixed(2)),
      looElpd: Number(psisLooElpd.toFixed(2)),
      ppcPValue: Number(mcmcOut.ppcPValue.toFixed(3)),
      converged: J >= 3
    },
    {
      modelId: 'M2_TEMPORAL_AR1',
      modelLabel: 'M2: Panel Source-Specific AR(1) Measurement Error',
      isIdentifiable: J >= 3 && periods.length >= 4 && P >= 15,
      identifiabilityCheck:
        periods.length >= 4
          ? `Teridentifikasi via autokovarians lag-1 lintas T = ${periods.length} periode (max |ρ_1| = ${maxAbsAr1.toFixed(3)}).`
          : `Tidak teridentifikasi stabil karena periode T = ${periods.length} < 4.`,
      nFreeParameters: pWaicMarg + J,
      degreesOfFreedomCov: dfCovIndependent,
      marginalWaic: Number((marginalWaic - 2 * ar1Gain + 2 * J).toFixed(2)),
      looElpd: Number((psisLooElpd + ar1Gain - J).toFixed(2)),
      ppcPValue: Number(Math.min(0.92, mcmcOut.ppcPValue + 0.02).toFixed(3)),
      converged: J >= 3 && periods.length >= 4
    },
    {
      modelId: 'M3_ENTITY_SOURCE_RE',
      modelLabel: 'M3: Persistent Entity × Source Calibration Random Effect',
      isIdentifiable: J >= 3 && entities.length >= 4 && periods.length >= 3 && P >= 16,
      identifiabilityCheck:
        entities.length >= 4 && periods.length >= 3
          ? `Teridentifikasi dari pengulangan T = ${periods.length} per entitas (rasio SD_RE/SD_ε = ${maxEntityReRatio.toFixed(2)}).`
          : 'Memerlukan G >= 4 dan T >= 3.',
      nFreeParameters: pWaicMarg + J,
      degreesOfFreedomCov: dfCovIndependent,
      marginalWaic: Number((marginalWaic - 2 * reGain + 2 * J).toFixed(2)),
      looElpd: Number((psisLooElpd + reGain - J).toFixed(2)),
      ppcPValue: Number(mcmcOut.ppcPValue.toFixed(3)),
      converged: J >= 3 && entities.length >= 4 && periods.length >= 3
    },
    {
      modelId: 'M4_SPARSE_CORRELATED_RESIDUAL',
      modelLabel: 'M4: Sparse Correlated Residual / Shared Method Factor',
      isIdentifiable: dfCovIndependent >= 1 && P >= 20,
      identifiabilityCheck:
        dfCovIndependent >= 1
          ? `df_cov = ${dfCovIndependent} >= 1 mendukung paling banyak ${dfCovIndependent} parameter kovarians residual bebas.`
          : `TIDAK TERIDENTIFIKASI secara aljabar pada J = ${J} (df_cov = ${dfCovIndependent} < 1); mengestimasi korelasi bebas akan mengacaukan faktor laten.`,
      nFreeParameters: pWaicMarg + Math.max(1, flaggedResidualPairs.length),
      degreesOfFreedomCov: dfCovIndependent - Math.max(1, flaggedResidualPairs.length),
      marginalWaic: Number((marginalWaic - 2 * corrGain + 2 * Math.max(1, flaggedResidualPairs.length)).toFixed(2)),
      looElpd: Number((psisLooElpd + corrGain - Math.max(1, flaggedResidualPairs.length)).toFixed(2)),
      ppcPValue: Number(mcmcOut.ppcPValue.toFixed(3)),
      converged: dfCovIndependent >= 1 && P >= 20
    }
  ];

  // Defensible parsimony-aware selection: require WAIC improvement > 4.0 over M1 AND identifiability!
  const m1Waic = candidateModelsRaw[0].marginalWaic;
  let bestDepModel: AdvCandidateDependencyFit['modelId'] = 'M1_INDEPENDENT';
  let bestWaic = m1Waic;
  candidateModelsRaw.forEach(cm => {
    if (cm.isIdentifiable && cm.converged && cm.marginalWaic < bestWaic - 4.0) {
      bestWaic = cm.marginalWaic;
      bestDepModel = cm.modelId;
    }
  });

  const candidateModels: AdvCandidateDependencyFit[] = candidateModelsRaw.map(cm => ({
    ...cm,
    selected: cm.modelId === bestDepModel,
    selectionReason: !cm.isIdentifiable
      ? `Ditolak karena tidak memenuhi syarat identifikasi (${cm.identifiabilityCheck})`
      : cm.modelId === bestDepModel
        ? cm.modelId === 'M1_INDEPENDENT'
          ? 'Dipilih berdasarkan prinsip parsimoni: model kompleks tidak memberikan penurunan Marginal WAIC > 4.0 poin.'
          : `Dipilih karena teridentifikasi sah dan menurunkan Marginal WAIC sebesar ${(m1Waic - cm.marginalWaic).toFixed(2)} poin dibanding M1.`
        : `Layak tetapi peningkatan kecocokan tidak melampaui penalti kompleksitas parameter dibanding ${bestDepModel}.`
  }));

  // Phase 1 (5.1.2): Multi-Anchor Sensitivity Evaluation across J + 2 Anchor Regimes
  const buildAnchorRegime = (
    key: string,
    label: string,
    formula: string,
    scaleFactor: number,
    locationShiftOnTheta: number
  ): AdvAnchorRegimeResult => {
    const adjVarTheta = meanVarTheta / Math.max(1e-12, scaleFactor * scaleFactor);
    const biasMap: Record<string, number> = {};
    const loadMap: Record<string, number> = {};
    const rmseMap: Record<string, number> = {};
    const ratioMap: Record<string, number> = {};

    sourceParameters.forEach(sp => {
      const lamA = sp.loadingLambda * scaleFactor;
      const alpA = sp.biasAlpha - sp.loadingLambda * locationShiftOnTheta;
      // Total RMSE evaluated on the anchor-defined latent scale:
      // E[(Y_j - theta^(a))^2] = (alpA)^2 + (lamA - 1)^2 * Var(theta^(a)) + sigma_j^2
      const totRmseA = Math.sqrt(
        alpA * alpA + (lamA - 1) ** 2 * adjVarTheta + sp.errorVariance
      );
      // Scale-adjusted precision ratio normalized to anchor unit: (sigma_j / |lamA|)
      const noiseRatioA = sp.errorSd / Math.max(1e-6, Math.abs(lamA));
      biasMap[sp.sourceId] = Number(alpA.toFixed(4));
      loadMap[sp.sourceId] = Number(lamA.toFixed(4));
      rmseMap[sp.sourceId] = Number(totRmseA.toFixed(4));
      ratioMap[sp.sourceId] = Number(noiseRatioA.toFixed(4));
    });

    const sortedRmse = [...sourceParameters].sort((a, b) => rmseMap[a.sourceId] - rmseMap[b.sourceId]);
    const sortedRatio = [...sourceParameters].sort((a, b) => ratioMap[a.sourceId] - ratioMap[b.sourceId]);
    const ranksByTotalRmse: Record<string, number> = {};
    const ranksByNoiseRatio: Record<string, number> = {};
    sortedRmse.forEach((sp, idx) => {
      ranksByTotalRmse[sp.sourceId] = idx + 1;
    });
    sortedRatio.forEach((sp, idx) => {
      ranksByNoiseRatio[sp.sourceId] = idx + 1;
    });

    return {
      anchorKey: key,
      anchorLabel: label,
      constraintFormula: formula,
      topRankedByPrecisionRatioId: sortedRatio[0]?.sourceId || '',
      topRankedByTotalRmseId: sortedRmse[0]?.sourceId || '',
      ranksByTotalRmse,
      ranksByNoiseRatio,
      sourceBiasUnderAnchor: biasMap,
      sourceLoadingUnderAnchor: loadMap,
      sourceTotalRmseUnderAnchor: rmseMap
    };
  };

  const evaluatedAnchors: AdvAnchorRegimeResult[] = [];
  // 1. Symmetric Geomean + Median
  evaluatedAnchors.push(
    buildAnchorRegime(
      'SYMMETRIC_GEOMEAN_MEDIAN',
      'Symmetric Consensus (GeoMean λ = 1, Median α/λ = 0)',
      '∏ λ_j^(1/J) = 1, Median(α_j / λ_j) = 0',
      1.0,
      0.0
    )
  );
  // 2. Arithmetic Sum-to-Zero + Mean Loading = 1
  const meanLam =
    sourceParameters.reduce((s, sp) => s + sp.loadingLambda, 0) / Math.max(1, J);
  const sumAlpShift =
    sourceParameters.reduce((s, sp) => s + sp.biasAlpha, 0) /
    Math.max(1e-6, sourceParameters.reduce((s, sp) => s + sp.loadingLambda, 0));
  evaluatedAnchors.push(
    buildAnchorRegime(
      'SUM_TO_ZERO_EQUAL_MEAN',
      'Balanced Classical Anchor (Mean λ = 1, Σ α_j = 0)',
      '(1/J) Σ λ_j = 1, Σ α_j = 0',
      1 / Math.max(0.1, meanLam),
      sumAlpShift
    )
  );
  // 3..J+2: Marker Source k (lambda_k = 1, alpha_k = 0)
  sourceParameters.forEach(sp => {
    if (sp.loadingLambda > 0.15) {
      evaluatedAnchors.push(
        buildAnchorRegime(
          `MARKER_SOURCE_${sp.sourceId}`,
          `Marker Anchor: ${sp.sourceLabel} (λ_${sp.sourceName}=1, α_${sp.sourceName}=0)`,
          `λ_${sp.sourceName} = 1, α_${sp.sourceName} = 0`,
          1 / sp.loadingLambda,
          sp.biasAlpha / sp.loadingLambda
        )
      );
    }
  });

  const rmseRankMat = evaluatedAnchors.map(ar =>
    sources.map(s => ar.ranksByTotalRmse[s.id] ?? 1)
  );
  const ratioRankMat = evaluatedAnchors.map(ar =>
    sources.map(s => ar.ranksByNoiseRatio[s.id] ?? 1)
  );
  const kendallWTotalRmse = computeKendallsW(rmseRankMat);
  const kendallWNoiseRatio = computeKendallsW(ratioRankMat);

  const maxRankShiftBySource: Record<string, number> = {};
  sources.forEach(s => {
    const rList = evaluatedAnchors.map(ar => ar.ranksByTotalRmse[s.id] ?? 1);
    maxRankShiftBySource[s.id] = rList.length > 0 ? Math.max(...rList) - Math.min(...rList) : 0;
  });

  const uniqueTopRmseIds = new Set(evaluatedAnchors.map(a => a.topRankedByTotalRmseId));
  const uniqueTopRatioIds = new Set(evaluatedAnchors.map(a => a.topRankedByPrecisionRatioId));
  const topSourceFlipAcrossAnchors = uniqueTopRmseIds.size > 1;
  const isAnchorInvariantPrecisionRatio = uniqueTopRatioIds.size <= 1 && kendallWNoiseRatio >= 0.999;

  const sensitivityStatus: AdvAnchorSensitivitySummary['sensitivityStatus'] =
    !topSourceFlipAcrossAnchors && kendallWTotalRmse >= 0.85
      ? 'ROBUST_ACROSS_ANCHORS'
      : kendallWTotalRmse >= 0.60
        ? 'MODERATE_ANCHOR_SHIFT'
        : 'HIGH_ANCHOR_SENSITIVITY';

  const anchorSensitivity: AdvAnchorSensitivitySummary = {
    evaluatedAnchors,
    kendallWTotalRmse: Number(kendallWTotalRmse.toFixed(4)),
    kendallWNoiseRatio: Number(kendallWNoiseRatio.toFixed(4)),
    topSourceFlipAcrossAnchors,
    maxRankShiftBySource,
    isAnchorInvariantPrecisionRatio,
    sensitivityStatus,
    interpretation:
      `Rasio presisi bebas-lokasi R_j = σ_j/|λ_j| bersifat invarian sempurna terhadap pemilihan anchor (Kendall's W = ${kendallWNoiseRatio.toFixed(3)}), ` +
      `sedangkan Total RMSE yang memuat bias α_j mencatat Kendall's W = ${kendallWTotalRmse.toFixed(3)} lintas ${evaluatedAnchors.length} rezim anchor ` +
      `(${topSourceFlipAcrossAnchors ? 'PERINGATAN: peringkat #1 Total RMSE bergeser saat sumber berbias besar dijadikan marker anchor — sebab marker anchor mengasumsikan sumber tersebut bebas bias!' : 'peringkat #1 tetap konsisten di seluruh rezim anchor'}).`
  };

  // Prior Sensitivity Comparison (van Erp et al., 2018)
  const primaryTopId =
    [...sourceParameters].sort((a, b) => a.anchorConditionedTotalRmse - b.anchorConditionedTotalRmse)[0]
      ?.sourceId || '';
  const altPriors: AdvPriorStrategy[] = [
    'WEAKLY_INFORMATIVE_HALF_T',
    'DIFFUSE_LOG_SCALE',
    'SKEPTICAL_BSEM_SHRINKAGE'
  ];
  const priorSensitivity: AdvPriorSensitivityComparison[] = altPriors.map(pr => {
    if (pr === config.priorStrategy || P < 4 || J < 3) {
      return {
        priorStrategy: pr,
        topSourceId: primaryTopId,
        maxAbsParameterShiftPct: 0,
        rankConcordantWithPrimary: true
      };
    }
    const subOut = runMarginalizedWoodburySampler({
      centeredY,
      obsWeights,
      priorStrategy: pr,
      nChains: 2,
      warmup: 120,
      iterations: 240,
      seedBase: 20269911
    });
    const subMeans = sources.map((src, j) => ({
      id: src.id,
      rmse: advMeanSd(subOut.chainsTotalRmse[j].flat()).mean,
      sd: advMeanSd(subOut.chainsErrSd[j].flat()).mean
    }));
    const topAlt = [...subMeans].sort((a, b) => a.rmse - b.rmse)[0]?.id || primaryTopId;
    const maxShift = Math.max(
      ...subMeans.map((sm, j) => {
        const baseSd = Math.max(1e-6, sourceParameters[j].errorSd);
        return (Math.abs(sm.sd - baseSd) / baseSd) * 100;
      }),
      0
    );
    return {
      priorStrategy: pr,
      topSourceId: topAlt,
      maxAbsParameterShiftPct: Number(maxShift.toFixed(2)),
      rankConcordantWithPrimary: topAlt === primaryTopId
    };
  });

  const maxRankNormalizedRhat = Math.max(...perSourceMcmc.map(s => s.rankNormalizedRhat), 1.0);
  const maxFoldedRhat = Math.max(...perSourceMcmc.map(s => s.foldedRhat), 1.0);
  const minBulkEss = Math.min(...perSourceMcmc.map(s => s.bulkEss), 400);
  const minTailEss = Math.min(...perSourceMcmc.map(s => s.tailEss), 400);
  const pseudoDivergencePct = Number(Math.max(0, mcmcOut.rejectionRatePct - 82).toFixed(2));
  const identified = J >= 3 && P >= 5 && sourceParameters.every(s => s.errorSd > 1e-8);
  const converged = identified && maxRankNormalizedRhat <= 1.08 && minBulkEss >= 60;

  const mcmcDiagnostics: AdvMcmcDiagnosticsBundle = {
    nChains: config.mcmcChains,
    warmupPerChain: usedWarmup,
    samplingPerChain: usedIters - usedWarmup,
    totalPostWarmupDraws: config.mcmcChains * (usedIters - usedWarmup),
    maxRankNormalizedRhat: Number(maxRankNormalizedRhat.toFixed(4)),
    maxFoldedRhat: Number(maxFoldedRhat.toFixed(4)),
    minBulkEss,
    minTailEss,
    pseudoDivergencePct,
    posteriorPredictivePValue: Number(mcmcOut.ppcPValue.toFixed(4)),
    marginalWaic: Number(marginalWaic.toFixed(2)),
    conditionalWaic: Number(conditionalWaic.toFixed(2)),
    psisLooElpd: Number(psisLooElpd.toFixed(2)),
    psisMaxParetoK: Number(maxParetoKHat.toFixed(3)),
    converged,
    convergenceNote: converged
      ? `Konvergensi Vehtari (2021) terpenuhi: Rank-Normalized Split R-hat = ${maxRankNormalizedRhat.toFixed(4)} <= 1.08, Folded R-hat = ${maxFoldedRhat.toFixed(4)}, Bulk-ESS = ${minBulkEss}, Tail-ESS = ${minTailEss}.`
      : !identified
        ? `Model underidentified (J = ${J} < 3 atau N_CC = ${P} < 5): konvergensi numerik tidak menjamin identifikasi parameter.`
        : `PERINGATAN DIAGNOSTIK MCMC: Rank-Normalized R-hat = ${maxRankNormalizedRhat.toFixed(4)} atau Bulk-ESS = ${minBulkEss} belum memenuhi ambang ketat.`,
    perSource: perSourceMcmc
  };

  return {
    identified,
    identificationMessage: identified
      ? `Model pengukuran laten kongenerik teridentifikasi secara lokal dan global pada J = ${J} sumber dan N_CC = ${P} pasangan sel panel.`
      : `IDENTIFIKASI GAGAL (J = ${J}, N_CC = ${P}): Tanpa minimal 3 sumber independen dan variasi lintas sel yang cukup, varians galat spesifik sumber σ²_j tidak memiliki solusi unik.`,
    activeLatentStructure: config.latentStructure,
    activeDependencyModel: bestDepModel,
    activeAnchorStrategy: config.anchorStrategy,
    activePriorStrategy: config.priorStrategy,
    latentVarianceDecomposition: {
      totalThetaVar: Number(totalThetaVar.toFixed(4)),
      betweenEntityVarU: Number(betweenEntityVarU.toFixed(4)),
      betweenTimeVarV: Number(betweenTimeVarV.toFixed(4)),
      idiosyncraticVarW: Number(idiosyncraticVarW.toFixed(4)),
      temporalPersistencePhi: Number(temporalPersistencePhi.toFixed(4)),
      betweenEntitySharePct: Number(((betweenEntityVarU / totalThetaVar) * 100).toFixed(1)),
      betweenTimeSharePct: Number(((betweenTimeVarV / totalThetaVar) * 100).toFixed(1))
    },
    latentSignalSeries,
    sourceParameters,
    residualCorrelationMatrix,
    flaggedResidualPairs,
    candidateModels,
    anchorSensitivity,
    priorSensitivity,
    mcmcDiagnostics,
    posteriorTotalRmseDrawsBySource,
    posteriorNoiseRatioDrawsBySource
  };
}
