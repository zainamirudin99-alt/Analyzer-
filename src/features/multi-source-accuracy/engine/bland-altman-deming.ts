
import { MsmaSourceConfig, MsmaTwoSourceResult } from '../types';
import {
  createSeededRng,
  mean,
  quantileSorted,
  sampleCovariance,
  sampleSd,
  sampleVariance,
  simpleLinearRegression
} from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';

function computeDemingPointEstimate(
  x1: number[],
  x2: number[],
  lambdaRatio: number
): { slope: number; intercept: number } {
  const s11 = sampleVariance(x1);
  const s22 = sampleVariance(x2);
  const s12 = sampleCovariance(x1, x2);
  const m1 = mean(x1);
  const m2 = mean(x2);

  if (Math.abs(s12) < 1e-14) {
    return { slope: 0, intercept: m2 };
  }

  // Deming formula where lambdaRatio = Var(eps_2) / Var(eps_1)
  const delta = Math.max(1e-6, lambdaRatio);
  const diff = s22 - delta * s11;
  const disc = Math.sqrt(Math.max(0, diff * diff + 4 * delta * s12 * s12));
  const slope = (diff + disc) / (2 * s12);
  const intercept = m2 - slope * m1;
  return { slope, intercept };
}

function computeRepeatedMeasuresLoaSd(
  pairs: Array<{ entity: string; diff: number }>
): {
  betweenVar: number;
  withinVar: number;
  rmSd: number;
} {
  const N = pairs.length;
  if (N < 3) return { betweenVar: 0, withinVar: 0, rmSd: 0 };

  const grandMean = mean(pairs.map(p => p.diff));
  const byEntity = new Map<string, number[]>();
  for (const p of pairs) {
    const arr = byEntity.get(p.entity) ?? [];
    arr.push(p.diff);
    byEntity.set(p.entity, arr);
  }

  const G = byEntity.size;
  if (G < 2 || G >= N) {
    const v = sampleVariance(pairs.map(p => p.diff));
    return { betweenVar: 0, withinVar: v, rmSd: Math.sqrt(v) };
  }

  let ssb = 0;
  let ssw = 0;
  let sumN2 = 0;
  byEntity.forEach(arr => {
    const ni = arr.length;
    const mi = mean(arr);
    ssb += ni * (mi - grandMean) * (mi - grandMean);
    sumN2 += ni * ni;
    for (const v of arr) {
      ssw += (v - mi) * (v - mi);
    }
  });

  const msb = ssb / Math.max(1, G - 1);
  const msw = N > G ? ssw / (N - G) : 0;
  const n0 = (N - sumN2 / N) / Math.max(1, G - 1);

  const withinVar = Math.max(0, msw);
  const betweenVar = n0 > 1e-9 ? Math.max(0, (msb - msw) / n0) : 0;
  const rmSd = Math.sqrt(betweenVar + withinVar);
  return { betweenVar, withinVar, rmSd };
}

