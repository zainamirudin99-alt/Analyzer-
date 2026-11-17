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
  SourceRankEntry
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
      conclusivenessStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: [],
      rankingSummary: 'Tidak ada sumber pengukuran yang dapat dievaluasi.',
      methodologicalCaveat: 'Minimal diperlukan 3 sumber pengukuran independen untuk ranking tanpa referensi.',
      ranks: []
    };
  }

  // Sort ALL J sources primarily by Total Latent RMSE ascending, tie-break by Error SD ascending & Reliability R² descending
  const sorted = [...metrics].sort((a, b) => {
    if (Math.abs(a.totalLatentRmse - b.totalLatentRmse) > 1e-6) {
      return a.totalLatentRmse - b.totalLatentRmse;
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
    // Bayesian OR Pair FE indistinguishability check
    const bayesClear = postProbBetter !== null && postProbBetter >= 0.95;
    const freqClear = effectiveP !== null && effectiveP < 0.05;
    const isIndistinguishable = idx === 0 ? false : !(bayesClear && freqClear);
    const loaWidth = m.blandAltman.loaUpper - m.blandAltman.loaLower;

    const rankNote =
      idx === 0
        ? `Akurasi tertinggi (#1 dari ${sorted.length} sumber): Total Latent RMSE = ${m.totalLatentRmse.toFixed(3)}, Error SD = ${m.errorSd.toFixed(3)}, Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}%, Posterior Prob Best = ${(m.posteriorProbBest * 100).toFixed(1)}%.`
        : isIndistinguishable
          ? `Selisih Total RMSE +${(m.totalLatentRmse - top.totalLatentRmse).toFixed(3)} terhadap #1 (P(Best>${m.sourceName})=${((postProbBetter ?? 0.5) * 100).toFixed(1)}%, Wild p=${(effectiveP ?? 1).toFixed(4)}): perbedaan belum cukup kuat secara simultan.`
          : `Kalah signifikan dibanding #1: Total Latent RMSE +${(m.totalLatentRmse - top.totalLatentRmse).toFixed(3)} lebih tinggi (P(#1 lebih baik)=${((postProbBetter ?? 1) * 100).toFixed(1)}%, Wild p=${(effectiveP ?? 0).toFixed(4)} < 0.05).`;

    return {
      rank: idx + 1,
      sourceId: m.sourceId,
      sourceName: m.sourceName,
      sourceLabel: m.sourceLabel,
      totalLatentRmse: m.totalLatentRmse,
      errorSd: m.errorSd,
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

  // 1. Check Latent Model Identifiability (requires J >= 3, no zero variance, MCMC convergence)
  if (!qualityReport.latentAudit.isIdentifiedForAllSourceRanking || !latentOut.summary.converged) {
    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      conclusivenessStatus: 'MODEL_TIDAK_TERIDENTIFIKASI',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: ranks.map(r => r.sourceLabel),
      rankingSummary:
        qualityReport.latentAudit.nSources < 3
          ? `Model pengukuran laten tanpa variabel referensi membutuhkan minimal J = 3 sumber independen agar varians galat tiap sumber dapat dipisahkan secara unik (saat ini J = ${qualityReport.latentAudit.nSources}).`
          : `Model pengukuran laten belum mencapai konvergensi memadai (max R-hat = ${latentOut.summary.maxRhat.toFixed(4)}) atau terdapat kendala kualitas data (${qualityReport.latentAudit.warnings.join(' ')}).`,
      methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
      ranks
    };
  }

  // 2. Check cross-metric consistency across Total Latent RMSE, Precision Error SD / Reliability, LOSO MAE, and Outlier sensitivity
  const minErrorSd = Math.min(...ranks.map(r => r.errorSd));
  const maxR2 = Math.max(...ranks.map(r => r.reliabilityR2));
  const maxCcc = Math.max(...ranks.map(r => r.ccc));

  const precisionConflict = top.errorSd > minErrorSd * 1.15 || top.reliabilityR2 < maxR2 - 0.03;
  const losoMaeConflict = top.mae > minMae * 1.12;
  const cccConflict = top.ccc.ccc < maxCcc - 0.08;
  const outlierFlip = diagnostics.outlierSensitivityAudit.rankOrderChanged;

  const second = ranks[1];
  const tiedTop = [
    top.sourceLabel,
    ...ranks.slice(1).filter(r => r.isStatisticallyIndistinguishableFromTop).map(r => r.sourceLabel)
  ];

  if (precisionConflict || losoMaeConflict || cccConflict || outlierFlip) {
    const reasons: string[] = [];
    if (precisionConflict) {
      reasons.push(`${top.sourceLabel} memiliki Total RMSE terendah namun bukan sumber dengan presisi Error SD/R² tertinggi`);
    }
    if (losoMaeConflict) {
      reasons.push(`LOSO MAE pada ${top.sourceLabel} lebih besar >12% dibanding sumber lain`);
    }
    if (cccConflict) {
      reasons.push(`Lin's CCC terhadap konsensus lebih rendah dibanding sumber lain`);
    }
    if (outlierFlip) {
      reasons.push('urutan peringkat deviasi berubah saat 5% observasi ekstrem dipangkas');
    }

    return {
      primaryMetric: 'TOTAL_LATENT_RMSE',
      referenceSourceId: 'latent_consensus',
      referenceSourceLabel: benchLabel,
      isConclusive: false,
      conclusivenessStatus: 'KONFLIK_ANTAR_METRIK',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Secara titik estimasi ${top.sourceLabel} mencatat Total Latent RMSE terendah (${top.totalLatentRmse.toFixed(3)}), namun ditemukan pertentangan antar indikator evaluasi (${reasons.join('; ')}). Oleh karena itu, belum terdapat bukti konklusif untuk menetapkan satu pemenang tunggal.`,
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
      conclusivenessStatus: 'PERBEDAAN_TIDAK_SIGNIFIKAN',
      bestSourceId: null,
      bestSourceLabel: null,
      tiedTopSourceLabels: tiedTop,
      rankingSummary:
        `Meskipun ${top.sourceLabel} unggul secara titik estimasi (Total Latent RMSE = ${top.totalLatentRmse.toFixed(3)}, Error SD = ${top.errorSd.toFixed(3)}, R² = ${(top.reliabilityR2 * 100).toFixed(2)}%) atas ${second.sourceLabel} (Total RMSE = ${second.totalLatentRmse.toFixed(3)}), ` +
        `bukti inferensial belum cukup memisahkan keduanya secara meyakinkan (P_Bayes = ${(postProb * 100).toFixed(1)}%, Pair FE p = ${pUsed.toFixed(4)}).`,
      methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
      ranks
    };
  }

  // 4. Conclusive Winner across ALL J evaluated sources!
  const pUsed =
    pairFixedEffects.smallClusterWarning && second.pValueVsTopWildBootstrap !== null
      ? second.pValueVsTopWildBootstrap
      : second.pValueVsTopCluster ?? 0;

  return {
    primaryMetric: 'TOTAL_LATENT_RMSE',
    referenceSourceId: 'latent_consensus',
    referenceSourceLabel: benchLabel,
    isConclusive: true,
    conclusivenessStatus: 'TERBUKTI_BERBEDA_SIGNIFIKAN',
    bestSourceId: top.sourceId,
    bestSourceLabel: top.sourceLabel,
    tiedTopSourceLabels: [top.sourceLabel],
    rankingSummary:
      `Dari keseluruhan J = ${ranks.length} sumber pengukuran yang dievaluasi setara tanpa referensi terkunci, ${top.sourceLabel} terbukti menempati Peringkat #1 dengan akurasi dan konsistensi tertinggi ` +
      `(Total Latent RMSE = ${top.totalLatentRmse.toFixed(3)}, Error SD = ${top.errorSd.toFixed(3)}, Reliabilitas R² = ${(top.reliabilityR2 * 100).toFixed(2)}%, Posterior Prob Best = ${(top.posteriorProbBest * 100).toFixed(1)}%), ` +
      `mengungguli peringkat #2 (${second.sourceLabel}, Total RMSE = ${second.totalLatentRmse.toFixed(3)}) secara signifikan (P_Bayes = ${((second.posteriorProbBetterThanSecond ?? 1) * 100).toFixed(1)}%, Pair FE p = ${pUsed.toFixed(4)} < 0.05) tanpa konflik metrik maupun sensitivitas outlier.`,
    methodologicalCaveat: latentOut.summary.epistemologicalCaveat,
    ranks
  };
}
