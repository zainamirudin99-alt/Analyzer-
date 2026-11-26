
import {
  MsmaBootstrapDiagnostics,
  MsmaSourceAccuracyEstimate,
  MsmaSourceConfig,
  MsmaTcaResult
} from '../types';
import {
  covarianceMatrixFromColumns,
  createSeededRng,
  mean,
  pearsonCorrAndP,
  quantileSorted,
  sampleSd
} from '../utils/numerical';
import { AlignedPanelObservation } from './descriptive-statistics';

interface TcaCoreComputation {
  identifiable: boolean;
  hasHeywood: boolean;
  reason: string | null;
  latentVarRef1: number;
  latentVarSymmetric: number;
  covMatrix: number[][];
  alphasRef1: [number, number, number];
  betasRef1: [number, number, number];
  betasSymmetric: [number, number, number];
  rawErrVars: [number, number, number];
  calibratedErrVars: [number, number, number];
  etcR2: [number, number, number];
  snrDb: [number, number, number];
}

function solveTcaCore3(cols: [number[], number[], number[]]): TcaCoreComputation {
  const C = covarianceMatrixFromColumns(cols);
  const c11 = C[0][0];
  const c22 = C[1][1];
  const c33 = C[2][2];
  const c12 = C[0][1];
  const c13 = C[0][2];
  const c23 = C[1][2];

  const minDiag = Math.min(c11, c22, c33);
  if (minDiag <= 1e-12) {
    return {
      identifiable: false,
      hasHeywood: false,
      reason: 'Salah satu sumber pengukuran bernilai konstan (varians mendekati nol).',
      latentVarRef1: 0,
      latentVarSymmetric: 0,
      covMatrix: C,
      alphasRef1: [0, 0, 0],
      betasRef1: [1, 1, 1],
      betasSymmetric: [1, 1, 1],
      rawErrVars: [0, 0, 0],
      calibratedErrVars: [0, 0, 0],
      etcR2: [0, 0, 0],
      snrDb: [-99, -99, -99]
    };
  }

  if (Math.abs(c12) <= 1e-12 || Math.abs(c13) <= 1e-12 || Math.abs(c23) <= 1e-12) {
    return {
      identifiable: false,
      hasHeywood: false,
      reason: 'Kovarians silang antarsumber mendekati nol sehingga rasio kalibrasi TCA singular.',
      latentVarRef1: 0,
      latentVarSymmetric: 0,
      covMatrix: C,
      alphasRef1: [0, 0, 0],
      betasRef1: [1, 1, 1],
      betasSymmetric: [1, 1, 1],
      rawErrVars: [0, 0, 0],
      calibratedErrVars: [0, 0, 0],
      etcR2: [0, 0, 0],
      snrDb: [-99, -99, -99]
    };
  }

  const latentVarRef1 = (c12 * c13) / c23;
  const sigT2 = (c12 * c23) / c13;
  const sigT3 = (c13 * c23) / c12;

  if (latentVarRef1 <= 0 || sigT2 <= 0 || sigT3 <= 0) {
    return {
      identifiable: false,
      hasHeywood: true,
      reason:
        'Tanda kovarians silang tidak konsisten (C₁₂·C₁₃/C₂₃ ≤ 0); sumber tidak berbagi satu sinyal laten searah yang teridentifikasi.',
      latentVarRef1,
      latentVarSymmetric: 0,
      covMatrix: C,
      alphasRef1: [0, 0, 0],
      betasRef1: [1, 1, 1],
      betasSymmetric: [1, 1, 1],
      rawErrVars: [c11 - latentVarRef1, c22 - sigT2, c33 - sigT3],
      calibratedErrVars: [0, 0, 0],
      etcR2: [0, 0, 0],
      snrDb: [-99, -99, -99]
    };
  }

  // Calibration relative to Source 1 (Stoffelen 1998)
  const beta1 = 1;
  const beta2 = c23 / c13;
  const beta3 = c23 / c12;

  const m1 = mean(cols[0]);
  const m2 = mean(cols[1]);
  const m3 = mean(cols[2]);
  const alpha1 = 0;
  const alpha2 = m2 - beta2 * m1;
  const alpha3 = m3 - beta3 * m1;

  // Classic TCA unscaled error variances: sigma^2_eps_1 = C11 - C12*C13/C23, etc.
  const rawE1 = c11 - latentVarRef1;
  const rawE2 = c22 - sigT2;
  const rawE3 = c33 - sigT3;

  const hasHeywood = rawE1 < 0 || rawE2 < 0 || rawE3 < 0;

  // Symmetric geometric-mean unit loading scale so ranking is 100% invariant to source ordering (Wu et al., 2023)
  const geoBeta = Math.cbrt(Math.abs(beta1 * beta2 * beta3));
  const bSym1 = beta1 / geoBeta;
  const bSym2 = beta2 / geoBeta;
  const bSym3 = beta3 / geoBeta;
  const latentVarSymmetric = latentVarRef1 * geoBeta * geoBeta;

  const calE1 = rawE1 / (bSym1 * bSym1);
  const calE2 = rawE2 / (bSym2 * bSym2);
  const calE3 = rawE3 / (bSym3 * bSym3);

  // Extended Triple Collocation (McColl et al., 2014): R^2_k = (beta_k^2 * sigma_T^2) / C_kk
  const r2_1 = Math.max(0, Math.min(1, latentVarRef1 / c11));
  const r2_2 = Math.max(0, Math.min(1, sigT2 / c22));
  const r2_3 = Math.max(0, Math.min(1, sigT3 / c33));

  const calcSnrDb = (sigVar: number, errVar: number): number => {
    if (errVar <= 1e-12 || sigVar <= 0) return errVar <= 0 ? 40 : -40;
    return 10 * Math.log10(sigVar / errVar);
  };

  return {
    identifiable: !hasHeywood,
    hasHeywood,
    reason: hasHeywood
      ? 'Terdeteksi kasus Heywood (estimasi varians galat bernilai negatif pada minimal satu sumber), umumnya dipicu oleh korelasi galat positif antara dua sumber atau ukuran sampel terbatas.'
      : null,
    latentVarRef1,
    latentVarSymmetric,
    covMatrix: C,
    alphasRef1: [alpha1, alpha2, alpha3],
    betasRef1: [beta1, beta2, beta3],
    betasSymmetric: [bSym1, bSym2, bSym3],
    rawErrVars: [rawE1, rawE2, rawE3],
    calibratedErrVars: [calE1, calE2, calE3],
    etcR2: [r2_1, r2_2, r2_3],
    snrDb: [calcSnrDb(latentVarRef1, rawE1), calcSnrDb(sigT2, rawE2), calcSnrDb(sigT3, rawE3)]
  };
}

