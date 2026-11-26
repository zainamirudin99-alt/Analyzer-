
import {
  MsmaBootstrapDiagnostics,
  MsmaErrorCovariancePair,
  MsmaMultiSourceCollocationResult,
  MsmaSourceAccuracyEstimate,
  MsmaSourceConfig
} from '../types';
import {
  covarianceMatrixFromColumns,
  createSeededRng,
  jacobiSymmetricEigen,
  mean,
  median,
  quantileSorted,
  sampleSd
} from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';

interface CalibratedEnsembleCore {
  identifiable: boolean;
  reason: string | null;
  betasRef1: number[];
  betasSymmetric: number[];
  alphasRef1: number[];
  latentVarianceSym: number;
  nchCalibratedVars: number[];
  nchRawVars: number[];
  nchHeywoodFlags: boolean[];
  ecCalibratedVars: number[];
  ecRawVars: number[];
  ecHeywoodFlags: boolean[];
  detectedErrorCovariances: Array<{
    i: number;
    j: number;
    covCalibrated: number;
    corr: number;
    quartetLabel: string;
  }>;
  nchFitRmse: number;
  ecFitRmse: number;
}

function makeUnidentifiedEnsemble(J: number, reason: string, betasOverride?: number[]): CalibratedEnsembleCore {
  const zeros = () => Array.from({ length: J }, () => 0);
  const ones = () => Array.from({ length: J }, () => 1);
  const falses = () => Array.from({ length: J }, () => false);
  return {
    identifiable: false,
    reason,
    betasRef1: betasOverride ?? ones(),
    betasSymmetric: ones(),
    alphasRef1: zeros(),
    latentVarianceSym: 0,
    nchCalibratedVars: zeros(),
    nchRawVars: zeros(),
    nchHeywoodFlags: falses(),
    ecCalibratedVars: zeros(),
    ecRawVars: zeros(),
    ecHeywoodFlags: falses(),
    detectedErrorCovariances: [],
    nchFitRmse: 0,
    ecFitRmse: 0
  };
}

