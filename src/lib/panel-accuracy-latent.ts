// ============================================================
// Reference-Free All-Source Latent Measurement Accuracy Engine
// Marginalized Bayesian Hierarchical Congeneric Panel Model (MCMC)
// + Woodbury Analytical θ Integration (No Heywood Collapse!)
// + Grubbs Analytical Triangulation + Leave-One-Source-Out Consensus
// Evaluates & ranks ALL J >= 3 measurement sources equally without
// locking any variable as a privileged reference source.
// ============================================================

import { studentTPValueTwoSided } from './panel-accuracy-bland-altman';
import { computePearsonR } from './panel-accuracy-correlation';
import {
  CleanedPanelObservation,
  CorrelatedErrorPairItem,
  LatentModelSummary,
  LatentSourceEstimate,
  MeasurementSource
} from './panel-accuracy-types';
import { quantileSorted } from './panel-accuracy-validation';

export interface LatentEngineInternalOutput {
  summary: LatentModelSummary;
  pairwisePosteriorProb: Record<string, number>;
  losoConsensusBySource: Record<string, number[]>;
  losoPredictiveSeBySource: Record<string, number>;
  sharedLatentTheta: number[];
}

function createRng(seedInit: number) {
  let s = seedInit >>> 0;
  const nextUniform = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return Math.max(1e-10, Math.min(1 - 1e-10, s / 4294967296));
  };
  const nextNormal = (): number => {
    const u1 = nextUniform();
    const u2 = nextUniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  return { nextUniform, nextNormal };
}

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

function computeSplitRhatAndEss(chains: number[][]): { rhat: number; ess: number } {
  const m = chains.length;
  if (m < 2 || chains[0].length < 8) return { rhat: 1.0, ess: chains[0]?.length || 1 };
  const splitChains: number[][] = [];
  chains.forEach(ch => {
    const half = Math.floor(ch.length / 2);
    splitChains.push(ch.slice(0, half));
    splitChains.push(ch.slice(half, 2 * half));
  });
  const M = splitChains.length;
  const N = splitChains[0].length;
  const chainMeans = splitChains.map(c => c.reduce((s, v) => s + v, 0) / N);
  const grandMean = chainMeans.reduce((s, v) => s + v, 0) / M;

  const B = (N / Math.max(1, M - 1)) * chainMeans.reduce((s, cm) => s + (cm - grandMean) ** 2, 0);
  const chainVars = splitChains.map((c, idx) =>
    c.reduce((s, v) => s + (v - chainMeans[idx]) ** 2, 0) / Math.max(1, N - 1)
  );
  const W = chainVars.reduce((s, v) => s + v, 0) / M;
  if (W <= 1e-14) return { rhat: 1.0, ess: M * N };

  const varPlus = ((N - 1) / N) * W + (1 / N) * B;
  const rhat = Math.sqrt(Math.max(1, varPlus / W));

  const pooledVar = varPlus;
  let sumRho = 0;
  const maxLag = Math.min(25, Math.floor(N / 3));
  for (let lag = 1; lag <= maxLag; lag++) {
    let cov = 0;
    let cnt = 0;
    splitChains.forEach((c, cIdx) => {
      const mean = chainMeans[cIdx];
      for (let t = lag; t < N; t++) {
        cov += (c[t] - mean) * (c[t - lag] - mean);
        cnt++;
      }
    });
    const rho = cnt > 0 && pooledVar > 1e-14 ? (cov / cnt) / pooledVar : 0;
    if (rho <= 0) break;
    sumRho += rho;
  }
  const tau = 1 + 2 * sumRho;
  const ess = Math.max(1, Math.round((M * N) / Math.max(1, tau)));
  return { rhat, ess };
}

/**
 * Compute analytical Grubbs (1948, 1973) triangulation error variance estimates for J >= 3 sources.
 */
function computeGrubbsTriangulation(matX: number[][], J: number): {
  grubbsVar: number[];
  sampleMean: number[];
  sampleVar: number[];
  covMat: number[][];
} {
  const P = matX.length;
  const sampleMean = new Array(J).fill(0);
  for (let j = 0; j < J; j++) {
    let s = 0;
    for (let p = 0; p < P; p++) s += matX[p][j];
    sampleMean[j] = s / Math.max(1, P);
  }

  // Note: MLE sample covariance (divide by P) matches exact Gaussian Woodbury trace
  const covMat: number[][] = Array.from({ length: J }, () => new Array(J).fill(0));
  const covSample: number[][] = Array.from({ length: J }, () => new Array(J).fill(0));
  for (let a = 0; a < J; a++) {
    for (let b = a; b < J; b++) {
      let s = 0;
      for (let p = 0; p < P; p++) {
        s += (matX[p][a] - sampleMean[a]) * (matX[p][b] - sampleMean[b]);
      }
      covMat[a][b] = s / Math.max(1, P);
      covMat[b][a] = covMat[a][b];
      covSample[a][b] = s / Math.max(1, P - 1);
      covSample[b][a] = covSample[a][b];
    }
  }
  const sampleVar = Array.from({ length: J }, (_, j) => Math.max(1e-9, covSample[j][j]));

  const grubbsVar = new Array(J).fill(0);
  if (J < 3) {
    const s12 = Math.max(0, covSample[0]?.[1] ?? 0);
    for (let j = 0; j < J; j++) {
      grubbsVar[j] = Math.max(1e-4 * sampleVar[j], sampleVar[j] - s12);
    }
    return { grubbsVar, sampleMean, sampleVar, covMat };
  }

  for (let j = 0; j < J; j++) {
    const ests: number[] = [];
    for (let a = 0; a < J; a++) {
      if (a === j) continue;
      for (let b = a + 1; b < J; b++) {
        if (b === j) continue;
        if (Math.abs(covSample[a][b]) > 1e-8) {
          const est = covSample[j][j] - (covSample[j][a] * covSample[j][b]) / covSample[a][b];
          if (Number.isFinite(est)) ests.push(est);
        }
      }
    }
    const rawEst = ests.length > 0 ? medianOf(ests) : 0.25 * sampleVar[j];
    grubbsVar[j] = Math.min(0.98 * sampleVar[j], Math.max(1e-5 * sampleVar[j], rawEst));
  }

  return { grubbsVar, sampleMean, sampleVar, covMat };
}

