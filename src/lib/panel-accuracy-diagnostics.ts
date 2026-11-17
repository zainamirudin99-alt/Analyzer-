// ============================================================
// Reference-Free All-Source Statistical Diagnostics (Step 7)
// Heteroskedasticity, Within-City AR(1), Pesaran CD Cross-Sectional
// Dependence, Cluster Count Audit, Outlier Trimmed Sensitivity,
// Bayesian MCMC Convergence (R-hat, ESS, PPC), & Normality / CLT Note
// ============================================================

import {
  normalPValueTwoSided,
  studentTPValueTwoSided
} from './panel-accuracy-bland-altman';
import { computePearsonR } from './panel-accuracy-correlation';
import { fDistPValue } from './panel-accuracy-inference';
import { LatentEngineInternalOutput } from './panel-accuracy-latent';
import { PreparedPanelAccuracyData } from './panel-accuracy-preprocessing';
import {
  OutlierSensitivityEntry,
  PanelAccuracyDiagnosticsResult
} from './panel-accuracy-types';

export function computePanelAccuracyDiagnostics(
  prepared: PreparedPanelAccuracyData,
  latentOut: LatentEngineInternalOutput
): PanelAccuracyDiagnosticsResult {
  const { completeCaseObservations, comparisonSources, cities } = prepared;
  const P = completeCaseObservations.length;
  const M = comparisonSources.length;
  const G = new Set(completeCaseObservations.map(o => o.city)).size || cities.length;

  // Absolute deviation against shared latent true-value estimate theta_hat_it across ALL J sources
  const aeBySource: number[][] = comparisonSources.map(src =>
    completeCaseObservations.map((o, p) => Math.abs(o.values[src.id]! - latentOut.sharedLatentTheta[p]))
  );
  const maeBySource = aeBySource.map(arr =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  );
  const grandMae = maeBySource.length
    ? maeBySource.reduce((a, b) => a + b, 0) / maeBySource.length
    : 0;

  const residBySource: number[][] = comparisonSources.map((_, m) =>
    completeCaseObservations.map((__, p) => {
      const pairMean =
        M > 0 ? comparisonSources.reduce((s, ___, q) => s + aeBySource[q][p], 0) / M : 0;
      return (aeBySource[m][p] - maeBySource[m]) - (pairMean - grandMae);
    })
  );

  // 1. Groupwise Heteroskedasticity across all J sources (one-way ANOVA F on squared residuals eps^2)
  const sqResidGroups = residBySource.map(arr => arr.map(r => r * r));
  const flatSq = sqResidGroups.flat();
  const nTotal = flatSq.length;
  const grandMeanSq = nTotal > 0 ? flatSq.reduce((a, b) => a + b, 0) / nTotal : 0;

  let ssb = 0;
  let ssw = 0;
  sqResidGroups.forEach(grp => {
    if (grp.length === 0) return;
    const gm = grp.reduce((a, b) => a + b, 0) / grp.length;
    ssb += grp.length * (gm - grandMeanSq) ** 2;
    grp.forEach(v => {
      ssw += (v - gm) ** 2;
    });
  });

  const dfHet1 = Math.max(1, M - 1);
  const dfHet2 = Math.max(1, nTotal - M);
  const hetF = M > 1 && ssw > 1e-12 ? (ssb / dfHet1) / (ssw / dfHet2) : 0;
  const hetP = M > 1 ? fDistPValue(hetF, dfHet1, dfHet2) : 1;

  const heteroskedasticityTest = {
    testName: 'Heteroskedastisitas Varians Error Antarsumber (Levene / Breusch-Pagan F)',
    statisticLabel: 'F-stat',
    statisticValue: hetF,
    dfLabel: `(${dfHet1}, ${dfHet2})`,
    pValue: hetP,
    status: (hetP < 0.05 ? 'warning' : 'ok') as 'ok' | 'warning',
    conclusion:
      hetP < 0.05
        ? `Terdeteksi perbedaan varians kesalahan yang signifikan antarsumber pengukuran (F = ${hetF.toFixed(3)}, p = ${hetP.toFixed(4)}).`
        : `Varians residual relatif homogen antarsumber pengukuran (F = ${hetF.toFixed(3)}, p = ${hetP.toFixed(4)}).`,
    implication:
      'Model Bayesian Laten memodelkan σ_εj secara heterogen per sumber, sedangkan regresi Pair FE menggunakan Cluster-Robust SE pada level Kota.'
  };

  // 2. Within-City Serial Correlation Test (Lag-1 AR(1) on deviations from latent truth theta_hat)
  const lagPairsPrev: number[] = [];
  const lagPairsCurr: number[] = [];
  comparisonSources.forEach(src => {
    const byCity = new Map<string, Array<{ year: number; err: number }>>();
    completeCaseObservations.forEach((o, p) => {
      const signedErr = o.values[src.id]! - latentOut.sharedLatentTheta[p];
      if (!byCity.has(o.city)) byCity.set(o.city, []);
      byCity.get(o.city)!.push({ year: o.year, err: signedErr });
    });
    byCity.forEach(list => {
      list.sort((a, b) => a.year - b.year);
      for (let i = 1; i < list.length; i++) {
        lagPairsPrev.push(list[i - 1].err);
        lagPairsCurr.push(list[i].err);
      }
    });
  });

  const nSerial = lagPairsCurr.length;
  const rhoSerial = nSerial >= 3 ? computePearsonR(lagPairsPrev, lagPairsCurr) : 0;
  const serialT =
    nSerial > 2 && Math.abs(rhoSerial) < 0.9999
      ? (rhoSerial * Math.sqrt(nSerial - 2)) / Math.sqrt(Math.max(1e-8, 1 - rhoSerial * rhoSerial))
      : 0;
  const serialP = nSerial > 2 ? studentTPValueTwoSided(serialT, nSerial - 2) : 1;

  const serialCorrelationTest = {
    testName: 'Autokorelasi Serial Dalam-Kota (Lag-1 Residual AR(1))',
    statisticLabel: 't-stat (ρ₁)',
    statisticValue: serialT,
    dfLabel: `df=${Math.max(1, nSerial - 2)}, ρ₁=${rhoSerial.toFixed(3)}`,
    pValue: serialP,
    status: (serialP < 0.05 ? 'warning' : 'ok') as 'ok' | 'warning',
    conclusion:
      serialP < 0.05
        ? `Terdeteksi korelasi serial antar-tahun di dalam kota yang sama (ρ₁ = ${rhoSerial.toFixed(3)}, t = ${serialT.toFixed(2)}, p = ${serialP.toFixed(4)}).`
        : `Tidak ditemukan autokorelasi serial signifikan di dalam kota (ρ₁ = ${rhoSerial.toFixed(3)}, p = ${serialP.toFixed(4)}).`,
    implication:
      'Clustering standard error pada level City ID mengakomodasi korelasi serial sebarang antar-tahun di dalam setiap kota.'
  };

  // 3. Cross-Sectional Dependence (Pesaran 2004 CD Test)
  const cityYearMap = new Map<string, Map<number, number>>();
  completeCaseObservations.forEach((o, p) => {
    const thetaHat = latentOut.sharedLatentTheta[p];
    const avgSignedErr =
      comparisonSources.reduce((s, src) => s + (o.values[src.id]! - thetaHat), 0) /
      Math.max(1, M);
    if (!cityYearMap.has(o.city)) cityYearMap.set(o.city, new Map<number, number>());
    cityYearMap.get(o.city)!.set(o.year, avgSignedErr);
  });

  const cityNames = Array.from(cityYearMap.keys());
  let cdSum = 0;
  let cdPairs = 0;
  for (let i = 0; i < cityNames.length; i++) {
    for (let j = i + 1; j < cityNames.length; j++) {
      const mapA = cityYearMap.get(cityNames[i])!;
      const mapB = cityYearMap.get(cityNames[j])!;
      const commonA: number[] = [];
      const commonB: number[] = [];
      mapA.forEach((vA, yr) => {
        if (mapB.has(yr)) {
          commonA.push(vA);
          commonB.push(mapB.get(yr)!);
        }
      });
      if (commonA.length >= 3) {
        const rIJ = computePearsonR(commonA, commonB);
        cdSum += Math.sqrt(commonA.length) * rIJ;
        cdPairs++;
      }
    }
  }

  const cdStat = cdPairs > 0 ? cdSum / Math.sqrt(cdPairs) : 0;
  const cdP = cdPairs > 0 ? normalPValueTwoSided(cdStat) : 1;

  const crossSectionalDependenceTest = {
    testName: 'Ketergantungan Lintas-Kota (Pesaran CD Test)',
    statisticLabel: 'CD-stat',
    statisticValue: cdStat,
    dfLabel: `${cdPairs} pasangan kota`,
    pValue: cdP,
    status: (cdP < 0.05 ? 'warning' : 'ok') as 'ok' | 'warning',
    conclusion:
      cdP < 0.05
        ? `Terdeteksi korelasi lintas-kota pada tahun yang sama (CD = ${cdStat.toFixed(3)}, p = ${cdP.toFixed(4)}).`
        : `Tidak ditemukan ketergantungan lintas-kota yang kuat (CD = ${cdStat.toFixed(3)}, p = ${cdP.toFixed(4)}).`,
    implication:
      'Penyerapan Pair Fixed Effects (α_it) dan faktor laten emisi tahunan θ_it menyerap guncangan makro bersama lintas kota.'
  };

  // 4. Cluster Count Audit
  const isSmallCluster = G < 30;
  const clusterCountAudit = {
    nClusters: G,
    isSmallCluster,
    message: isSmallCluster
      ? `Jumlah klaster kota G = ${G} (< 30). Gunakan Wild Cluster Bootstrap dan Bayesian Credible Interval agar inferensi tahan sampel kecil.`
      : `Jumlah klaster kota G = ${G} (≥ 30) memadai untuk inferensi Cluster-Robust asimtotik.`,
    recommendation: isSmallCluster
      ? 'Keputusan inferensial memadukan p-value Rademacher Wild Cluster Bootstrap dan Bayesian Posterior Superiority Probability.'
      : 'Inferensi Cluster-Robust, Wild Bootstrap, dan Bayesian Posterior saling mengonfirmasi.'
  };

  // 5. Outlier Sensitivity Audit (Full MAE vs 95% Trimmed MAE against shared latent truth)
  const rawEntries = comparisonSources.map((src, m) => {
    const arr = [...aeBySource[m]].sort((a, b) => a - b);
    const maeFull = maeBySource[m];
    const cutoffIdx = Math.max(1, Math.floor(arr.length * 0.95));
    const trimmed = arr.slice(0, cutoffIdx);
    const maeTrimmed95 = trimmed.length
      ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length
      : maeFull;
    const shiftPct =
      maeFull > 1e-12 ? ((maeTrimmed95 - maeFull) / maeFull) * 100 : 0;
    return {
      sourceId: src.id,
      sourceLabel: `${src.name} (${src.label})`,
      maeFull,
      maeTrimmed95,
      rankFull: 0,
      rankTrimmed95: 0,
      shiftPct
    };
  });

  const byFull = [...rawEntries].sort((a, b) => a.maeFull - b.maeFull);
  byFull.forEach((e, i) => {
    e.rankFull = i + 1;
  });
  const byTrim = [...rawEntries].sort((a, b) => a.maeTrimmed95 - b.maeTrimmed95);
  byTrim.forEach((e, i) => {
    e.rankTrimmed95 = i + 1;
  });

  const rankOrderChanged = rawEntries.some(e => e.rankFull !== e.rankTrimmed95);
  const outlierSensitivityAudit = {
    rankOrderChanged,
    entries: rawEntries as OutlierSensitivityEntry[],
    summary: rankOrderChanged
      ? 'PERINGATAN: Urutan peringkat deviasi berubah ketika 5% error ekstrem dipangkas; kesimpulan akurasi sensitif terhadap pencilan.'
      : 'Urutan peringkat deviasi antar seluruh sumber tetap konsisten baik dengan maupun tanpa 5% error ekstrem.'
  };

  // 6. Bayesian Convergence Audit (R-hat, ESS, PPC)
  const latentSummary = latentOut.summary;
  const bayesianConvergenceAudit = {
    maxRhat: latentSummary.maxRhat,
    minEss: latentSummary.minEss,
    posteriorPredictivePValue: latentSummary.posteriorPredictivePValue,
    converged: latentSummary.converged,
    summary: latentSummary.converged
      ? `Rantai MCMC (${latentSummary.nChains} rantai × ${latentSummary.iterationsPerChain} iterasi) konvergen baik: max R-hat = ${latentSummary.maxRhat.toFixed(4)} (<= 1.10), min ESS = ${latentSummary.minEss}, Posterior Predictive p-value = ${latentSummary.posteriorPredictivePValue.toFixed(3)}.`
      : `Peringatan konvergensi atau identifikasi (max R-hat = ${latentSummary.maxRhat.toFixed(4)}, J = ${latentSummary.nSources}).`
  };

  // 7. Normality & CLT note
  const allResids = residBySource.flat();
  const nR = allResids.length;
  const meanR = nR > 0 ? allResids.reduce((a, b) => a + b, 0) / nR : 0;
  const sdR =
    nR > 1
      ? Math.sqrt(Math.max(1e-12, allResids.reduce((s, v) => s + (v - meanR) ** 2, 0) / (nR - 1)))
      : 1;
  const skew =
    nR >= 3 ? allResids.reduce((s, v) => s + ((v - meanR) / sdR) ** 3, 0) / nR : 0;
  const kurtEx =
    nR >= 4 ? allResids.reduce((s, v) => s + ((v - meanR) / sdR) ** 4, 0) / nR - 3 : 0;
  const jbStat = nR >= 4 ? (nR / 6) * (skew * skew + (kurtEx * kurtEx) / 4) : 0;
  const shapiroProxyPValue = Math.exp(-0.5 * jbStat);

  const normalityAndCltNote = {
    residualSkewness: skew,
    residualKurtosisExcess: kurtEx,
    shapiroProxyPValue,
    explanation:
      `Skewness residual within-pair = ${skew.toFixed(3)}, excess kurtosis = ${kurtEx.toFixed(3)}. ` +
      `Distribusi kesalahan absolut (AE ≥ 0) secara alami menceng kanan; ketidaknormalan AE bukan cacat validitas karena inferensi Bayesian mengandalkan posterior Gibbs penuh sedangkan Pair Fixed Effects mengandalkan Central Limit Theorem (CLT) & Wild Cluster Bootstrap.`
  };

  const inferenceLimitations: string[] = [
    latentSummary.epistemologicalCaveat,
    ...(latentSummary.nSources < 3
      ? ['Jumlah sumber J < 3: model pengukuran laten tanpa variabel referensi bersifat underidentified secara teoretis.']
      : []),
    ...(isSmallCluster
      ? [`Jumlah klaster kota terbatas (G = ${G} < 30); prioritaskan Rademacher Wild Cluster Bootstrap & Bayesian Credible Interval.`]
      : []),
    ...(rankOrderChanged
      ? ['Peringkat sensitif terhadap 5% observasi ekstrem; periksa tabel 95% Trimmed MAE sebelum menarik kesimpulan mutlak.']
      : []),
    ...(P < prepared.allCleanedObservations.length
      ? [`Evaluasi utama menggunakan ${P} pasangan Complete-Case dari ${prepared.allCleanedObservations.length} baris panel.`]
      : [])
  ];

  return {
    heteroskedasticityTest,
    serialCorrelationTest,
    crossSectionalDependenceTest,
    clusterCountAudit,
    outlierSensitivityAudit,
    bayesianConvergenceAudit,
    normalityAndCltNote,
    inferenceLimitations
  };
}