function solveMultiSourceCore(
  cols: number[][],
  sourceNames: string[]
): CalibratedEnsembleCore {
  const J = cols.length;
  const C = covarianceMatrixFromColumns(cols);
  const means = cols.map(c => mean(c));

  for (let k = 0; k < J; k++) {
    if (C[k][k] <= 1e-12) {
      return makeUnidentifiedEnsemble(
        J,
        `Sumber "${sourceNames[k]}" memiliki varians nol (kolom konstan).`
      );
    }
  }

  const betasRef1 = Array.from({ length: J }, () => 1);
  for (let k = 1; k < J; k++) {
    const ratios: number[] = [];
    for (let m = 1; m < J; m++) {
      if (m === k) continue;
      if (Math.abs(C[0][m]) > 1e-10 && C[k][m] * C[0][m] > 0) {
        ratios.push(C[k][m] / C[0][m]);
      }
    }
    if (ratios.length === 0) {
      ratios.push(C[0][k] / Math.max(1e-10, C[0][0]));
    }
    betasRef1[k] = median(ratios);
  }

  if (betasRef1.some(b => !Number.isFinite(b) || b <= 1e-8)) {
    return makeUnidentifiedEnsemble(
      J,
      'Sebagian faktor skala antarsumber bernilai nol atau berlawanan arah sehingga kalibrasi bersama gagal.',
      betasRef1
    );
  }

  const logMeanBeta = mean(betasRef1.map(b => Math.log(Math.abs(b))));
  const geoBeta = Math.exp(logMeanBeta);
  const betasSymmetric = betasRef1.map(b => b / geoBeta);
  const alphasRef1 = cols.map((_, k) => (k === 0 ? 0 : means[k] - betasRef1[k] * means[0]));

  // Transform to symmetric calibrated scale Z_k = (X_k - alpha_k) / beta_sym_k
  // Covariance of Z is C_Z[i][j] = C[i][j] / (betasSymmetric[i] * betasSymmetric[j])
  const Cz: number[][] = Array.from({ length: J }, (_, i) =>
    Array.from({ length: J }, (__, j) => C[i][j] / (betasSymmetric[i] * betasSymmetric[j]))
  );

  // Method 1: Scale-Calibrated N-Cornered Hat (Symmetric Difference-Covariance Law + PSD Floor, Premoli & Tavella 1993)
  // On calibrated Z where loadings = 1: for any triplet (k, a, b), sigma^2_k = Cz[k][k] - Cz[k][a]*Cz[k][b]/Cz[a][b]
  // Equivalent in classic 3CH difference form: 0.5 * (Var(Z_k - Z_a) + Var(Z_k - Z_b) - Var(Z_a - Z_b)) when loadings = 1.
  const nchUnconstrained = Array.from({ length: J }, () => 0);
  const signalEstimatesAll: number[] = [];

  for (let k = 0; k < J; k++) {
    const tripletEsts: number[] = [];
    for (let a = 0; a < J; a++) {
      if (a === k) continue;
      for (let b = a + 1; b < J; b++) {
        if (b === k) continue;
        if (Cz[a][b] > 1e-10) {
          const sigT = (Cz[k][a] * Cz[k][b]) / Cz[a][b];
          signalEstimatesAll.push(sigT);
          tripletEsts.push(Cz[k][k] - sigT);
        }
      }
    }
    nchUnconstrained[k] = tripletEsts.length > 0 ? mean(tripletEsts) : 0;
  }

  const latentVarNch = signalEstimatesAll.length > 0 ? Math.max(1e-8, median(signalEstimatesAll)) : 0;
  const nchHeywoodFlags = nchUnconstrained.map(v => v < 0);
  // Premoli & Tavella (1993) PSD projection: enforce small positive floor 1e-6 * minDiag if minor negative sampling noise occurs
  const psdFloor = 1e-5 * Math.min(... Array.from({ length: J }, (_, k) => Cz[k][k]));
  const nchCalibratedVars = nchUnconstrained.map(v => Math.max(psdFloor, v));
  const nchRawVars = nchCalibratedVars.map((v, k) => v * betasSymmetric[k] * betasSymmetric[k]);

  // Method 2: Extended Collocation (Gruber et al., 2016 — Quartet Cross-Covariance Identification)
  // For each candidate pair (i, j), evaluate excess covariance across all disjoint witness pairs (c, d):
  // sigma_{eps_i, eps_j} = C_{ij} - (C_{ic}*C_{jd} + C_{id}*C_{jc}) / (2 * C_{cd})
  interface CandidatePair {
    i: number;
    j: number;
    excessCovCal: number;
    corrApprox: number;
    zStatNull: number;
    quartetLabel: string;
  }
  const candidatePairs: CandidatePair[] = [];
  const nObsSample = Math.max(4, cols[0]?.length ?? 4);

  for (let i = 0; i < J; i++) {
    for (let j = i + 1; j < J; j++) {
      const excessList: number[] = [];
      const seNullList: number[] = [];
      let bestWitness = '';

      // Approximate clean error variances of each source first
      const prelimVar = Array.from({ length: J }, () => psdFloor);
      for (let m = 0; m < J; m++) {
        const estsM: number[] = [];
        for (let a = 0; a < J; a++) {
          if (a === m) continue;
          for (let b = a + 1; b < J; b++) {
            if (b === m) continue;
            if (Cz[a][b] > 1e-10) {
              estsM.push(Math.max(psdFloor, Cz[m][m] - (Cz[m][a] * Cz[m][b]) / Cz[a][b]));
            }
          }
        }
        if (estsM.length > 0) prelimVar[m] = median(estsM);
      }

      for (let c = 0; c < J; c++) {
        if (c === i || c === j) continue;
        for (let d = c + 1; d < J; d++) {
          if (d === i || d === j) continue;
          if (Cz[c][d] > 1e-10) {
            const impliedSignalCross = (Cz[i][c] * Cz[j][d] + Cz[i][d] * Cz[j][c]) / (2 * Cz[c][d]);
            const deltaVal = Cz[i][j] - impliedSignalCross;
            // Exact first-order null variance of quartet excess covariance under H0: Cov(eps_p, eps_q) = 0
            const vi = prelimVar[i];
            const vj = prelimVar[j];
            const vc = prelimVar[c];
            const vd = prelimVar[d];
            const varNull =
              (vi * vj + 0.25 * (vi + vj) * (vc + vd) + vc * vd) / Math.max(2, nObsSample - 1);
            excessList.push(deltaVal);
            seNullList.push(Math.sqrt(Math.max(1e-12, varNull)));
            if (!bestWitness) bestWitness = `{${sourceNames[c]}, ${sourceNames[d]}}`;
          }
        }
      }
      if (excessList.length > 0) {
        // Weight witnesses inversely by their null variance so noisy witnesses do not contaminate quartet test
        let wSum = 0;
        let wExcess = 0;
        for (let idx = 0; idx < excessList.length; idx++) {
          const w = 1 / (seNullList[idx] * seNullList[idx]);
          wSum += w;
          wExcess += w * excessList[idx];
        }
        const optExcess = wExcess / Math.max(1e-12, wSum);
        const optSe = Math.sqrt(1 / Math.max(1e-12, wSum));
        const vi = prelimVar[i];
        const vj = prelimVar[j];
        const corr = Math.max(-0.98, Math.min(0.98, optExcess / Math.sqrt(vi * vj)));
        const zStatNull = Math.abs(optExcess) / Math.max(1e-12, optSe);
        candidatePairs.push({
          i,
          j,
          excessCovCal: optExcess,
          corrApprox: corr,
          zStatNull,
          quartetLabel: bestWitness
        });
      }
    }
  }

  // Degree-of-freedom & quartet statistical significance rule:
  // Require both meaningful correlation (|r| >= 0.28) AND quartet z-statistic >= 2.40 against finite-sample Wishart noise
  candidatePairs.sort((a, b) => b.zStatNull - a.zStatNull);
  const maxAllowedPairs = J === 4 ? 1 : Math.min(J - 3, Math.floor((J * (J - 3)) / 4));
  const selectedCorrelatedPairs: CandidatePair[] = [];
  const corSet = new Set<string>();

  for (const cand of candidatePairs) {
    if (selectedCorrelatedPairs.length >= maxAllowedPairs) break;
    if (Math.abs(cand.corrApprox) < 0.28 || cand.zStatNull < 2.4) continue;

    // Verify every source k still has at least one clean witness pair (a, b) not sharing a correlated edge
    const tentativeSet = new Set(corSet);
    tentativeSet.add(`${Math.min(cand.i, cand.j)}-${Math.max(cand.i, cand.j)}`);

    let allSourcesMaintainCleanTriplet = true;
    for (let k = 0; k < J; k++) {
      let hasClean = false;
      for (let a = 0; a < J && !hasClean; a++) {
        if (a === k) continue;
        const edgeKA = `${Math.min(k, a)}-${Math.max(k, a)}`;
        if (tentativeSet.has(edgeKA)) continue;
        for (let b = a + 1; b < J; b++) {
          if (b === k) continue;
          const edgeKB = `${Math.min(k, b)}-${Math.max(k, b)}`;
          const edgeAB = `${Math.min(a, b)}-${Math.max(a, b)}`;
          if (!tentativeSet.has(edgeKB) && !tentativeSet.has(edgeAB)) {
            hasClean = true;
            break;
          }
        }
      }
      if (!hasClean) {
        allSourcesMaintainCleanTriplet = false;
        break;
      }
    }

    if (allSourcesMaintainCleanTriplet) {
      selectedCorrelatedPairs.push(cand);
      corSet.add(`${Math.min(cand.i, cand.j)}-${Math.max(cand.i, cand.j)}`);
    }
  }

  // Re-estimate calibrated slopes using ONLY clean uncontaminated witness pairs when EC finds correlated pairs
  const ecBetasRef1 = [...betasRef1];
  if (corSet.size > 0) {
    for (let k = 1; k < J; k++) {
      const cleanRatios: number[] = [];
      for (let m = 1; m < J; m++) {
        if (m === k) continue;
        const e0m = `${Math.min(0, m)}-${Math.max(0, m)}`;
        const ekm = `${Math.min(k, m)}-${Math.max(k, m)}`;
        if (corSet.has(e0m) || corSet.has(ekm)) continue;
        if (Math.abs(C[0][m]) > 1e-10 && C[k][m] * C[0][m] > 0) {
          cleanRatios.push(C[k][m] / C[0][m]);
        }
      }
      if (cleanRatios.length > 0) {
        ecBetasRef1[k] = median(cleanRatios);
      }
    }
  }

  const ecGeo = Math.exp(mean(ecBetasRef1.map(b => Math.log(Math.abs(b)))));
  const ecBetasSym = ecBetasRef1.map(b => b / ecGeo);
  const CzEc: number[][] = Array.from({ length: J }, (_, i) =>
    Array.from({ length: J }, (__, j) => C[i][j] / (ecBetasSym[i] * ecBetasSym[j]))
  );

  // Estimate EC variances using only clean uncontaminated triplets!
  const ecUnconstrained = Array.from({ length: J }, () => 0);
  const ecSignalEsts: number[] = [];
  for (let k = 0; k < J; k++) {
    const cleanEsts: number[] = [];
    for (let a = 0; a < J; a++) {
      if (a === k) continue;
      if (corSet.has(`${Math.min(k, a)}-${Math.max(k, a)}`)) continue;
      for (let b = a + 1; b < J; b++) {
        if (b === k) continue;
        if (
          corSet.has(`${Math.min(k, b)}-${Math.max(k, b)}`) ||
          corSet.has(`${Math.min(a, b)}-${Math.max(a, b)}`)
        ) {
          continue;
        }
        if (CzEc[a][b] > 1e-10) {
          const sT = (CzEc[k][a] * CzEc[k][b]) / CzEc[a][b];
          ecSignalEsts.push(sT);
          cleanEsts.push(CzEc[k][k] - sT);
        }
      }
    }
    ecUnconstrained[k] = cleanEsts.length > 0 ? median(cleanEsts) : nchUnconstrained[k];
  }

  const latentVarEc = ecSignalEsts.length > 0 ? Math.max(1e-8, median(ecSignalEsts)) : latentVarNch;
  const ecHeywoodFlags = ecUnconstrained.map(v => v < 0);
  const ecCalibratedVars = ecUnconstrained.map(v => Math.max(psdFloor, v));
  const ecRawVars = ecCalibratedVars.map((v, k) => v * ecBetasSym[k] * ecBetasSym[k]);

  const detectedErrorCovariances = selectedCorrelatedPairs.map(cp => {
    const covCal = CzEc[cp.i][cp.j] - latentVarEc;
    const denom = Math.sqrt(Math.max(1e-12, ecCalibratedVars[cp.i] * ecCalibratedVars[cp.j]));
    return {
      i: cp.i,
      j: cp.j,
      covCalibrated: covCal,
      corr: Math.max(-0.98, Math.min(0.98, covCal / denom)),
      quartetLabel: cp.quartetLabel
    };
  });

  // Model fit RMSE on calibrated covariance matrix
  const calcCovRmse = (
    sigT: number,
    errVars: number[],
    covPairs: Array<{ i: number; j: number; covCalibrated: number }>,
    targetCz: number[][]
  ): number => {
    let sq = 0;
    let cnt = 0;
    for (let i = 0; i < J; i++) {
      for (let j = i; j < J; j++) {
        let implied = sigT;
        if (i === j) implied += errVars[i];
        else {
          const hit = covPairs.find(p => p.i === i && p.j === j);
          if (hit) implied += hit.covCalibrated;
        }
        const d = targetCz[i][j] - implied;
        sq += d * d;
        cnt++;
      }
    }
    return Math.sqrt(sq / Math.max(1, cnt));
  };

  const nchFitRmse = calcCovRmse(latentVarNch, nchCalibratedVars, [], Cz);
  const ecFitRmse = calcCovRmse(latentVarEc, ecCalibratedVars, detectedErrorCovariances, CzEc);

  return {
    identifiable: true,
    reason: null,
    betasRef1: corSet.size > 0 ? ecBetasRef1 : betasRef1,
    betasSymmetric: corSet.size > 0 ? ecBetasSym : betasSymmetric,
    alphasRef1,
    latentVarianceSym: corSet.size > 0 ? latentVarEc : latentVarNch,
    nchCalibratedVars,
    nchRawVars,
    nchHeywoodFlags,
    ecCalibratedVars,
    ecRawVars,
    ecHeywoodFlags,
    detectedErrorCovariances,
    nchFitRmse,
    ecFitRmse
  };
}

