// ============================================================
// Reference-Free All-Source Comparative Ranking (Step 8)
// Evaluates & ranks ALL J sources symmetrically (#1..#J) using:
// - Primary Metric: Total Latent RMSE (incorporating Error SD, α_j bias, λ_j scaling)
//   paired with Classical Reliability R² and Bayesian Posterior Probability of Being Best
// - Secondary Confirmation: LOSO MAE, Lin's CCC, Pair FE Wild Bootstrap Contrasts,
//   R-hat convergence & 95% Trimmed Outlier Sensitivity.
// Never forces a single winner when evidence is underidentified, tied, or conflicting.
// ============================================================

import { LatentEngineInternalOutput } from './panel-accuracy-latent';
import {
  ComparativeRankingResult,
  PairFixedEffectsResult,
  PanelAccuracyDiagnosticsResult,
  PanelAccuracyQualityReport,
  SourceAccuracyMetricRow,
  SourceRankEntry,
  WhyBestSourceAnalysis
} from './panel-accuracy-types';

export function computeComparativeSourceRanking(params: {
  metrics: SourceAccuracyMetricRow[];
  latentOut: LatentEngineInternalOutput;
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  qualityReport: PanelAccuracyQualityReport;
}): ComparativeRankingResult {
  const { metrics, latentOut, pairFixedEffects, diagnostics, qualityReport } = params;
  const benchLabel = 'Consensus Latent Benchmark (θ̂ — Tanpa Reference Terkunci)';

  if (metrics.length === 0) {
    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      canonicalStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      conclusivenessStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      bestSourceId: null,
      bestSourceLabel: null,
      bestCandidateId: null,
      bestCandidateLabel: null,
      whyBestAnalysis: {
        headline: 'Belum Tersedia Sumber Pengukuran untuk Dievaluasi',
        isProvenWinner: false,
        candidateLabel: '-',
        points: []
      },
      tiedTopSourceLabels: [],
      rankingSummary: 'Tidak ada sumber pengukuran yang dapat dievaluasi.',
      methodologicalCaveat: 'Minimal diperlukan 3 sumber pengukuran independen untuk ranking tanpa referensi.',
      ranks: []
    };
  }

  // Sort ALL J sources primarily by Total Latent RMSE ascending, tie-break by Posterior Expected Loss & Error SD
  const sorted = [...metrics].sort((a, b) => {
    if (Math.abs(a.totalLatentRmse - b.totalLatentRmse) > 1e-6) {
      return a.totalLatentRmse - b.totalLatentRmse;
    }
    if (Math.abs(a.posteriorExpectedLoss - b.posteriorExpectedLoss) > 1e-6) {
      return a.posteriorExpectedLoss - b.posteriorExpectedLoss;
    }
    if (Math.abs(a.errorSd - b.errorSd) > 1e-6) {
      return a.errorSd - b.errorSd;
    }
    return b.reliabilityR2 - a.reliabilityR2;
  });

  const top = sorted[0];
  const minMae = Math.min(...sorted.map(s => s.mae));

  const ranks: SourceRankEntry[] = sorted.map((m, idx) => {
    let pCluster: number | null = null;
    let pWild: number | null = null;
    let postProbBetter: number | null = null;

    if (idx > 0) {
      const contrast = pairFixedEffects.pairwiseContrasts.find(
        c =>
          (c.sourceAId === top.sourceId && c.sourceBId === m.sourceId) ||
          (c.sourceAId === m.sourceId && c.sourceBId === top.sourceId)
      );
      if (contrast) {
        pCluster = contrast.pValueCluster;
        pWild = contrast.wildBootstrapPValue;
      }
      postProbBetter =
        latentOut.pairwisePosteriorProb[`${top.sourceId}::${m.sourceId}`] ?? 0.5;
    }

    const effectiveP =
      pairFixedEffects.smallClusterWarning && pWild !== null ? pWild : pCluster;

    // Harmonized Bayesian & Frequentist relative superiority check (Section I):
    // Do not force rigid simultaneous 95% AND p<0.05 if one is strong (>=95% or <0.05) and the other is concordant (>=90% or <0.10)
    const bayesStrong = postProbBetter !== null && postProbBetter >= 0.95;
    const bayesConcordant = postProbBetter !== null && postProbBetter >= 0.9;
    const freqStrong = effectiveP !== null && effectiveP < 0.05;
    const freqConcordant = effectiveP !== null && effectiveP < 0.1;
    const isProvenRelativeSuperior =
      (bayesStrong && freqConcordant) || (freqStrong && bayesConcordant) || (bayesStrong && effectiveP === null);
    const isIndistinguishable = idx === 0 ? false : !isProvenRelativeSuperior;
    const loaWidth = m.blandAltman.loaUpper - m.blandAltman.loaLower;

    const biasHeavyNote =
      idx > 0 && m.reliabilityR2 > top.reliabilityR2 && m.totalLatentRmse > top.totalLatentRmse * 1.25
        ? ` Meski presisi R² tinggi (${(m.reliabilityR2 * 100).toFixed(2)}%), bias sistematisnya membuat Total RMSE jauh lebih besar.`
        : '';

    const rankNote =
      idx === 0
        ? `Akurasi tertinggi (#1 dari ${sorted.length} sumber): Total Latent RMSE = ${m.totalLatentRmse.toFixed(3)} (95% CrI [${m.totalLatentRmseCiLower.toFixed(3)}, ${m.totalLatentRmseCiUpper.toFixed(3)}]), Error SD = ${m.errorSd.toFixed(3)}, Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}%, P(Best) = ${(m.posteriorProbBest * 100).toFixed(1)}%, Expected Rank = ${m.expectedRank.toFixed(2)}.`
        : isIndistinguishable
          ? `Selisih Total RMSE +${(m.totalLatentRmse - top.totalLatentRmse).toFixed(3)} terhadap #1 (P(Best>${m.sourceName})=${((postProbBetter ?? 0.5) * 100).toFixed(1)}%, Wild p=${(effectiveP ?? 1).toFixed(4)}): keunggulan relatif belum konklusif.`
          : `Kalah signifikan dibanding #1: Total Latent RMSE +${(m.totalLatentRmse - top.totalLatentRmse).toFixed(3)} lebih tinggi (P(#1 lebih baik)=${((postProbBetter ?? 1) * 100).toFixed(1)}%, Wild p=${(effectiveP ?? 0).toFixed(4)}).${biasHeavyNote}`;

    return {
      rank: idx + 1,
      sourceId: m.sourceId,
      sourceName: m.sourceName,
      sourceLabel: m.sourceLabel,
      totalLatentRmse: m.totalLatentRmse,
      totalRmseCiLower: m.totalLatentRmseCiLower,
      totalRmseCiUpper: m.totalLatentRmseCiUpper,
      errorSd: m.errorSd,
      scaleDistortion: m.scaleDistortion,
      posteriorExpectedLoss: m.posteriorExpectedLoss,
      expectedRank: m.expectedRank,
      rankingStabilityPct: m.rankingStabilityPct,
      losoPredictiveCoverage95: m.losoPredictiveCoverage95,
      reliabilityR2: m.reliabilityR2,
      posteriorProbBest: m.posteriorProbBest,
      mae: m.mae,
      rmse: m.rmse,
      absMbe: Math.abs(m.mbe),
      mbe: m.mbe,
      ccc: m.ccc.ccc,
      pearsonR: m.pearsonR,
      loaWidth,
      diffFromTopLatentRmse: m.totalLatentRmse - top.totalLatentRmse,
      diffFromTopMae: m.mae - minMae,
      posteriorProbBetterThanSecond: postProbBetter,
      pValueVsTopCluster: pCluster,
      pValueVsTopWildBootstrap: pWild,
      isStatisticallyIndistinguishableFromTop: isIndistinguishable,
      rankNote
    };
  });

  const second = ranks[1];

  const buildWhyBest = (isProven: boolean, statusLabel: string): WhyBestSourceAnalysis => ({
    headline: isProven
      ? `Mengapa ${top.sourceLabel} Terbukti Menjadi Sumber Paling Akurat Secara Relatif (#1 dari ${ranks.length} Sumber)?`
      : `Mengapa ${top.sourceLabel} Menjadi Kandidat Terbaik Sementara (Status: ${statusLabel})?`,
    isProvenWinner: isProven,
    candidateLabel: top.sourceLabel,
    points: [
      {
        label: '1. Alasan Peringkat Pertama (Total Latent Accuracy)',
        detail: `${top.sourceLabel} mencatat Total Latent RMSE terendah (${top.totalLatentRmse.toFixed(3)}, 95% CrI [${top.totalLatentRmseCiLower.toFixed(3)}, ${top.totalLatentRmseCiUpper.toFixed(3)}]) dan Posterior Expected Loss terkecil (${top.posteriorExpectedLoss.toFixed(3)}).`
      },
      {
        label: '2. Dekomposisi Estimasi Kesalahan (Trueness + Scale + Precision)',
        detail: `Total kesalahan berasal dari gabungan bias aditif α = ${top.latentInterceptBias.toFixed(3)}, distorsi skala λ = ${top.latentLoading.toFixed(3)} (komponen skala = ${top.scaleDistortion.toFixed(3)}), dan simpangan baku galat acak σ_ε = ${top.errorSd.toFixed(3)}.`
      },
      {
        label: '3. Evaluasi Bias Sistematis (Trueness)',
        detail: `Bias sistematis relatif terhadap konsensus laten adalah ${top.latentInterceptBias.toFixed(3)} ${top.unit} (LOSO MBE = ${top.mbe.toFixed(3)}), menunjukkan penyimpangan sistematis paling terkendali.`
      },
      {
        label: '4. Evaluasi Presisi & Reliabilitas (Precision)',
        detail: `Reliabilitas pengukuran R² mencapai ${(top.reliabilityR2 * 100).toFixed(2)}% (95% CrI [${(top.reliabilityCiLower * 100).toFixed(2)}%, ${(top.reliabilityCiUpper * 100).toFixed(2)}%]) dengan Error SD σ_ε = ${top.errorSd.toFixed(3)}.`
      },
      {
        label: '5. Validasi Prediktif Leave-One-Source-Out (Tanpa Ground Truth)',
        detail: `Saat ${top.sourceName} dikeluarkan dari pembentukan nilai laten, kesalahan prediktif LOSO MAE = ${top.mae.toFixed(3)}, LOSO RMSE = ${top.rmse.toFixed(3)}, dan cakupan interval prediktif 95% = ${top.losoPredictiveCoverage95.toFixed(1)}%.`
      },
      {
        label: '6. Dukungan Distribusi Posterior & Ekonometrika Panel',
        detail: second
          ? `Probabilitas posterior menjadi peringkat #1 adalah ${(top.posteriorProbBest * 100).toFixed(1)}% (Expected Rank = ${top.expectedRank.toFixed(2)}, stabilitas = ${top.rankingStabilityPct.toFixed(1)}%), dengan peluang mengalahkan peringkat #2 (${second.sourceLabel}) sebesar ${((second.posteriorProbBetterThanSecond ?? 0.5) * 100).toFixed(1)}% dan Wild Bootstrap p = ${(second.pValueVsTopWildBootstrap ?? 1).toFixed(4)}.`
          : `Probabilitas posterior menjadi peringkat #1 adalah ${(top.posteriorProbBest * 100).toFixed(1)}%.`
      },
      {
        label: '7. Stabilitas Spesifikasi & Sensitivitas Asumsi',
        detail: `Konvergensi MCMC tercatat max R-hat = ${latentOut.summary.maxRhat.toFixed(4)} (ESS min = ${latentOut.summary.minEss}), sensitivitas 95% Trimmed MAE ${diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'mengalami pergeseran urutan' : 'konsisten mempertahankan urutan #1'}, dan korelasi galat antarsumber ${latentOut.summary.correlatedErrorPairs.length === 0 ? 'bebas pelanggaran signifikan' : 'memerlukan perhatian pada pasangan sumber berkorelasi'}.`
      },
      {
        label: '8. Keterbatasan Kesimpulan Ilmiah',
        detail: `${latentOut.summary.epistemologicalCaveat} ${isProven ? 'Keunggulan ini bersifat relatif terhadap himpunan sumber yang diuji.' : 'Karena bukti statistik belum konklusif sepenuhnya, perlakukan sumber ini sebagai kandidat terbaik sementara hingga informasi/instrumen tambahan tersedia.'}`
      }
    ]
  });

  // 1. Check Latent Model Identifiability (requires J >= 3, no zero variance, MCMC convergence)
  if (!qualityReport.latentAudit.isIdentifiedForAllSourceRanking || !latentOut.summary.converged) {
    const warnText = qualityReport.latentAudit.warnings.filter(Boolean).join('; ');
    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      canonicalStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      conclusivenessStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      bestSourceId: null,
      bestSourceLabel: null,
      bestCandidateId: top.sourceId,
      bestCandidateLabel: top.sourceLabel,
      whyBestAnalysis: buildWhyBest(false, 'MODEL_TIDAK_TERIDENTIFIKASI'),
      tiedTopSourceLabels: ranks.map(r => r.sourceLabel),
      rankingSummary:
        qualityReport.latentAudit.nSources < 3
          ? `Model pengukuran laten tanpa variabel referensi membutuhkan minimal J = 3 sumber independen agar varians galat tiap sumber dapat dipisahkan secara unik (saat ini J = ${qualityReport.latentAudit.nSources}). Kandidat kesalahan terendah sementara: ${top.sourceLabel}.`
          : !latentOut.summary.converged
            ? `Rantai MCMC belum mencapai konvergensi memadai (max R-hat = ${latentOut.summary.maxRhat.toFixed(4)} > 1.10). Jalankan "Verifikasi Presisi Penuh (800–1.000 MCMC)" di Step 7 atau aktifkan Winsorization / periksa kolinearitas sumber di Step 2–3.${warnText ? ` Catatan: ${warnText}` : ''}`
            : `Terdapat kendala kualitas atau identifikasi data panel (${warnText || 'periksa kelengkapan pasangan data & varians nol pada sumber'}).`,
      methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
      ranks
    };
  }

  // 2. Check cross-metric consistency across Total Latent RMSE (ISO 5725 Accuracy = Trueness + Precision), LOSO MAE, CCC, Outlier & Correlated Error sensitivity
  const minErrorSd = Math.min(...ranks.map(r => r.errorSd));
  const maxR2 = Math.max(...ranks.map(r => r.reliabilityR2));
  const maxCcc = Math.max(...ranks.map(r => r.ccc));

  const precisionConflict =
    top.reliabilityR2 < 0.7 ||
    (top.reliabilityR2 < maxR2 - 0.12 && top.errorSd > minErrorSd * 2.0);
  const losoMaeConflict = top.mae > minMae * 1.15;
  const cccConflict = top.ccc.ccc < maxCcc - 0.08;
  const outlierFlip = diagnostics.outlierSensitivityAudit.rankOrderChanged;
  const correlatedErrorFlip =
    latentOut.summary.correlatedErrorPairs.length > 0 &&
    latentOut.summary.correlatedErrorAdjustedTopSourceId !== null &&
    latentOut.summary.correlatedErrorAdjustedTopSourceId !== top.sourceId;

  const tiedTop = [
    top.sourceLabel,
    ...ranks.slice(1).filter(r => r.isStatisticallyIndistinguishableFromTop).map(r => r.sourceLabel)
  ];

  if (precisionConflict || losoMaeConflict || cccConflict || outlierFlip || correlatedErrorFlip) {
    const reasons: string[] = [];
    if (precisionConflict) {
      reasons.push(`${top.sourceLabel} memiliki Total RMSE terendah namun reliabilitas R² rendah dibanding sumber lain`);
    }
    if (losoMaeConflict) {
      reasons.push(`LOSO MAE pada ${top.sourceLabel} lebih besar >15% dibanding sumber lain`);
    }
    if (cccConflict) {
      reasons.push(`Lin's CCC terhadap konsensus lebih rendah dibanding sumber lain`);
    }
    if (outlierFlip) {
      reasons.push('urutan peringkat deviasi berubah saat 5% observasi ekstrem dipangkas');
    }
    if (correlatedErrorFlip) {
      reasons.push('peringkat #1 bergeser ketika korelasi kesalahan antarsumber dikoreksi');
    }

    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      canonicalStatus: 'KONFLIK_ANTAR_METRIK',
      conclusivenessStatus: 'KONFLIK_ANTAR_METRIK',
      bestSourceId: null,
      bestSourceLabel: null,
      bestCandidateId: top.sourceId,
      bestCandidateLabel: top.sourceLabel,
      whyBestAnalysis: buildWhyBest(false, 'KONFLIK_ANTAR_METRIK'),
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Secara titik estimasi ${top.sourceLabel} mencatat Total Latent RMSE terendah (${top.totalLatentRmse.toFixed(3)}), namun ditemukan pertentangan antar indikator evaluasi (${reasons.join('; ')}). Oleh karena itu, ${top.sourceLabel} ditampilkan sebagai kandidat terbaik sementara dengan status KONFLIK_ANTAR_METRIK.`,
      methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
      ranks
    };
  }

  // 3. Check statistical superiority against rank #2
  if (second.isStatisticallyIndistinguishableFromTop) {
    const pUsed =
      pairFixedEffects.smallClusterWarning && second.pValueVsTopWildBootstrap !== null
        ? second.pValueVsTopWildBootstrap
        : second.pValueVsTopCluster ?? 1;
    const postProb = second.posteriorProbBetterThanSecond ?? 0.5;

    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      canonicalStatus: 'KANDIDAT_TERBAIK_BELUM_KONKLUSIF',
      conclusivenessStatus: 'PERBEDAAN_TIDAK_SIGNIFIKAN',
      bestSourceId: null,
      bestSourceLabel: null,
      bestCandidateId: top.sourceId,
      bestCandidateLabel: top.sourceLabel,
      whyBestAnalysis: buildWhyBest(false, 'KANDIDAT_TERBAIK_BELUM_KONKLUSIF'),
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Kandidat terbaik dengan estimasi kesalahan terendah adalah ${top.sourceLabel} (Total Latent RMSE = ${top.totalLatentRmse.toFixed(3)}, Error SD = ${top.errorSd.toFixed(3)}, R² = ${(top.reliabilityR2 * 100).toFixed(2)}%) diikuti ${second.sourceLabel} (Total RMSE = ${second.totalLatentRmse.toFixed(3)}), ` +
        `namun ketidakpastian posterior dan inferensi panel belum cukup memisahkan keduanya secara mutlak (P_Bayes = ${(postProb * 100).toFixed(1)}%, Pair FE p = ${pUsed.toFixed(4)}). Status: KANDIDAT_TERBAIK_BELUM_KONKLUSIF.`,
      methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
      ranks
    };
  }

  // 4. Conclusive Relative Winner across ALL J evaluated sources!
  const pUsed =
    pairFixedEffects.smallClusterWarning && second.pValueVsTopWildBootstrap !== null
      ? second.pValueVsTopWildBootstrap
      : second.pValueVsTopCluster ?? 0;

  return {
    primaryMetric: 'TOTAL_LATENT_RMSE',
    referenceSourceId: 'latent_consensus',
    referenceSourceLabel: benchLabel,
    isConclusive: true,
    canonicalStatus: 'PEMENANG_TERBUKTI_RELATIF',
    conclusivenessStatus: 'TERBUKTI_BERBEDA_SIGNIFIKAN',
    bestSourceId: top.sourceId,
    bestSourceLabel: top.sourceLabel,
    bestCandidateId: top.sourceId,
    bestCandidateLabel: top.sourceLabel,
    whyBestAnalysis: buildWhyBest(true, 'PEMENANG_TERBUKTI_RELATIF'),
    tiedTopSourceLabels: [top.sourceLabel],
    rankingSummary:
      `Dari keseluruhan J = ${ranks.length} sumber pengukuran yang dievaluasi setara tanpa referensi terkunci, ${top.sourceLabel} terbukti menempati Peringkat #1 (Status: PEMENANG_TERBUKTI_RELATIF) dengan akurasi relatif tertinggi ` +
      `(Total Latent RMSE = ${top.totalLatentRmse.toFixed(3)}, Error SD = ${top.errorSd.toFixed(3)}, Reliabilitas R² = ${(top.reliabilityR2 * 100).toFixed(2)}%, Posterior Prob Best = ${(top.posteriorProbBest * 100).toFixed(1)}%), ` +
      `mengungguli peringkat #2 (${second.sourceLabel}, Total RMSE = ${second.totalLatentRmse.toFixed(3)}) secara meyakinkan (P_Bayes = ${((second.posteriorProbBetterThanSecond ?? 1) * 100).toFixed(1)}%, Pair FE p = ${pUsed.toFixed(4)}) serta lolos validasi LOSO dan sensitivitas.`,
    methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
    ranks
  };
}