/**
 * Evaluate exact Marginal Gaussian Log-Posterior with θ_it analytically integrated out
 * via Woodbury Matrix Identity & Sylvester Determinant Theorem.
 * Completely eliminates Heywood collapse and latent-variable pinning in MCMC!
 */
function evalMarginalLogPosterior(params: {
  P: number;
  J: number;
  sampleMean: number[];
  covMat: number[][]; // 1/P sum (x - xbar)(x - xbar)' on normalized O(1) scale
  alpha: number[];
  lambda: number[];
  errVar: number[];
  muTheta: number;
  varTheta: number;
  priorScaleSig: number;
  priorAlphaSd: number;
  priorMedianVar: number;
}): number {
  const {
    P,
    J,
    sampleMean,
    covMat,
    alpha,
    lambda,
    errVar,
    muTheta,
    varTheta,
    priorScaleSig,
    priorAlphaSd,
    priorMedianVar
  } = params;

  let D = 1 / Math.max(1e-10, varTheta);
  let sumLogPsi = 0;
  const v = new Array(J);
  for (let j = 0; j < J; j++) {
    const psi = Math.max(1e-10, errVar[j]);
    sumLogPsi += Math.log(psi);
    v[j] = lambda[j] / psi;
    D += lambda[j] * v[j];
  }
  const factor = 1 / Math.max(1e-12, D);
  const logDetSigma = sumLogPsi + Math.log(Math.max(1e-12, varTheta)) + Math.log(Math.max(1e-12, D));

  // tr(Sigma^-1 * covMat) = sum_j covMat[j][j]/psi_j - factor * (v' covMat v)
  let trTerm = 0;
  let quadV = 0;
  for (let a = 0; a < J; a++) {
    const psiA = Math.max(1e-10, errVar[a]);
    trTerm += covMat[a][a] / psiA;
    for (let b = 0; b < J; b++) {
      quadV += v[a] * covMat[a][b] * v[b];
    }
  }
  trTerm -= factor * quadV;

  // Mean discrepancy delta = sampleMean - alpha - lambda * muTheta
  let quadDeltaPsi = 0;
  let dotDeltaV = 0;
  for (let j = 0; j < J; j++) {
    const d = sampleMean[j] - alpha[j] - lambda[j] * muTheta;
    quadDeltaPsi += (d * d) / Math.max(1e-10, errVar[j]);
    dotDeltaV += d * v[j];
  }
  const meanMahal = quadDeltaPsi - factor * dotDeltaV * dotDeltaV;

  const logLik = -0.5 * P * (logDetSigma + trTerm + meanMahal);

  // Weakly informative priors + EXACT change-of-variables Jacobians on dimensionless scale:
  // log(varTheta) Jacobian +0.5*log(varTheta); Half-Cauchy(0, priorScaleSig) on sigJ with Jacobian +log(sigJ)
  let logPrior =
    0.5 * Math.log(Math.max(1e-10, varTheta)) -
    0.5 * (Math.log(Math.max(1e-8, varTheta) / Math.max(0.05, priorMedianVar)) / 2.5) ** 2;
  for (let j = 0; j < J; j++) {
    const logL = Math.log(Math.max(0.05, lambda[j]));
    logPrior -= 0.5 * (logL / 0.5) ** 2;
    const sigJ = Math.sqrt(Math.max(1e-10, errVar[j]));
    logPrior += Math.log(sigJ) - Math.log(1 + (sigJ / Math.max(0.2, priorScaleSig)) ** 2);
    logPrior -= 0.5 * (alpha[j] / Math.max(10, priorAlphaSd)) ** 2;
  }

  return logLik + logPrior;
}

function adaptStep(cur: number, accepted: boolean, minS: number, maxS: number): number {
  return accepted ? Math.min(maxS, cur * 1.05) : Math.max(minS, cur * 0.975);
}