export function runMultiSourceCollocationEngine(
  observations: AlignedPanelObservation[],
  sources: MsmaSourceConfig[],
  propagatedConvVars: Record<string, number>,
  preferredEstimator: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION' | 'AUTO',
  bootstrapReplications = 300,
  bootstrapSeed = 20261126
): {
  result: MsmaMultiSourceCollocationResult;
  bootstrapDiagnostics: MsmaBootstrapDiagnostics;
  residualsBySource: Record<string, Array<{ entity: string; period: number; approxResidual: number }>>;
} {
  const J = sources.length;
  const complete = observations.filter(o =>
    sources.every(s => o.valuesBySource[s.id] !== null && Number.isFinite(o.valuesBySource[s.id]))
  );
  const nCompleteCases = complete.length;
  const entities = Array.from(new Set(complete.map(c => c.entity)));
  const nEntities = entities.length;

  const cols = sources.map(s => complete.map(c => c.valuesBySource[s.id] as number));
  const names = sources.map(s => s.displayName);

  const rawCov = covarianceMatrixFromColumns(cols);
  const eig = jacobiSymmetricEigen(rawCov);
  const core = solveMultiSourceCore(cols, names);

  const hasMeaningfulErrorCorr = core.detectedErrorCovariances.some(p => Math.abs(p.corr) >= 0.25);
  const selectedEstimator: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION' =
    preferredEstimator !== 'AUTO'
      ? preferredEstimator
      : hasMeaningfulErrorCorr
        ? 'EXTENDED_COLLOCATION'
        : 'N_CORNERED_HAT';
  const alternativeEstimator: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION' =
    selectedEstimator === 'N_CORNERED_HAT' ? 'EXTENDED_COLLOCATION' : 'N_CORNERED_HAT';

  const covDof = (J * (J + 1)) / 2;
  const mCorr = selectedEstimator === 'EXTENDED_COLLOCATION' ? core.detectedErrorCovariances.length : 0;
  const estimatedParametersCount = 2 * J + mCorr;
  const overidentificationDf = covDof - estimatedParametersCount;

  // Entity-Cluster Bootstrap
  const byEntityIdx = new Map<string, number[]>();
  complete.forEach((row, idx) => {
    const arr = byEntityIdx.get(row.entity) ?? [];
    arr.push(idx);
    byEntityIdx.set(row.entity, arr);
  });

  const B = Math.max(100, Math.min(2000, bootstrapReplications));
  const cleanSeed = Math.max(1, Math.floor(Math.abs(bootstrapSeed || 20261126)));
  const rng = createSeededRng(cleanSeed);
  const bootVarsSel: number[][] = Array.from({ length: J }, () => []);
  const bootSdsSel: number[][] = Array.from({ length: J }, () => []);
  const bootBetas: number[][] = Array.from({ length: J }, () => []);
  const bootCovPairs: Map<string, number[]> = new Map();
  const rank1Counts = Array.from({ length: J }, () => 0);
  const rankSums = Array.from({ length: J }, () => 0);
  let validBoot = 0;
  let heywoodBoot = 0;

  if (nEntities >= 3 && nCompleteCases >= 9) {
    for (let b = 0; b < B; b++) {
      const bCols: number[][] = Array.from({ length: J }, () => []);
      for (let g = 0; g < nEntities; g++) {
        const pick = entities[Math.floor(rng() * nEntities)];
        const idxs = byEntityIdx.get(pick) ?? [];
        for (const rIdx of idxs) {
          for (let k = 0; k < J; k++) bCols[k].push(cols[k][rIdx]);
        }
      }
      if (bCols[0].length < 8) {
        heywoodBoot++;
        continue;
      }
      const bCore = solveMultiSourceCore(bCols, names);
      if (!bCore.identifiable) {
        heywoodBoot++;
        continue;
      }
      const hasDrawHeywood =
        selectedEstimator === 'EXTENDED_COLLOCATION'
          ? bCore.ecHeywoodFlags.some(Boolean)
          : bCore.nchHeywoodFlags.some(Boolean);
      if (hasDrawHeywood) heywoodBoot++;

      validBoot++;
      const chosenVec =
        selectedEstimator === 'EXTENDED_COLLOCATION'
          ? bCore.ecCalibratedVars
          : bCore.nchCalibratedVars;

      const totals = chosenVec.map((v, k) => v + (propagatedConvVars[sources[k].id] ?? 0));
      for (let k = 0; k < J; k++) {
        bootVarsSel[k].push(totals[k]);
        bootSdsSel[k].push(Math.sqrt(Math.max(0, totals[k])));
        bootBetas[k].push(bCore.betasRef1[k]);
      }

      for (const cp of bCore.detectedErrorCovariances) {
        const key = `${cp.i}-${cp.j}`;
        const list = bootCovPairs.get(key) ?? [];
        list.push(cp.covCalibrated);
        bootCovPairs.set(key, list);
      }

      const order = Array.from({ length: J }, (_, k) => k).sort((a, c) => totals[a] - totals[c]);
      rank1Counts[order[0]]++;
      order.forEach((srcIdx, pos) => {
        rankSums[srcIdx] += pos + 1;
      });
    }
  }

  const getCi = (arr: number[], fallback: number): [number, number] => {
    if (arr.length < 5) return [fallback, fallback];
    const sorted = [...arr].sort((a, b) => a - b);
    return [quantileSorted(sorted, 0.025), quantileSorted(sorted, 0.975)];
  };

  const refMeanAbs = Math.max(1e-9, Math.abs(mean(cols[0])));

  const buildEstimates = (
    calVars: number[],
    rawVars: number[],
    heywoodFlags: boolean[],
    useBootstrapStats: boolean
  ): MsmaSourceAccuracyEstimate[] => {
    const totals = calVars.map((v, k) => v + (propagatedConvVars[sources[k].id] ?? 0));
    const rankAllowed = core.identifiable && nCompleteCases >= 12;
    const rkMap = new Map<number, number>();
    if (rankAllowed) {
      Array.from({ length: J }, (_, k) => k)
        .sort((a, b) => totals[a] - totals[b])
        .forEach((srcIdx, pos) => rkMap.set(srcIdx, pos + 1));
    }

    return sources.map((src, k) => {
      const convVar = propagatedConvVars[src.id] ?? 0;
      const totVar = totals[k];
      const sd = Math.sqrt(Math.max(0, totVar));
      const sigVar = core.latentVarianceSym;
      const r2 = sigVar + calVars[k] > 1e-12 ? sigVar / (sigVar + calVars[k]) : 0;
      const snrDb = calVars[k] > 1e-12 && sigVar > 0 ? 10 * Math.log10(sigVar / calVars[k]) : 0;

      return {
        sourceId: src.id,
        displayName: src.displayName,
        unit: src.unit,
        calibrationInterceptAlpha: core.alphasRef1[k],
        calibrationSlopeBeta: core.betasRef1[k],
        calibrationSlopeCi95: useBootstrapStats ? getCi(bootBetas[k], core.betasRef1[k]) : [core.betasRef1[k], core.betasRef1[k]],
        rawErrorVariance: rawVars[k],
        calibratedErrorVariance: calVars[k],
        propagatedConversionVariance: convVar,
        totalComparableErrorVariance: totVar,
        errorVarianceCi95: useBootstrapStats ? getCi(bootVarsSel[k], totVar) : [totVar, totVar],
        errorStandardDeviation: sd,
        errorSdBootstrapSe: useBootstrapStats && bootSdsSel[k].length >= 5 ? sampleSd(bootSdsSel[k]) : 0,
        errorSdCi95: useBootstrapStats ? getCi(bootSdsSel[k], sd) : [sd, sd],
        relativeErrorPct: (sd / refMeanAbs) * 100,
        etcCorrelationR2: Math.max(0, Math.min(1, r2)),
        snrDb,
        bootstrapRank1ProbPct: useBootstrapStats && validBoot > 0 ? (rank1Counts[k] / validBoot) * 100 : 0,
        bootstrapMeanRank: useBootstrapStats && validBoot > 0 ? rankSums[k] / validBoot : rkMap.get(k) ?? 0,
        relativeRank: rankAllowed ? (rkMap.get(k) ?? null) : null,
        heywoodNegativeFlag: heywoodFlags[k],
        identifiable: core.identifiable
      };
    });
  };

  const primaryEsts =
    selectedEstimator === 'EXTENDED_COLLOCATION'
      ? buildEstimates(core.ecCalibratedVars, core.ecRawVars, core.ecHeywoodFlags, true)
      : buildEstimates(core.nchCalibratedVars, core.nchRawVars, core.nchHeywoodFlags, true);

  const altEsts =
    selectedEstimator === 'EXTENDED_COLLOCATION'
      ? buildEstimates(core.nchCalibratedVars, core.nchRawVars, core.nchHeywoodFlags, false)
      : buildEstimates(core.ecCalibratedVars, core.ecRawVars, core.ecHeywoodFlags, false);

  // Diagnostic residuals
  const residualsBySource: Record<string, Array<{ entity: string; period: number; approxResidual: number }>> = {};
  sources.forEach(s => {
    residualsBySource[s.id] = [];
  });
  const activeVars =
    selectedEstimator === 'EXTENDED_COLLOCATION' ? core.ecCalibratedVars : core.nchCalibratedVars;
  const invW = activeVars.map(v => 1 / Math.max(1e-6, v));
  const sumW = invW.reduce((a, b) => a + b, 0);

  for (let i = 0; i < nCompleteCases; i++) {
    const zVals = sources.map((_, k) => (cols[k][i] - core.alphasRef1[k]) / core.betasRef1[k]);
    let tHat = 0;
    for (let k = 0; k < J; k++) tHat += invW[k] * zVals[k];
    tHat /= Math.max(1e-12, sumW);

    sources.forEach((s, k) => {
      residualsBySource[s.id].push({
        entity: complete[i].entity,
        period: complete[i].period,
        approxResidual: zVals[k] - tHat
      });
    });
  }

  const estimatedErrorCovariances: MsmaErrorCovariancePair[] = core.detectedErrorCovariances.map(cp => {
    const key = `${cp.i}-${cp.j}`;
    return {
      sourceAId: sources[cp.i].id,
      sourceBId: sources[cp.j].id,
      sourceAName: sources[cp.i].displayName,
      sourceBName: sources[cp.j].displayName,
      estimatedErrorCovariance: cp.covCalibrated,
      estimatedErrorCorrelation: cp.corr,
      ci95: getCi(bootCovPairs.get(key) ?? [], cp.covCalibrated),
      identifiedByQuartet: cp.quartetLabel
    };
  });

  const selectionRationale =
    selectedEstimator === 'EXTENDED_COLLOCATION'
      ? `Extended Collocation (Gruber et al., 2016) dipilih karena terdeteksi ${estimatedErrorCovariances.length} pasangan sumber dengan korelasi galat lintas-sumber signifikan (${estimatedErrorCovariances.map(p => `${p.sourceAName}–${p.sourceBName}: r_ε = ${p.estimatedErrorCorrelation.toFixed(3)}`).join('; ')}). Pencocokan matriks kovarians membaik dari RMSE = ${core.nchFitRmse.toFixed(3)} (NCH) menjadi ${core.ecFitRmse.toFixed(3)} (EC).`
      : `Scale-Calibrated N-Cornered Hat berkendala PSD (Premoli & Tavella, 1993) dipilih karena struktur galat antarsumber konsisten dengan asumsi independensi (tidak ada pasangan dengan |r_ε| ≥ 0.25), memberikan estimator paling efisien dengan derajat bebas over-identifikasi df = ${overidentificationDf}.`;

  const rankingAllowed = core.identifiable && nCompleteCases >= 12;
  const rankedEsts = [...primaryEsts]
    .filter(e => e.relativeRank !== null)
    .sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));
  const r1 = rankedEsts[0];
  const r2 = rankedEsts[1];
  const statisticalTieTop2 = Boolean(
    r1 &&
      r2 &&
      validBoot >= 10 &&
      (r1.errorSdCi95[1] >= r2.errorSdCi95[0] || r1.bootstrapRank1ProbPct < 75)
  );
  const statisticalTieNote = !rankingAllowed
    ? `Model tidak teridentifikasi; dari B = ${B} replikasi klaster entitas, ${validBoot} replikasi (${((validBoot / B) * 100).toFixed(1)}%) konvergen.`
    : statisticalTieTop2 && r1 && r2
      ? `PERHATIAN STATISTICAL TIE: 95% Cluster CI Error SD antara #1 (${r1.displayName}: [${r1.errorSdCi95[0].toFixed(3)}, ${r1.errorSdCi95[1].toFixed(3)}]) dan #2 (${r2.displayName}: [${r2.errorSdCi95[0].toFixed(3)}, ${r2.errorSdCi95[1].toFixed(3)}]) saling tumpang-tindih (P(Rank #1) = ${r1.bootstrapRank1ProbPct.toFixed(1)}%).`
      : r1
        ? `Pemisahan peringkat tegas: #1 (${r1.displayName}) mencapai P(Rank #1) = ${r1.bootstrapRank1ProbPct.toFixed(1)}% dari B = ${B} replikasi.`
        : '';

  const bootstrapDiagnostics: MsmaBootstrapDiagnostics = {
    requestedReplications: B,
    bootstrapSeed: cleanSeed,
    validConvergedDraws: validBoot,
    heywoodOrSingularDraws: heywoodBoot,
    convergenceRatePct: (validBoot / B) * 100,
    heywoodDrawRatePct: (heywoodBoot / B) * 100,
    statisticalTieTop2,
    statisticalTieNote
  };

  return {
    result: {
      selectedEstimator,
      alternativeEstimator,
      selectionRationale,
      nCompleteCases,
      nEntities,
      nSources: J,
      covarianceDegreesOfFreedom: covDof,
      estimatedParametersCount,
      overidentificationDf,
      isPositiveSemidefinite: eig.minEigenvalue >= -1e-8,
      minEigenvalueRawCov: eig.minEigenvalue,
      matrixConditionNumber: eig.conditionNumber,
      modelFitRmseCov: selectedEstimator === 'EXTENDED_COLLOCATION' ? core.ecFitRmse : core.nchFitRmse,
      isIdentifiable: core.identifiable,
      rankingAllowed,
      rankingBlockedReason: rankingAllowed
        ? null
        : core.reason ?? 'Observasi irisan lengkap belum mencukupi (< 12 baris).',
      estimates: primaryEsts,
      alternativeEstimates: altEsts,
      estimatedErrorCovariances
    },
    bootstrapDiagnostics,
    residualsBySource
  };
}