export function runTripleCollocationEngine(
  observations: AlignedPanelObservation[],
  sources: [MsmaSourceConfig, MsmaSourceConfig, MsmaSourceConfig],
  propagatedConvVars: Record<string, number>,
  bootstrapReplications = 400,
  bootstrapSeed = 20261126
): {
  result: MsmaTcaResult;
  bootstrapDiagnostics: MsmaBootstrapDiagnostics;
  residualsBySource: Record<string, Array<{ entity: string; period: number; approxResidual: number }>>;
} {
  const complete = observations.filter(o =>
    sources.every(s => o.valuesBySource[s.id] !== null && Number.isFinite(o.valuesBySource[s.id]))
  );

  const nCompleteTriplets = complete.length;
  const entities = Array.from(new Set(complete.map(c => c.entity)));
  const nEntities = entities.length;

  const cols: [number[], number[], number[]] = [
    complete.map(c => c.valuesBySource[sources[0].id] as number),
    complete.map(c => c.valuesBySource[sources[1].id] as number),
    complete.map(c => c.valuesBySource[sources[2].id] as number)
  ];

  const main = solveTcaCore3(cols);

  // Dong & Crow (2017) style lag-1 temporal autocorrelation check on pairwise calibrated differences
  const autocorrelatedErrorShareBySource: Record<string, number> = {};
  const residualsBySource: Record<string, Array<{ entity: string; period: number; approxResidual: number }>> = {
    [sources[0].id]: [],
    [sources[1].id]: [],
    [sources[2].id]: []
  };

  // Approximate inverse-variance weighted consensus latent T_hat for diagnostic residual inspection
  const safeVars = main.calibratedErrVars.map(v => Math.max(1e-6, Math.abs(v)));
  const invWeights = safeVars.map(v => 1 / v);
  const sumW = invWeights[0] + invWeights[1] + invWeights[2];
  const mBar = mean(cols[0]);

  for (let i = 0; i < complete.length; i++) {
    const z0 = (cols[0][i] - main.alphasRef1[0]) / main.betasRef1[0];
    const z1 = (cols[1][i] - main.alphasRef1[1]) / main.betasRef1[1];
    const z2 = (cols[2][i] - main.alphasRef1[2]) / main.betasRef1[2];
    const tHat = (invWeights[0] * z0 + invWeights[1] * z1 + invWeights[2] * z2) / sumW;

    const e0 = z0 - tHat;
    const e1 = z1 - tHat;
    const e2 = z2 - tHat;

    residualsBySource[sources[0].id].push({ entity: complete[i].entity, period: complete[i].period, approxResidual: e0 });
    residualsBySource[sources[1].id].push({ entity: complete[i].entity, period: complete[i].period, approxResidual: e1 });
    residualsBySource[sources[2].id].push({ entity: complete[i].entity, period: complete[i].period, approxResidual: e2 });
  }

  sources.forEach(src => {
    const resList = residualsBySource[src.id];
    const byEnt = new Map<string, Array<{ period: number; val: number }>>();
    for (const item of resList) {
      const arr = byEnt.get(item.entity) ?? [];
      arr.push({ period: item.period, val: item.approxResidual });
      byEnt.set(item.entity, arr);
    }
    const curArr: number[] = [];
    const lagArr: number[] = [];
    byEnt.forEach(arr => {
      arr.sort((a, b) => a.period - b.period);
      for (let t = 1; t < arr.length; t++) {
        curArr.push(arr[t].val);
        lagArr.push(arr[t - 1].val);
      }
    });
    const { r } = pearsonCorrAndP(curArr, lagArr);
    autocorrelatedErrorShareBySource[src.id] = Math.abs(r);
  });

  // Check indirect evidence of error cross-correlation: extreme SNR asymmetry (> 98.5% R^2 on two sources while Heywood/near-zero)
  const sortedR2 = [...main.etcR2].sort((a, b) => b - a);
  const suspectedErrorCorrelationFlag =
    main.hasHeywood || (sortedR2[0] > 0.992 && sortedR2[1] > 0.992 && sortedR2[2] < 0.55);

  // Entity-Cluster Bootstrap (preserving within-entity panel dependence)
  const byEntityRows = new Map<string, number[]>();
  complete.forEach((row, idx) => {
    const list = byEntityRows.get(row.entity) ?? [];
    list.push(idx);
    byEntityRows.set(row.entity, list);
  });

  const B = Math.max(100, Math.min(2000, bootstrapReplications));
  const cleanSeed = Math.max(1, Math.floor(Math.abs(bootstrapSeed || 20261126)));
  const rng = createSeededRng(cleanSeed);
  const bootErrVars: [number[], number[], number[]] = [[], [], []];
  const bootErrSds: [number[], number[], number[]] = [[], [], []];
  const bootBetas: [number[], number[], number[]] = [[], [], []];
  const rank1Counts = [0, 0, 0];
  const rankSums = [0, 0, 0];
  let validBootCount = 0;
  let heywoodBootCount = 0;

  if (nEntities >= 3 && nCompleteTriplets >= 9) {
    for (let b = 0; b < B; b++) {
      const bCols: [number[], number[], number[]] = [[], [], []];
      for (let g = 0; g < nEntities; g++) {
        const pickedEnt = entities[Math.floor(rng() * nEntities)];
        const indices = byEntityRows.get(pickedEnt) ?? [];
        for (const rIdx of indices) {
          bCols[0].push(cols[0][rIdx]);
          bCols[1].push(cols[1][rIdx]);
          bCols[2].push(cols[2][rIdx]);
        }
      }
      if (bCols[0].length < 6) {
        heywoodBootCount++;
        continue;
      }
      const bRes = solveTcaCore3(bCols);
      if (!bRes.identifiable) {
        heywoodBootCount++;
        continue;
      }

      validBootCount++;
      const totals = [0, 1, 2].map(
        k => bRes.calibratedErrVars[k] + (propagatedConvVars[sources[k].id] ?? 0)
      );
      for (let k = 0; k < 3; k++) {
        bootErrVars[k].push(totals[k]);
        bootErrSds[k].push(Math.sqrt(Math.max(0, totals[k])));
        bootBetas[k].push(bRes.betasRef1[k]);
      }

      const order = [0, 1, 2].sort((a, c) => totals[a] - totals[c]);
      rank1Counts[order[0]]++;
      order.forEach((srcIdx, rkIdx) => {
        rankSums[srcIdx] += rkIdx + 1;
      });
    }
  }

  const getCi = (arr: number[], fallback: number): [number, number] => {
    if (arr.length < 5) return [fallback, fallback];
    const sorted = [...arr].sort((a, b) => a - b);
    return [quantileSorted(sorted, 0.025), quantileSorted(sorted, 0.975)];
  };

  const totalComparableVars = [0, 1, 2].map(
    k => main.calibratedErrVars[k] + (propagatedConvVars[sources[k].id] ?? 0)
  );

  const rankingAllowed = main.identifiable && nCompleteTriplets >= 12;
  const rankMap = new Map<number, number>();
  if (rankingAllowed) {
    [0, 1, 2]
      .sort((a, b) => totalComparableVars[a] - totalComparableVars[b])
      .forEach((srcIdx, pos) => rankMap.set(srcIdx, pos + 1));
  }

  const refMeanAbs = Math.max(1e-9, Math.abs(mBar));

  const estimates: MsmaSourceAccuracyEstimate[] = [0, 1, 2].map(k => {
    const src = sources[k];
    const convVar = propagatedConvVars[src.id] ?? 0;
    const totalVar = totalComparableVars[k];
    const errSd = totalVar >= 0 ? Math.sqrt(totalVar) : -Math.sqrt(Math.abs(totalVar));
    const bootSe = bootErrSds[k].length >= 5 ? sampleSd(bootErrSds[k]) : 0;
    return {
      sourceId: src.id,
      displayName: src.displayName,
      unit: src.unit,
      calibrationInterceptAlpha: main.alphasRef1[k],
      calibrationSlopeBeta: main.betasRef1[k],
      calibrationSlopeCi95: getCi(bootBetas[k], main.betasRef1[k]),
      rawErrorVariance: main.rawErrVars[k],
      calibratedErrorVariance: main.calibratedErrVars[k],
      propagatedConversionVariance: convVar,
      totalComparableErrorVariance: totalVar,
      errorVarianceCi95: getCi(bootErrVars[k], totalVar),
      errorStandardDeviation: errSd,
      errorSdBootstrapSe: bootSe,
      errorSdCi95: getCi(bootErrSds[k], Math.max(0, errSd)),
      relativeErrorPct: totalVar >= 0 ? (Math.sqrt(totalVar) / refMeanAbs) * 100 : 0,
      etcCorrelationR2: main.etcR2[k],
      snrDb: main.snrDb[k],
      bootstrapRank1ProbPct: validBootCount > 0 ? (rank1Counts[k] / validBootCount) * 100 : 0,
      bootstrapMeanRank: validBootCount > 0 ? rankSums[k] / validBootCount : 0,
      relativeRank: rankingAllowed ? (rankMap.get(k) ?? null) : null,
      heywoodNegativeFlag: main.rawErrVars[k] < 0,
      identifiable: main.identifiable
    };
  });

  const rankedSorted = [...estimates]
    .filter(e => e.relativeRank !== null)
    .sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));
  const r1 = rankedSorted[0];
  const r2 = rankedSorted[1];
  const statisticalTieTop2 = Boolean(
    r1 &&
      r2 &&
      validBootCount >= 10 &&
      (r1.errorSdCi95[1] >= r2.errorSdCi95[0] || r1.bootstrapRank1ProbPct < 75)
  );
  const statisticalTieNote = !rankingAllowed
    ? `Model utama tidak teridentifikasi; dari B = ${B} replikasi klaster entitas, ${validBootCount} replikasi (${((validBootCount / B) * 100).toFixed(1)}%) konvergen bebas Heywood dan ${heywoodBootCount} replikasi (${((heywoodBootCount / B) * 100).toFixed(1)}%) mengalami kasus Heywood.`
    : statisticalTieTop2 && r1 && r2
      ? `PERHATIAN STATISTICAL TIE: 95% Cluster CI Error SD antara #1 (${r1.displayName}: [${r1.errorSdCi95[0].toFixed(3)}, ${r1.errorSdCi95[1].toFixed(3)}]) dan #2 (${r2.displayName}: [${r2.errorSdCi95[0].toFixed(3)}, ${r2.errorSdCi95[1].toFixed(3)}]) saling tumpang-tindih (P(Rank #1) = ${r1.bootstrapRank1ProbPct.toFixed(1)}%). Keunggulan #1 atas #2 belum terpisah secara tegas pada tingkat kepercayaan 95%.`
      : r1
        ? `Pemisahan peringkat tegas: #1 (${r1.displayName}) mencapai P(Rank #1) = ${r1.bootstrapRank1ProbPct.toFixed(1)}% dengan 95% Cluster CI yang terpisah baik pada B = ${B} replikasi.`
        : '';

  const bootstrapDiagnostics: MsmaBootstrapDiagnostics = {
    requestedReplications: B,
    bootstrapSeed: cleanSeed,
    validConvergedDraws: validBootCount,
    heywoodOrSingularDraws: heywoodBootCount,
    convergenceRatePct: (validBootCount / B) * 100,
    heywoodDrawRatePct: (heywoodBootCount / B) * 100,
    statisticalTieTop2,
    statisticalTieNote
  };

  const correlatedTcNote = main.hasHeywood
    ? 'Kasus Heywood terdeteksi (σ²_ε < 0): pada J = 3 sumber, model Correlated Triple Collocation memiliki 7 parameter untuk 6 momen kovarians sehingga TIDAK teridentifikasi tanpa nilai kovarians galat eksternal. Pemeringkatan TCA klasik diblokir; periksa kurva sensitivitas korelasi galat pada Step 9 atau tambahkan sumber independen ke-4 untuk Extended Collocation.'
    : suspectedErrorCorrelationFlag
      ? 'Peringatan korelasi galat: dua sumber menunjukkan kesamaan sangat tinggi relatif terhadap sumber ketiga (González-Gambau et al., 2020). Apabila keduanya berbagi metode/sensor yang sama, varians galat keduanya dapat tampak lebih kecil dari nilai sebenarnya. Evaluasi sensitivitas ρ_ε wajib diperhatikan pada Step 9.'
      : 'Tidak ditemukan kasus Heywood; seluruh estimasi varians galat TCA bernilai positif dan teridentifikasi secara aljabar.';

  return {
    result: {
      referenceSourceId: sources[0].id,
      referenceSourceName: sources[0].displayName,
      nCompleteTriplets,
      nEntities,
      estimatedLatentVariance: main.latentVarSymmetric,
      covarianceMatrix: main.covMatrix,
      isIdentifiable: main.identifiable,
      hasHeywoodCase: main.hasHeywood,
      suspectedErrorCorrelationFlag,
      autocorrelatedErrorShareBySource,
      correlatedTcNote,
      rankingAllowed,
      rankingBlockedReason: rankingAllowed
        ? null
        : main.reason ?? 'Ukuran observasi triplet lengkap terlalu kecil (< 12 baris).',
      estimates
    },
    bootstrapDiagnostics,
    residualsBySource
  };
}