export function runTwoSourceAgreementEngine(
  observations: AlignedPanelObservation[],
  source1: MsmaSourceConfig,
  source2: MsmaSourceConfig,
  options: {
    demingLambdaRatio: number;
    demingLambdaExternalKnown: boolean;
    bootstrapReplications: number;
    bootstrapSeed?: number;
  }
): MsmaTwoSourceResult {
  const paired = observations
    .map(o => {
      const x1 = o.valuesBySource[source1.id];
      const x2 = o.valuesBySource[source2.id];
      if (x1 === null || x2 === null || !Number.isFinite(x1) || !Number.isFinite(x2)) return null;
      return {
        entity: o.entity,
        period: o.period,
        x1,
        x2,
        meanPair: 0.5 * (x1 + x2),
        diffPair: x1 - x2
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const nPairs = paired.length;
  const entities = Array.from(new Set(paired.map(p => p.entity)));
  const nEntities = entities.length;

  const x1Arr = paired.map(p => p.x1);
  const x2Arr = paired.map(p => p.x2);
  const meanArr = paired.map(p => p.meanPair);
  const diffArr = paired.map(p => p.diffPair);

  const meanDiff = mean(diffArr);
  const naiveSd = sampleSd(diffArr);
  const { betweenVar, withinVar, rmSd } = computeRepeatedMeasuresLoaSd(
    paired.map(p => ({ entity: p.entity, diff: p.diffPair }))
  );

  const loaLowerNaive = meanDiff - 1.96 * naiveSd;
  const loaUpperNaive = meanDiff + 1.96 * naiveSd;
  const loaLowerRm = meanDiff - 1.96 * rmSd;
  const loaUpperRm = meanDiff + 1.96 * rmSd;

  // Proportional bias: D_it on M_it
  const propReg = simpleLinearRegression(meanArr, diffArr);
  // Heteroskedasticity of differences: |D_it - meanDiff| on M_it
  const absCenteredDiff = diffArr.map(d => Math.abs(d - meanDiff));
  const heteroReg = simpleLinearRegression(meanArr, absCenteredDiff);

  // Lin's Concordance Correlation Coefficient (CCC)
  const v1 = sampleVariance(x1Arr);
  const v2 = sampleVariance(x2Arr);
  const cov12 = sampleCovariance(x1Arr, x2Arr);
  const m1 = mean(x1Arr);
  const m2 = mean(x2Arr);
  const denomCcc = v1 + v2 + (m1 - m2) * (m1 - m2);
  const linsCcc = denomCcc > 1e-14 ? (2 * cov12) / denomCcc : 0;

  const lambda = Math.max(1e-4, options.demingLambdaRatio || 1);
  const demingMain = computeDemingPointEstimate(x1Arr, x2Arr, lambda);

  // Entity-Cluster Bootstrap for CIs (preserving within-city correlation!)
  const byEntityMap = new Map<string, typeof paired>();
  for (const p of paired) {
    const list = byEntityMap.get(p.entity) ?? [];
    list.push(p);
    byEntityMap.set(p.entity, list);
  }

  const B = Math.max(100, Math.min(2000, options.bootstrapReplications));
  const cleanSeed = Math.max(1, Math.floor(Math.abs(options.bootstrapSeed || 20261126)));
  const rng = createSeededRng(cleanSeed);
  const bootMeanDiffs: number[] = [];
  const bootLoaLo: number[] = [];
  const bootLoaHi: number[] = [];
  const bootSlopes: number[] = [];
  const bootIntercepts: number[] = [];

  if (nEntities >= 2 && nPairs >= 4) {
    for (let b = 0; b < B; b++) {
      const sampleRows: typeof paired = [];
      for (let g = 0; g < nEntities; g++) {
        const pick = entities[Math.floor(rng() * nEntities)];
        const rowsG = byEntityMap.get(pick) ?? [];
        for (let r = 0; r < rowsG.length; r++) {
          sampleRows.push({
            ...rowsG[r],
            entity: `${pick}_b${g}`
          });
        }
      }
      if (sampleRows.length < 4) continue;
      const bx1 = sampleRows.map(s => s.x1);
      const bx2 = sampleRows.map(s => s.x2);
      const bDiff = sampleRows.map(s => s.diffPair);
      const bm = mean(bDiff);
      const bRm = computeRepeatedMeasuresLoaSd(
        sampleRows.map(s => ({ entity: s.entity, diff: s.diffPair }))
      );
      const bDem = computeDemingPointEstimate(bx1, bx2, lambda);
      if (Number.isFinite(bDem.slope) && Number.isFinite(bDem.intercept)) {
        bootMeanDiffs.push(bm);
        bootLoaLo.push(bm - 1.96 * bRm.rmSd);
        bootLoaHi.push(bm + 1.96 * bRm.rmSd);
        bootSlopes.push(bDem.slope);
        bootIntercepts.push(bDem.intercept);
      }
    }
  }

  const ciFromBoot = (arr: number[], point: number): [number, number] => {
    if (arr.length < 10) return [point, point];
    const sorted = [...arr].sort((a, b) => a - b);
    return [quantileSorted(sorted, 0.025), quantileSorted(sorted, 0.975)];
  };

  const meanDifferenceSeCluster = bootMeanDiffs.length > 5 ? sampleSd(bootMeanDiffs) : naiveSd / Math.sqrt(Math.max(1, nEntities));
  const demingSlopeSeCluster = bootSlopes.length > 5 ? sampleSd(bootSlopes) : 0;
  const demingInterceptSeCluster = bootIntercepts.length > 5 ? sampleSd(bootIntercepts) : 0;

  const slopeCi = ciFromBoot(bootSlopes, demingMain.slope);
  const interceptCi = ciFromBoot(bootIntercepts, demingMain.intercept);
  const meanDiffCi = ciFromBoot(bootMeanDiffs, meanDiff);
  const hasProportionalBias = slopeCi[0] > 1 || slopeCi[1] < 1;
  const hasAdditiveBias = meanDiffCi[0] > 0 || meanDiffCi[1] < 0;

  const agreementInterpretation = [
    `Rata-rata selisih (${source1.displayName} − ${source2.displayName}) adalah ${meanDiff.toFixed(3)} ${source1.unit} (95% Cluster CI: [${meanDiffCi[0].toFixed(3)}, ${meanDiffCi[1].toFixed(3)}]), menunjukkan ${hasAdditiveBias ? 'adanya bias sistematis rata-rata yang signifikan secara statistik' : 'tidak adanya pergeseran rata-rata yang signifikan secara statistik'}.`,
    `95% Repeated-Measures Panel Limits of Agreement (Parker et al., 2020) berada pada [${loaLowerRm.toFixed(3)}, ${loaUpperRm.toFixed(3)}] ${source1.unit} dengan simpangan baku total selisih RM = ${rmSd.toFixed(3)} (dekomposisi varians selisih antarkota = ${betweenVar.toFixed(3)}, dalam-kota = ${withinVar.toFixed(3)}), dan koefisien konkordansi Lin CCC = ${linsCcc.toFixed(4)}.`,
    `Deming Regression (rasio galat kerja λ = ${lambda.toFixed(2)}${options.demingLambdaExternalKnown ? ' dari informasi eksternal' : ' — asumsi kesetaraan galat orthogonal'}) menghasilkan kemiringan β̂ = ${demingMain.slope.toFixed(4)} (95% CI: [${slopeCi[0].toFixed(4)}, ${slopeCi[1].toFixed(4)}]), mengindikasikan ${hasProportionalBias ? 'terdapat proportional bias signifikan antara kedua sumber' : 'tidak terdapat bukti kuat distorsi skala proporsional dari nilai 1.00'}.`
  ].join(' ');

  const identificationBoundaryWarning =
    'PERINGATAN IDENTIFIKASI STATISTIK (J = 2): Dua sumber pengukuran tanpa Ground Truth tidak cukup untuk mengestimasi varians galat masing-masing sumber secara terpisah (σ²_ε1 dan σ²_ε2 under-identified dari 3 momen kovarians). Sistem TIDAK menghasilkan peringkat akurasi absolut di antara kedua sumber. Untuk mengidentifikasi sumber mana yang lebih akurat, dibutuhkan minimal salah satu dari: (1) penambahan sumber pengukuran independen ketiga untuk menjalankan Triple Collocation Analysis, (2) audit kalibrasi laboratorium/lapangan yang memberikan nilai eksak rasio varians galat λ = σ²_ε2/σ²_ε1, atau (3) subsampel validasi ber-Ground Truth.';

  return {
    source1Id: source1.id,
    source2Id: source2.id,
    source1Name: source1.displayName,
    source2Name: source2.displayName,
    unit: source1.unit,
    nPairs,
    nEntities,
    meanDifference: meanDiff,
    meanDifferenceSeCluster,
    meanDifferenceCi95: meanDiffCi,
    naiveSdDifference: naiveSd,
    betweenEntityDiffVariance: betweenVar,
    withinEntityDiffVariance: withinVar,
    repeatedMeasuresSdDifference: rmSd,
    loaLowerNaive,
    loaUpperNaive,
    loaLowerRepeatedMeasures: loaLowerRm,
    loaUpperRepeatedMeasures: loaUpperRm,
    loaLowerCi95: ciFromBoot(bootLoaLo, loaLowerRm),
    loaUpperCi95: ciFromBoot(bootLoaHi, loaUpperRm),
    proportionalBiasSlope: propReg.slope,
    proportionalBiasT: propReg.tSlope,
    proportionalBiasP: propReg.pSlope,
    heteroskedasticitySlopeAbsDiff: heteroReg.slope,
    heteroskedasticityP: heteroReg.pSlope,
    demingErrorVarianceRatioLambda: lambda,
    isAssumedEqualErrorRatio: !options.demingLambdaExternalKnown,
    demingSlope: demingMain.slope,
    demingSlopeSeCluster,
    demingSlopeCi95: slopeCi,
    demingIntercept: demingMain.intercept,
    demingInterceptSeCluster,
    demingInterceptCi95: interceptCi,
    linsCcc,
    agreementInterpretation,
    identificationBoundaryWarning,
    points: paired.map(p => ({
      entity: p.entity,
      period: p.period,
      x1: p.x1,
      x2: p.x2,
      meanPair: p.meanPair,
      diffPair: p.diffPair,
      demingFittedX2: demingMain.intercept + demingMain.slope * p.x1
    }))
  };
}
