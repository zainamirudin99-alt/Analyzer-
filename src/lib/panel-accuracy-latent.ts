// ============================================================
// Reference-Free All-Source Latent Measurement Accuracy Engine
// Marginalized Bayesian Hierarchical Congeneric Panel Model (MCMC)
// + Woodbury Analytical θ Integration (No Heywood Collapse!)
// + Grubbs Analytical Triangulation + Leave-One-Source-Out Consensus
// Evaluates & ranks ALL J >= 3 measurement sources equally without
// locking any variable as a privileged reference source.
// ============================================================

import {
  CleanedPanelObservation,
  LatentModelSummary,
  LatentSourceEstimate,
  MeasurementSource
} from './panel-accuracy-types';
import { quantileSorted } from './panel-accuracy-validation';

export interface LatentEngineInternalOutput {
  summary: LatentModelSummary;
  pairwisePosteriorProb: Record<string, number>;
  losoConsensusBySource: Record<string, number[]>;
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
  covMat: number[][]; // 1/P sum (x - xbar)(x - xbar)'
  alpha: number[];
  lambda: number[];
  errVar: number[];
  muTheta: number;
  varTheta: number;
  priorScaleSig: number;
}): number {
  const { P, J, sampleMean, covMat, alpha, lambda, errVar, muTheta, varTheta, priorScaleSig } = params;

  let D = 1 / Math.max(1e-8, varTheta);
  let sumLogPsi = 0;
  const v = new Array(J);
  for (let j = 0; j < J; j++) {
    const psi = Math.max(1e-6, errVar[j]);
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
    const psiA = Math.max(1e-6, errVar[a]);
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
    quadDeltaPsi += (d * d) / Math.max(1e-6, errVar[j]);
    dotDeltaV += d * v[j];
  }
  const meanMahal = quadDeltaPsi - factor * dotDeltaV * dotDeltaV;

  const logLik = -0.5 * P * (logDetSigma + trTerm + meanMahal);

  // Weakly informative priors + EXACT change-of-variables Jacobians for log-parameterization!
  // Sampling in log(varTheta) -> Jacobian +log(varTheta); Half-Cauchy(0, S) on sigJ sampled in log(psi) -> Jacobian +log(sigJ)
  let logPrior = 0.5 * Math.log(Math.max(1e-6, varTheta));
  for (let j = 0; j < J; j++) {
    // Log-normal(0, 0.5) prior on lambda_j; proposal on log(lambda_j) absorbs -log(lambda_j) Jacobian cleanly
    const logL = Math.log(Math.max(0.05, lambda[j]));
    logPrior -= 0.5 * (logL / 0.5) ** 2;
    // Proper Half-Cauchy prior on error SD sigJ (with Jacobian +log(sigJ) when stepping in log(errVar))
    const sigJ = Math.sqrt(Math.max(1e-6, errVar[j]));
    logPrior += Math.log(sigJ) - Math.log(1 + (sigJ / Math.max(1, priorScaleSig)) ** 2);
    // Diffuse prior on intercept offset alpha_j
    logPrior -= 0.5 * (alpha[j] / Math.max(50, 2 * priorScaleSig)) ** 2;
  }

  return logLik + logPrior;
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
    iterationsPerChain = 450,
    burnInPerChain = 250,
    seed = 20261117
  } = params;

  const P = observations.length;
  const J = sources.length;
  const matX: number[][] = observations.map(o => sources.map(s => o.values[s.id] as number));

  // Center at overall mean so intercept and loading parameters are cleanly orthogonal
  const rowMedians = matX.map(row => medianOf(row));
  const globalCenter =
    rowMedians.reduce((a, b) => a + b, 0) / Math.max(1, rowMedians.length);
  const centeredX: number[][] = matX.map(row => row.map(v => v - globalCenter));

  const { grubbsVar, sampleMean, sampleVar, covMat } = computeGrubbsTriangulation(centeredX, J);
  const medianSampleVar = Math.max(1, medianOf(sampleVar));
  const priorScaleSig = Math.max(10, Math.sqrt(medianSampleVar));

  // Storage for post-burn-in identified MCMC chains [chain][iter][j]
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

    // Initialize dispersed around analytical Grubbs triangulation
    const initOffset = medianOf(sampleMean);
    const alpha = sampleMean.map((m, j) => m - initOffset + rng.nextNormal() * 0.08 * Math.sqrt(grubbsVar[j]));
    const lambda = sources.map(() => Math.max(0.5, 1 + rng.nextNormal() * 0.04));
    const logErrVar = grubbsVar.map(v => Math.log(Math.max(1e-4 * medianSampleVar, v)) + rng.nextNormal() * 0.12);
    let muTheta = initOffset + rng.nextNormal() * 1.0;
    let logVarTheta = Math.log(Math.max(1, medianOf(sampleVar.map((sv, j) => Math.max(0.5, sv - grubbsVar[j])))));

    let currentLogPost = evalMarginalLogPosterior({
      P,
      J,
      sampleMean,
      covMat,
      alpha,
      lambda,
      errVar: logErrVar.map(lv => Math.exp(lv)),
      muTheta,
      varTheta: Math.exp(logVarTheta),
      priorScaleSig
    });

    const totalIters = burnInPerChain + iterationsPerChain;

    // Adaptive proposal step widths (scaled gently after initial burn-in)
    const stepLogSig = logErrVar.map(() => 0.25);
    const stepAlpha = grubbsVar.map(v => Math.max(0.4, Math.sqrt(v / Math.max(1, P)) * 1.6));
    const stepLogLambda = 0.015;
    const stepMuTheta = Math.max(0.5, Math.sqrt(medianOf(grubbsVar) / Math.max(1, P)) * 1.4);
    const stepLogVarT = 0.22;

    for (let it = 0; it < totalIters; it++) {
      // 1. Update log(errVar_j) one-by-one on exact marginal posterior
      for (let j = 0; j < J; j++) {
        const oldVal = logErrVar[j];
        const prop = oldVal + rng.nextNormal() * stepLogSig[j];
        if (prop < Math.log(1e-6 * medianSampleVar) || prop > Math.log(5 * sampleVar[j])) continue;
        logErrVar[j] = prop;
        const propLogPost = evalMarginalLogPosterior({
          P,
          J,
          sampleMean,
          covMat,
          alpha,
          lambda,
          errVar: logErrVar.map(lv => Math.exp(lv)),
          muTheta,
          varTheta: Math.exp(logVarTheta),
          priorScaleSig
        });
        if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
          currentLogPost = propLogPost;
          if (it < burnInPerChain) stepLogSig[j] = Math.min(1.5, stepLogSig[j] * 1.04);
        } else {
          logErrVar[j] = oldVal;
          if (it < burnInPerChain) stepLogSig[j] = Math.max(0.03, stepLogSig[j] * 0.98);
        }
      }

      // 2. Update alpha_j (source intercept offset)
      for (let j = 0; j < J; j++) {
        const oldVal = alpha[j];
        alpha[j] = oldVal + rng.nextNormal() * stepAlpha[j];
        const propLogPost = evalMarginalLogPosterior({
          P,
          J,
          sampleMean,
          covMat,
          alpha,
          lambda,
          errVar: logErrVar.map(lv => Math.exp(lv)),
          muTheta,
          varTheta: Math.exp(logVarTheta),
          priorScaleSig
        });
        if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
          currentLogPost = propLogPost;
        } else {
          alpha[j] = oldVal;
        }
      }

      // 3. Update log(lambda_j) (multiplicative scale)
      for (let j = 0; j < J; j++) {
        const oldL = lambda[j];
        const propL = oldL * Math.exp(rng.nextNormal() * stepLogLambda);
        if (propL < 0.2 || propL > 4.0) continue;
        lambda[j] = propL;
        const propLogPost = evalMarginalLogPosterior({
          P,
          J,
          sampleMean,
          covMat,
          alpha,
          lambda,
          errVar: logErrVar.map(lv => Math.exp(lv)),
          muTheta,
          varTheta: Math.exp(logVarTheta),
          priorScaleSig
        });
        // Jacobian +log(propL/oldL) handled cleanly on log scale proposal
        if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
          currentLogPost = propLogPost;
        } else {
          lambda[j] = oldL;
        }
      }

      // 4. Update muTheta & logVarTheta jointly
      {
        const oldMu = muTheta;
        const oldLVT = logVarTheta;
        muTheta = oldMu + rng.nextNormal() * stepMuTheta;
        logVarTheta = oldLVT + rng.nextNormal() * stepLogVarT;
        if (logVarTheta > -5 && logVarTheta < Math.log(100 * medianSampleVar)) {
          const propLogPost = evalMarginalLogPosterior({
            P,
            J,
            sampleMean,
            covMat,
            alpha,
            lambda,
            errVar: logErrVar.map(lv => Math.exp(lv)),
            muTheta,
            varTheta: Math.exp(logVarTheta),
            priorScaleSig
          });
          if (Math.log(rng.nextUniform()) < propLogPost - currentLogPost) {
            currentLogPost = propLogPost;
          } else {
            muTheta = oldMu;
            logVarTheta = oldLVT;
          }
        } else {
          muTheta = oldMu;
          logVarTheta = oldLVT;
        }
      }

      // Post-burn-in identification, Rao-Blackwellized θ conditional draw & PPC
      if (it >= burnInPerChain) {
        const gLambda = Math.pow(lambda.reduce((prod, v) => prod * v, 1), 1 / Math.max(1, J));
        const lambdaStar = lambda.map(v => v / Math.max(1e-6, gLambda));
        const cAnchor = medianOf(alpha.map((a, j) => a / Math.max(1e-6, lambdaStar[j])));
        const alphaStar = alpha.map((a, j) => a - lambdaStar[j] * cAnchor);
        const varThetaStar = gLambda * gLambda * Math.exp(logVarTheta);
        const muThetaStar = cAnchor + gLambda * muTheta;
        const errVarCur = logErrVar.map(lv => Math.exp(lv));

        alphaChains[c].push(alphaStar);
        lambdaChains[c].push(lambdaStar);
        errVarChains[c].push(errVarCur);
        thetaVarianceDraws.push(varThetaStar);

        // Conditional draw of theta_p | X, alpha*, lambda*, errVar (Rao-Blackwellized)
        let precSum = 1 / Math.max(1e-6, varThetaStar);
        for (let j = 0; j < J; j++) {
          precSum += (lambdaStar[j] * lambdaStar[j]) / Math.max(1e-6, errVarCur[j]);
        }
        const postVarT = 1 / precSum;
        const postSdT = Math.sqrt(postVarT);

        let empThetaMean = 0;
        const thetaDraw = new Array(P);
        for (let p = 0; p < P; p++) {
          let info = muThetaStar / Math.max(1e-6, varThetaStar);
          for (let j = 0; j < J; j++) {
            info += (lambdaStar[j] * (centeredX[p][j] - alphaStar[j])) / Math.max(1e-6, errVarCur[j]);
          }
          const tp = postVarT * info + rng.nextNormal() * postSdT;
          thetaDraw[p] = tp;
          empThetaMean += tp;
          const absTheta = globalCenter + tp;
          thetaMeanAccum[p] += absTheta;
          thetaSqAccum[p] += absTheta * absTheta;
        }
        empThetaMean /= Math.max(1, P);
        let empVarTheta = 0;
        for (let p = 0; p < P; p++) empVarTheta += (thetaDraw[p] - empThetaMean) ** 2;
        empVarTheta /= Math.max(1, P - 1);

        // Posterior Predictive Discrepancy Check (Chi-square scaled residuals)
        let obsSse = 0;
        let repSse = 0;
        for (let j = 0; j < J; j++) {
          const sdJ = Math.sqrt(Math.max(1e-6, errVarCur[j]));
          for (let p = 0; p < P; p++) {
            const res = centeredX[p][j] - (alphaStar[j] + lambdaStar[j] * thetaDraw[p]);
            obsSse += (res * res) / Math.max(1e-6, errVarCur[j]);
            const rep = rng.nextNormal() * sdJ;
            repSse += (rep * rep) / Math.max(1e-6, errVarCur[j]);
          }
        }
        if (repSse >= obsSse) ppcCount++;

        const rmseDraw = new Array(J);
        const r2Draw = new Array(J);
        for (let j = 0; j < J; j++) {
          const signalVar = lambdaStar[j] * lambdaStar[j] * empVarTheta;
          const mseTot =
            alphaStar[j] * alphaStar[j] +
            (lambdaStar[j] - 1) * (lambdaStar[j] - 1) * empVarTheta +
            errVarCur[j];
          rmseDraw[j] = Math.sqrt(Math.max(0, mseTot));
          r2Draw[j] = signalVar / Math.max(1e-12, signalVar + errVarCur[j]);
        }
        totalRmseChains[c].push(rmseDraw);
        r2Chains[c].push(r2Draw);
        totalDraws++;
      }
    }
  }

  // Posterior summaries & Bayesian winner counts across all chains
  const flatBestTotalCounts = new Array(J).fill(0);
  const flatBestPrecCounts = new Array(J).fill(0);
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
    const reliabilityR2 = meanOf(flatR2);
    const signalToNoiseRatio =
      (loadingLambda * loadingLambda * avgEmpVarTheta) / Math.max(1e-9, errorVariance);

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
      mcmcRhat: Number(Math.max(convErr.rhat, convAlpha.rhat).toFixed(4)),
      mcmcEss: Math.min(convErr.ess, convAlpha.ess)
    };
  });

  // Compute Leave-One-Source-Out (LOSO) Consensus Benchmark theta_hat^(-j) for each source j
  const losoConsensusBySource: Record<string, number[]> = {};
  sources.forEach((targetSrc, targetIdx) => {
    const peerIndices = sources.map((_, m) => m).filter(m => m !== targetIdx);
    const arr: number[] = observations.map((_, p) => {
      let wSum = 0;
      let valSum = 0;
      peerIndices.forEach(m => {
        const est = sourceEstimates[m];
        const w = (est.loadingLambda * est.loadingLambda) / Math.max(1e-6, est.errorVariance);
        const deBiasedPeer =
          globalCenter +
          (centeredX[p][m] - est.interceptBiasAlpha) / Math.max(0.1, est.loadingLambda);
        valSum += w * deBiasedPeer;
        wSum += w;
      });
      return wSum > 1e-12 ? valSum / wSum : sharedLatentTheta[p];
    });
    losoConsensusBySource[targetSrc.id] = arr;
  });

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
    latentThetaSeries,
    sourceEstimates
  };

  return {
    summary,
    pairwisePosteriorProb,
    losoConsensusBySource,
    sharedLatentTheta
  };
}