export function fitBayesianLatentMeasurementModel(params: {
  observations: CleanedPanelObservation[];
  sources: MeasurementSource[];
  nChains?: number;
  iterationsPerChain?: number;
  burnInPerChain?: number;
  seed?: number;
}): LatentEngineInternalOutput {
  const {
    observations,
    sources,
    nChains = 3,
    iterationsPerChain = 550,
    burnInPerChain = 350,
    seed = 20261117
  } = params;

  const P = observations.length;
  const J = sources.length;
  const matX: number[][] = observations.map(o => sources.map(s => o.values[s.id] as number));

  // Center at overall median-row average, then normalize by globalScale so ALL datasets (0.01 or 1e9) mix cleanly on O(1) scale
  const rowMedians = matX.map(row => medianOf(row));
  const globalCenter =
    rowMedians.reduce((a, b) => a + b, 0) / Math.max(1, rowMedians.length);
  const centeredX: number[][] = matX.map(row => row.map(v => v - globalCenter));

  const rawColVars: number[] = [];
  for (let j = 0; j < J; j++) {
    let m = 0;
    for (let p = 0; p < P; p++) m += centeredX[p][j];
    m /= Math.max(1, P);
    let s2 = 0;
    for (let p = 0; p < P; p++) s2 += (centeredX[p][j] - m) ** 2;
    rawColVars.push(s2 / Math.max(1, P - 1));
  }
  const rawMedianVar = medianOf(rawColVars);
  const globalScale = rawMedianVar > 1e-18 ? Math.sqrt(rawMedianVar) : 1;
  const globalScaleSq = globalScale * globalScale;
  const normX: number[][] = centeredX.map(row => row.map(v => v / globalScale));

  const { grubbsVar: grubbsVarNorm, sampleMean, sampleVar, covMat } = computeGrubbsTriangulation(
    normX,
    J
  );
  const grubbsVar = grubbsVarNorm.map(v => v * globalScaleSq);
  const medianSampleVar = Math.max(0.05, medianOf(sampleVar));
  const priorScaleSig = Math.max(1.5, Math.sqrt(medianSampleVar));
  const priorAlphaSd = Math.max(15, 5 * Math.max(...sampleMean.map(v => Math.abs(v)), 1));

  // Storage for post-burn-in identified MCMC chains [chain][iter][j] (converted back to original units)
  const alphaChains: number[][][] = Array.from({ length: nChains }, () => []);
  const lambdaChains: number[][][] = Array.from({ length: nChains }, () => []);
  const errVarChains: number[][][] = Array.from({ length: nChains }, () => []);
  const totalRmseChains: number[][][] = Array.from({ length: nChains }, () => []);
  const r2Chains: number[][][] = Array.from({ length: nChains }, () => []);
  const thetaMeanAccum = new Array(P).fill(0);
  const thetaSqAccum = new Array(P).fill(0);
  const thetaVarianceDraws: number[] = [];
  let ppcCount = 0;
  let totalDraws = 0;

  for (let c = 0; c < nChains; c++) {
    const rng = createRng(seed + c * 9173);

    // Initialize dispersed around analytical Grubbs triangulation on dimensionless O(1) scale
    const initOffset = medianOf(sampleMean);
    const alpha = sampleMean.map(
      (m, j) => m - initOffset + rng.nextNormal() * 0.05 * Math.sqrt(Math.max(1e-5, grubbsVarNorm[j]))
    );
    const lambda = sources.map(() => Math.max(0.4, 1 + rng.nextNormal() * 0.04));
    const logErrVar = grubbsVarNorm.map(
      v => Math.log(Math.max(1e-7, v)) + rng.nextNormal() * 0.12
    );
    let muTheta = initOffset + rng.nextNormal() * 0.06 * Math.sqrt(medianSampleVar);
    let logVarTheta =
      Math.log(
        Math.max(
          0.05,
          medianOf(sampleVar.map((sv, j) => Math.max(0.02, sv - grubbsVarNorm[j])))
        )
      ) +
      rng.nextNormal() * 0.1;

    const evalCur = () =>
      evalMarginalLogPosterior({
        P,
        J,
        sampleMean,
        covMat,
        alpha,
        lambda,
        errVar: logErrVar.map(lv => Math.exp(lv)),
        muTheta,
        varTheta: Math.exp(logVarTheta),
        priorScaleSig,
        priorAlphaSd,
        priorMedianVar: medianSampleVar
      });

    let currentLogPost = evalCur();
    const totalIters = burnInPerChain + iterationsPerChain;

    // Adaptive proposal step widths across ALL blocks (normalized scale -> works identically on small & huge units)
    const stepLogSig = logErrVar.map(() => 0.28);
    const stepAlpha = grubbsVarNorm.map(v =>
      Math.max(0.002, Math.sqrt(Math.max(1e-7, v) / Math.max(1, P)) * 1.6)
    );
    let stepLogLambda = 0.025;
    let stepMuTheta = Math.max(0.005, Math.sqrt(medianSampleVar / Math.max(1, P)) * 1.2);
    let stepLogVarT = 0.22;

    for (let it = 0; it < totalIters; it++) {
      // 1. Update log(errVar_j) one-by-one
      for (let j = 0; j < J; j++) {
        const oldVal = logErrVar[j];
        const prop = oldVal + rng.nextNormal() * stepLogSig[j];
        if (prop < Math.log(1e-8) || prop > Math.log(Math.max(5, 8 * sampleVar[j]))) continue;
        logErrVar[j] = prop;
        const propLogPost = evalCur();
        const accepted = Math.log(rng.nextUniform()) < propLogPost - currentLogPost;
        if (accepted) {
          currentLogPost = propLogPost;
        } else {
          logErrVar[j] = oldVal;
        }
        if (it < burnInPerChain) stepLogSig[j] = adaptStep(stepLogSig[j], accepted, 0.03, 1.5);
      }

      // 2. Update alpha_j (source intercept offset)
      for (let j = 0; j < J; j++) {
        const oldVal = alpha[j];
        alpha[j] = oldVal + rng.nextNormal() * stepAlpha[j];
        const propLogPost = evalCur();
        const accepted = Math.log(rng.nextUniform()) < propLogPost - currentLogPost;
        if (accepted) {
          currentLogPost = propLogPost;
        } else {
          alpha[j] = oldVal;
        }
        if (it < burnInPerChain) stepAlpha[j] = adaptStep(stepAlpha[j], accepted, 0.0002, 2.5);
      }

      // 3. Update log(lambda_j) (multiplicative scale)
      for (let j = 0; j < J; j++) {
        const oldL = lambda[j];
        const propL = oldL * Math.exp(rng.nextNormal() * stepLogLambda);
        if (propL < 0.2 || propL > 4.0) continue;
        lambda[j] = propL;
        const propLogPost = evalCur();
        const accepted = Math.log(rng.nextUniform()) < propLogPost - currentLogPost;
        if (accepted) {
          currentLogPost = propLogPost;
        } else {
          lambda[j] = oldL;
        }
        if (it < burnInPerChain && j === 0) {
          stepLogLambda = adaptStep(stepLogLambda, accepted, 0.002, 0.4);
        }
      }

      // 4. Update muTheta & logVarTheta jointly
      {
        const oldMu = muTheta;
        const oldLVT = logVarTheta;
        muTheta = oldMu + rng.nextNormal() * stepMuTheta;
        logVarTheta = oldLVT + rng.nextNormal() * stepLogVarT;
        let accepted = false;
        if (logVarTheta > Math.log(1e-4) && logVarTheta < Math.log(Math.max(20, 100 * medianSampleVar))) {
          const propLogPost = evalCur();
          if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
            currentLogPost = propLogPost;
            accepted = true;
          } else {
            muTheta = oldMu;
            logVarTheta = oldLVT;
          }
        } else {
          muTheta = oldMu;
          logVarTheta = oldLVT;
        }
        if (it < burnInPerChain) {
          stepMuTheta = adaptStep(stepMuTheta, accepted, 0.0005, 1.5);
          stepLogVarT = adaptStep(stepLogVarT, accepted, 0.02, 1.2);
        }
      }

      // 5. Ridge-alignment move: muTheta + delta, alpha_j - lambda_j * delta (keeps marginal mean invariant)
      {
        const delta = rng.nextNormal() * Math.max(0.02, stepMuTheta);
        const oldMu = muTheta;
        const oldAlpha = [...alpha];
        muTheta = oldMu + delta;
        for (let j = 0; j < J; j++) alpha[j] = oldAlpha[j] - lambda[j] * delta;
        const propLogPost = evalCur();
        if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
          currentLogPost = propLogPost;
        } else {
          muTheta = oldMu;
          for (let j = 0; j < J; j++) alpha[j] = oldAlpha[j];
        }
      }

      // Post-burn-in identification, Rao-Blackwellized θ conditional draw & PPC (rescaled back to original units)
      if (it >= burnInPerChain) {
        const gLambda = Math.pow(lambda.reduce((prod, v) => prod * v, 1), 1 / Math.max(1, J));
        const lambdaStar = lambda.map(v => v / Math.max(1e-6, gLambda));
        const cAnchor = medianOf(alpha.map((a, j) => a / Math.max(1e-6, lambdaStar[j])));
        const alphaStarNorm = alpha.map((a, j) => a - lambdaStar[j] * cAnchor);
        const varThetaStarNorm = gLambda * gLambda * Math.exp(logVarTheta);
        const muThetaStarNorm = cAnchor + gLambda * muTheta;
        const errVarNorm = logErrVar.map(lv => Math.exp(lv));

        alphaChains[c].push(alphaStarNorm.map(a => a * globalScale));
        lambdaChains[c].push(lambdaStar);
        errVarChains[c].push(errVarNorm.map(ev => ev * globalScaleSq));

        // Conditional draw of theta_p | X_norm, alpha*, lambda*, errVar_norm (Rao-Blackwellized)
        let precSum = 1 / Math.max(1e-10, varThetaStarNorm);
        for (let j = 0; j < J; j++) {
          precSum += (lambdaStar[j] * lambdaStar[j]) / Math.max(1e-10, errVarNorm[j]);
        }
        const postVarT = 1 / precSum;
        const postSdT = Math.sqrt(postVarT);

        let empThetaMeanNorm = 0;
        const thetaDrawNorm = new Array(P);
        for (let p = 0; p < P; p++) {
          let info = muThetaStarNorm / Math.max(1e-10, varThetaStarNorm);
          for (let j = 0; j < J; j++) {
            info += (lambdaStar[j] * (normX[p][j] - alphaStarNorm[j])) / Math.max(1e-10, errVarNorm[j]);
          }
          const tpNorm = postVarT * info + rng.nextNormal() * postSdT;
          thetaDrawNorm[p] = tpNorm;
          empThetaMeanNorm += tpNorm;
          const absThetaOrig = globalCenter + tpNorm * globalScale;
          thetaMeanAccum[p] += absThetaOrig;
          thetaSqAccum[p] += absThetaOrig * absThetaOrig;
        }
        empThetaMeanNorm /= Math.max(1, P);
        let empVarThetaNorm = 0;
        for (let p = 0; p < P; p++) empVarThetaNorm += (thetaDrawNorm[p] - empThetaMeanNorm) ** 2;
        empVarThetaNorm /= Math.max(1, P - 1);
        thetaVarianceDraws.push(empVarThetaNorm * globalScaleSq);

        // Posterior Predictive Discrepancy Check (Chi-square scaled residuals on norm scale -> exact match)
        let obsSse = 0;
        let repSse = 0;
        for (let j = 0; j < J; j++) {
          const sdJ = Math.sqrt(Math.max(1e-10, errVarNorm[j]));
          for (let p = 0; p < P; p++) {
            const res = normX[p][j] - (alphaStarNorm[j] + lambdaStar[j] * thetaDrawNorm[p]);
            obsSse += (res * res) / Math.max(1e-10, errVarNorm[j]);
            const rep = rng.nextNormal() * sdJ;
            repSse += (rep * rep) / Math.max(1e-10, errVarNorm[j]);
          }
        }
        if (repSse >= obsSse) ppcCount++;

        const rmseDraw = new Array(J);
        const r2Draw = new Array(J);
        for (let j = 0; j < J; j++) {
          const signalVarNorm = lambdaStar[j] * lambdaStar[j] * empVarThetaNorm;
          const mseTotNorm =
            alphaStarNorm[j] * alphaStarNorm[j] +
            (lambdaStar[j] - 1) * (lambdaStar[j] - 1) * empVarThetaNorm +
            errVarNorm[j];
          rmseDraw[j] = Math.sqrt(Math.max(0, mseTotNorm)) * globalScale;
          r2Draw[j] = signalVarNorm / Math.max(1e-12, signalVarNorm + errVarNorm[j]);
        }
        totalRmseChains[c].push(rmseDraw);
        r2Chains[c].push(r2Draw);
        totalDraws++;
      }
    }
  }

  // Posterior summaries, Expected Rank, Ranking Stability & Bayesian winner counts across all chains
  const flatBestTotalCounts = new Array(J).fill(0);
  const flatBestPrecCounts = new Array(J).fill(0);
  const rankSums = new Array(J).fill(0);
  const rankCounts: number[][] = Array.from({ length: J }, () => new Array(J).fill(0));
  const pairwiseWins = new Map<string, number>();

  for (let c = 0; c < nChains; c++) {
    for (let s = 0; s < iterationsPerChain; s++) {
      const rmses = totalRmseChains[c][s];
      const vars = errVarChains[c][s];

      let bestTotIdx = 0;
      let bestPrecIdx = 0;
      for (let j = 1; j < J; j++) {
        if (rmses[j] < rmses[bestTotIdx]) bestTotIdx = j;
        if (vars[j] < vars[bestPrecIdx]) bestPrecIdx = j;
      }
      flatBestTotalCounts[bestTotIdx]++;
      flatBestPrecCounts[bestPrecIdx]++;

      // Order sources in this draw from lowest RMSE (rank 0) to highest RMSE (rank J-1)
      const order = Array.from({ length: J }, (_, idx) => idx).sort((a, b) => rmses[a] - rmses[b]);
      order.forEach((srcIdx, rPos) => {
        rankSums[srcIdx] += rPos + 1;
        rankCounts[srcIdx][rPos]++;
      });

      for (let a = 0; a < J; a++) {
        for (let b = 0; b < J; b++) {
          if (a === b) continue;
          const k = `${sources[a].id}::${sources[b].id}`;
          if (rmses[a] < rmses[b]) {
            pairwiseWins.set(k, (pairwiseWins.get(k) || 0) + 1);
          }
        }
      }
    }
  }

  const pairwisePosteriorProb: Record<string, number> = {};
  pairwiseWins.forEach((cnt, key) => {
    pairwisePosteriorProb[key] = cnt / Math.max(1, totalDraws);
  });

  const sharedLatentTheta = thetaMeanAccum.map(sum => sum / Math.max(1, totalDraws));
  const latentThetaSeries = observations.map((o, p) => {
    const mean = sharedLatentTheta[p];
    const v = Math.max(0, thetaSqAccum[p] / Math.max(1, totalDraws) - mean * mean);
    const sd = Math.sqrt(v);
    return {
      pairKey: o.pairKey,
      city: o.city,
      year: o.year,
      thetaMean: mean,
      thetaSd: sd,
      thetaCiLower: mean - 1.96 * sd,
      thetaCiUpper: mean + 1.96 * sd
    };
  });

  const thetaOverallMean =
    sharedLatentTheta.reduce((s, v) => s + v, 0) / Math.max(1, sharedLatentTheta.length);
  const thetaOverallSd = Math.sqrt(
    sharedLatentTheta.reduce((s, v) => s + (v - thetaOverallMean) ** 2, 0) /
      Math.max(1, sharedLatentTheta.length - 1)
  );
  const avgEmpVarTheta =
    thetaVarianceDraws.reduce((s, v) => s + v, 0) / Math.max(1, thetaVarianceDraws.length);

  let maxRhat = 1.0;
  let minEss = totalDraws;

  const sourceEstimates: LatentSourceEstimate[] = sources.map((src, j) => {
    const aChainsJ = alphaChains.map(ch => ch.map(row => row[j]));
    const lChainsJ = lambdaChains.map(ch => ch.map(row => row[j]));
    const vChainsJ = errVarChains.map(ch => ch.map(row => row[j]));
    const sdChainsJ = vChainsJ.map(ch => ch.map(v => Math.sqrt(Math.max(0, v))));
    const rmseChainsJ = totalRmseChains.map(ch => ch.map(row => row[j]));
    const r2ChainsJ = r2Chains.map(ch => ch.map(row => row[j]));

    const convErr = computeSplitRhatAndEss(sdChainsJ);
    const convAlpha = computeSplitRhatAndEss(aChainsJ);
    maxRhat = Math.max(maxRhat, convErr.rhat, convAlpha.rhat);
    minEss = Math.min(minEss, convErr.ess, convAlpha.ess);

    const flatA = aChainsJ.flat().sort((x, y) => x - y);
    const flatL = lChainsJ.flat().sort((x, y) => x - y);
    const flatV = vChainsJ.flat().sort((x, y) => x - y);
    const flatSd = sdChainsJ.flat().sort((x, y) => x - y);
    const flatRmse = rmseChainsJ.flat().sort((x, y) => x - y);
    const flatR2 = r2ChainsJ.flat().sort((x, y) => x - y);

    const meanOf = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    const interceptBiasAlpha = meanOf(flatA);
    const loadingLambda = meanOf(flatL);
    const errorVariance = meanOf(flatV);
    const errorSd = meanOf(flatSd);
    const totalLatentRmse = meanOf(flatRmse);
    const totalLatentMse = totalLatentRmse * totalLatentRmse;
    const posteriorExpectedLoss =
      flatRmse.reduce((s, r) => s + r * r, 0) / Math.max(1, flatRmse.length);
    const scaleDistortionComponent =
      Math.abs(loadingLambda - 1) * Math.sqrt(Math.max(0, avgEmpVarTheta));
    const reliabilityR2 = meanOf(flatR2);
    const signalToNoiseRatio =
      (loadingLambda * loadingLambda * avgEmpVarTheta) / Math.max(1e-12, errorVariance);
    const expectedRank = rankSums[j] / Math.max(1, totalDraws);
    const maxRankCount = Math.max(...rankCounts[j], 0);
    const rankingStabilityPct = (maxRankCount / Math.max(1, totalDraws)) * 100;

    // Thin trace draws to at most 60 points per chain for responsive Step 5 Trace Visualization
    const mcmcTraceDraws = rmseChainsJ.map(ch => {
      const targetLen = Math.min(60, ch.length);
      if (targetLen <= 0) return [];
      const stride = Math.max(1, Math.floor(ch.length / targetLen));
      const out: number[] = [];
      for (let idx = 0; idx < ch.length && out.length < targetLen; idx += stride) {
        out.push(ch[idx]);
      }
      return out;
    });

    return {
      sourceId: src.id,
      sourceName: src.name,
      sourceLabel: `${src.name} (${src.label})`,
      interceptBiasAlpha,
      interceptBiasCiLower: quantileSorted(flatA, 0.025),
      interceptBiasCiUpper: quantileSorted(flatA, 0.975),
      loadingLambda,
      loadingCiLower: quantileSorted(flatL, 0.025),
      loadingCiUpper: quantileSorted(flatL, 0.975),
      errorVariance,
      errorVarianceCiLower: quantileSorted(flatV, 0.025),
      errorVarianceCiUpper: quantileSorted(flatV, 0.975),
      errorSd,
      errorSdCiLower: quantileSorted(flatSd, 0.025),
      errorSdCiUpper: quantileSorted(flatSd, 0.975),
      totalLatentMse,
      totalLatentRmse,
      totalLatentRmseCiLower: quantileSorted(flatRmse, 0.025),
      totalLatentRmseCiUpper: quantileSorted(flatRmse, 0.975),
      reliabilityR2,
      reliabilityCiLower: quantileSorted(flatR2, 0.025),
      reliabilityCiUpper: quantileSorted(flatR2, 0.975),
      signalToNoiseRatio,
      posteriorProbBestTotalError: flatBestTotalCounts[j] / Math.max(1, totalDraws),
      posteriorProbBestPrecision: flatBestPrecCounts[j] / Math.max(1, totalDraws),
      grubbsErrorVariance: grubbsVar[j],
      scaleDistortionComponent,
      posteriorExpectedLoss,
      expectedRank,
      rankingStabilityPct,
      mcmcTraceDraws,
      mcmcRhat: Number(Math.max(convErr.rhat, convAlpha.rhat).toFixed(4)),
      mcmcEss: Math.min(convErr.ess, convAlpha.ess)
    };
  });

  // True Out-of-Sample Leave-One-Source-Out (LOSO) Re-Estimation:
  // For each target source j, re-estimate peer parameters solely from the remaining J-1 sources
  const losoConsensusBySource: Record<string, number[]> = {};
  const losoPredictiveSeBySource: Record<string, number> = {};
  sources.forEach((targetSrc, targetIdx) => {
    const peerIndices = sources.map((_, m) => m).filter(m => m !== targetIdx);
    const JSub = peerIndices.length;
    if (JSub === 0) {
      losoConsensusBySource[targetSrc.id] = [...sharedLatentTheta];
      losoPredictiveSeBySource[targetSrc.id] = sourceEstimates[targetIdx]?.errorSd ?? 1;
      return;
    }

    const subMatX = centeredX.map(row => peerIndices.map(m => row[m]));
    const subGrubbs = computeGrubbsTriangulation(subMatX, JSub);

    // Estimate out-of-sample peer loadings & biases solely from subMatX (without target source j)
    const rawLoadings = peerIndices.map((_, k) => {
      if (JSub < 2) return 1;
      let covSum = 0;
      let cnt = 0;
      for (let other = 0; other < JSub; other++) {
        if (other === k) continue;
        covSum += Math.max(0.05 * Math.sqrt(subGrubbs.sampleVar[k] * subGrubbs.sampleVar[other]), subGrubbs.covMat[k][other]);
        cnt++;
      }
      return Math.max(0.25, Math.sqrt(Math.max(1e-9, covSum / Math.max(1, cnt))));
    });
    const geoSubL = Math.pow(rawLoadings.reduce((pr, v) => pr * v, 1), 1 / Math.max(1, JSub));
    const peerLambdas = rawLoadings.map(v => v / Math.max(1e-6, geoSubL));
    const peerAnchor = medianOf(subGrubbs.sampleMean.map((m, k) => m / Math.max(0.1, peerLambdas[k])));
    const peerAlphas = subGrubbs.sampleMean.map((m, k) => m - peerLambdas[k] * peerAnchor);
    const peerErrVars = subGrubbs.grubbsVar.map(v => Math.max(1e-12, v));

    let wSumTotal = 0;
    peerIndices.forEach((_, k) => {
      wSumTotal += (peerLambdas[k] * peerLambdas[k]) / peerErrVars[k];
    });
    const varThetaLoso = 1 / Math.max(1e-12, wSumTotal);
    const targetEst = sourceEstimates[targetIdx];
    const predVar =
      targetEst.loadingLambda * targetEst.loadingLambda * varThetaLoso + targetEst.errorVariance;
    losoPredictiveSeBySource[targetSrc.id] = Math.sqrt(Math.max(1e-12, predVar));

    const arr: number[] = observations.map((_, p) => {
      let wSum = 0;
      let valSum = 0;
      peerIndices.forEach((m, k) => {
        const w = (peerLambdas[k] * peerLambdas[k]) / peerErrVars[k];
        const deBiasedPeer =
          globalCenter + (centeredX[p][m] - peerAlphas[k]) / Math.max(0.1, peerLambdas[k]);
        valSum += w * deBiasedPeer;
        wSum += w;
      });
      return wSum > 1e-12 ? valSum / wSum : sharedLatentTheta[p];
    });
    losoConsensusBySource[targetSrc.id] = arr;
  });

  // Residual Error Correlation Matrix & Correlated Measurement Error Detection (Section D3)
  // Compute de-biased, scale-standardized measurement series Z_pj = (centeredX_pj - alpha_j) / lambda_j
  const zBySource: number[][] = sources.map((_, j) => {
    const est = sourceEstimates[j];
    return observations.map((_, p) => (centeredX[p][j] - est.interceptBiasAlpha) / Math.max(0.1, est.loadingLambda));
  });

  const residualCorrelationMatrix: number[][] = Array.from({ length: J }, (_, a) =>
    Array.from({ length: J }, (__, b) => (a === b ? 1 : 0))
  );
  const correlatedErrorPairs: CorrelatedErrorPairItem[] = [];

  for (let a = 0; a < J; a++) {
    for (let b = a + 1; b < J; b++) {
      // To avoid mechanical negative correlation from including (a, b) in their own reference,
      // evaluate residuals against remaining peer(s) when J >= 3
      const otherIndices = sources.map((_, m) => m).filter(m => m !== a && m !== b);
      const resA: number[] = [];
      const resB: number[] = [];
      for (let p = 0; p < P; p++) {
        const refP =
          otherIndices.length > 0
            ? medianOf(otherIndices.map(m => zBySource[m][p]))
            : sharedLatentTheta[p] - globalCenter;
        resA.push(zBySource[a][p] - refP);
        resB.push(zBySource[b][p] - refP);
      }
      const rLeavePair = computePearsonR(resA, resB);

      // Direct posterior residual correlation against sharedLatentTheta
      const postResA = observations.map((_, p) => zBySource[a][p] - (sharedLatentTheta[p] - globalCenter));
      const postResB = observations.map((_, p) => zBySource[b][p] - (sharedLatentTheta[p] - globalCenter));
      const rPost = computePearsonR(postResA, postResB);

      // When J == 3, leave-pair-out uses a single 3rd source c, so Cov(Z_a - Z_c, Z_b - Z_c) = Cov(e_a, e_b) + Var(e_c).
      // Subtract the expected contribution of Var(e_c) so independent sources have ~0 excess correlation!
      let effectiveR = rPost;
      if (J >= 4) {
        effectiveR = 0.65 * rLeavePair + 0.35 * rPost;
      } else if (J === 3 && otherIndices.length === 1) {
        const cIdx = otherIndices[0];
        const varC = sourceEstimates[cIdx].errorVariance / Math.max(0.01, sourceEstimates[cIdx].loadingLambda ** 2);
        const varDiffA =
          resA.reduce((s, v) => s + v * v, 0) / Math.max(1, P - 1);
        const varDiffB =
          resB.reduce((s, v) => s + v * v, 0) / Math.max(1, P - 1);
        const covAB =
          resA.reduce((s, v, idx) => s + v * resB[idx], 0) / Math.max(1, P - 1);
        const excessCov = covAB - varC;
        const denom = Math.sqrt(Math.max(1e-12, Math.max(1e-9, varDiffA - varC) * Math.max(1e-9, varDiffB - varC)));
        const rExcess = Math.max(-0.99, Math.min(0.99, excessCov / denom));
        effectiveR = Math.abs(rExcess) > Math.abs(rPost) ? rExcess : rPost;
      }

      residualCorrelationMatrix[a][b] = effectiveR;
      residualCorrelationMatrix[b][a] = effectiveR;

      const dfR = Math.max(1, P - 2);
      const tR =
        Math.abs(effectiveR) < 0.9999
          ? ( Math.abs(effectiveR) * Math.sqrt(dfR) ) / Math.sqrt(Math.max(1e-12, 1 - effectiveR * effectiveR))
          : 99;
      const pVal = studentTPValueTwoSided(tR, dfR);

      if (effectiveR > 0.38 && pVal < 0.05) {
        correlatedErrorPairs.push({
          sourceAId: sources[a].id,
          sourceAName: sources[a].name,
          sourceBId: sources[b].id,
          sourceBName: sources[b].name,
          residualCorr: effectiveR,
          pValue: pVal,
          warning: `Terdeteksi korelasi kesalahan pengukuran positif antara ${sources[a].name} dan ${sources[b].name} (r_ε = ${effectiveR.toFixed(3)}, p = ${pVal.toFixed(4)}). Kedua sumber berpotensi berbagi metodologi/sensor/algoritma yang sama.`
        });
      }
    }
  }

  // Correlated-Error Adjusted Top Source Check (down-weights positively correlated error twins)
  const corrPenaltyBySource = sources.map((_, j) => {
    let posCorrSum = 0;
    for (let m = 0; m < J; m++) {
      if (m === j) continue;
      if (residualCorrelationMatrix[j][m] > 0.35) {
        posCorrSum += residualCorrelationMatrix[j][m];
      }
    }
    return 1 + posCorrSum;
  });

  const adjTheta = observations.map((_, p) => {
    let wSum = 0;
    let valSum = 0;
    sources.forEach((__, j) => {
      const est = sourceEstimates[j];
      const w =
        (est.loadingLambda * est.loadingLambda) /
        (Math.max(1e-12, est.errorVariance) * corrPenaltyBySource[j]);
      valSum += w * (globalCenter + zBySource[j][p]);
      wSum += w;
    });
    return wSum > 1e-12 ? valSum / wSum : sharedLatentTheta[p];
  });

  let bestAdjId: string | null = null;
  let bestAdjRmse = Infinity;
  sources.forEach((src, j) => {
    let sse = 0;
    for (let p = 0; p < P; p++) {
      const err = matX[p][j] - adjTheta[p];
      sse += err * err * corrPenaltyBySource[j];
    }
    const rmseAdj = Math.sqrt(sse / Math.max(1, P));
    if (rmseAdj < bestAdjRmse) {
      bestAdjRmse = rmseAdj;
      bestAdjId = src.id;
    }
  });

  const weakIdentificationSources = sourceEstimates
    .filter((e, j) => {
      const colJ = observations.map((_, p) => matX[p][j]);
      let peerCorrSum = 0;
      let peerCnt = 0;
      for (let m = 0; m < J; m++) {
        if (m === j) continue;
        peerCorrSum += computePearsonR(
          colJ,
          observations.map((_, p) => matX[p][m])
        );
        peerCnt++;
      }
      const meanPeerR = peerCnt > 0 ? peerCorrSum / peerCnt : 1;
      return e.loadingLambda <= 0.2 || e.reliabilityR2 < 0.25 || meanPeerR < 0.3;
    })
    .map(e => e.sourceLabel);

  const summary: LatentModelSummary = {
    nSources: J,
    nPairs: P,
    nChains,
    iterationsPerChain,
    burnInPerChain,
    maxRhat: Number(maxRhat.toFixed(4)),
    minEss,
    converged: maxRhat <= 1.1 && J >= 3,
    latentThetaMean: thetaOverallMean,
    latentThetaSd: thetaOverallSd,
    posteriorPredictivePValue: ppcCount / Math.max(1, totalDraws),
    identificationRule:
      J >= 3
        ? 'Identifikasi penuh J >= 3 sumber (Marginalized Woodbury Factor Model): Median(α_j / λ_j) = 0 (location anchor) dan GeometricMean(λ_j) = 1 (scale anchor).'
        : 'UNDERIDENTIFIED (J < 3): Tanpa sumber ke-3 atau benchmark eksternal, varians galat spesifik tiap sumber tidak teridentifikasi secara unik.',
    epistemologicalCaveat:
      'Keterbatasan Epistemologis: Model Bayesian Latent Truth mengukur kedekatan terhadap sinyal konsensus laten antar-instrumen; bila seluruh instrumen berbagi bias sistematis searah (shared bias), bias kolektif tersebut tidak dapat terdeteksi tanpa kalibrasi fisik eksternal.',
    residualCorrelationMatrix,
    correlatedErrorPairs,
    weakIdentificationSources,
    correlatedErrorAdjustedTopSourceId: bestAdjId,
    latentThetaSeries,
    sourceEstimates
  };

  return {
    summary,
    pairwisePosteriorProb,
    losoConsensusBySource,
    losoPredictiveSeBySource,
    sharedLatentTheta
  };
}
