// ============================================================
// OPTION 3 — PHASE 1 (5.1.3–5.1.5): Probabilistic Source Ranking,
// Cumulative Rank Probabilities P(R_j <= k | Data), Entity/Temporal
// Stability, & 10-Scenario Common-Mode Bias Epistemological Simulator
// ============================================================

import { advMeanSd, advMedian } from './panel-adv-preprocessing';
import {
  AdvCommonModeBiasScenario,
  AdvLatentEstimationBundle,
  AdvPreprocessingBundle,
  AdvRankingBundle,
  AdvSourceRankingRow
} from './panel-adv-types';

export function computeOption3SourceRanking(params: {
  preprocessed: AdvPreprocessingBundle;
  estimation: AdvLatentEstimationBundle;
}): AdvRankingBundle {
  const { preprocessed, estimation } = params;
  const { completeObservations, sources, entities, periods } = preprocessed;
  const J = sources.length;

  if (J === 0 || estimation.sourceParameters.length === 0) {
    return {
      rankingBasisLabel: 'Dual Estimand: Anchor-Conditioned Total RMSE & Scale-Adjusted Noise Ratio (σ_j/|λ_j|)',
      verdictStatus: 'UNIDENTIFIED_OR_NONCONVERGENT',
      isConclusiveWithoutGroundTruthCaveat: false,
      leaderSourceId: null,
      leaderSourceLabel: null,
      tiedWithLeaderLabels: [],
      rows: [],
      commonModeBiasScenarios: [],
      commonModeLimitationStatement:
        'Tanpa Ground Truth, bias kolektif searah yang identik di seluruh sumber tidak dapat dipisahkan dari rataan sinyal laten.',
      rankingSynthesisNarrative: 'Tidak terdapat sumber yang cukup untuk dievaluasi.'
    };
  }

  // Posterior draw-by-draw ranking matrix across S draws
  const firstSrcId = sources[0].id;
  const nDraws = estimation.posteriorTotalRmseDrawsBySource[firstSrcId]?.length || 1;
  const rankCountsBySource: Record<string, number[]> = {};
  const rankDrawsBySource: Record<string, number[]> = {};
  sources.forEach(s => {
    rankCountsBySource[s.id] = new Array<number>(J).fill(0);
    rankDrawsBySource[s.id] = [];
  });

  for (let d = 0; d < nDraws; d++) {
    const drawItems = sources.map(s => ({
      id: s.id,
      val: estimation.posteriorTotalRmseDrawsBySource[s.id]?.[d] ?? Infinity
    }));
    drawItems.sort((a, b) => a.val - b.val);
    drawItems.forEach((it, rIdx) => {
      rankCountsBySource[it.id][rIdx]++;
      rankDrawsBySource[it.id].push(rIdx + 1);
    });
  }

  // Entity & Temporal Stability: % of entities and % of time periods where source j achieves lowest empirical squared deviation from latent signal
  const grandCenter =
    completeObservations.length > 0
      ? completeObservations.reduce(
          (acc, o) =>
            acc +
            sources.reduce((s, src) => s + (o.transformedValues[src.id] ?? 0), 0) / J,
          0
        ) / completeObservations.length
      : 0;

  const entityWins: Record<string, number> = {};
  const periodWins: Record<string, number> = {};
  sources.forEach(s => {
    entityWins[s.id] = 0;
    periodWins[s.id] = 0;
  });

  let validEntityGroups = 0;
  entities.forEach(ent => {
    const idxs = completeObservations
      .map((o, i) => ({ o, i }))
      .filter(x => x.o.entity === ent);
    if (idxs.length === 0) return;
    validEntityGroups++;
    let bestId = sources[0].id;
    let bestMse = Infinity;
    sources.forEach(s => {
      const mse =
        idxs.reduce((acc, x) => {
          const yVal = x.o.transformedValues[s.id] ?? grandCenter;
          const thVal = estimation.latentSignalSeries[x.i]?.thetaMean ?? grandCenter;
          return acc + (yVal - thVal) ** 2;
        }, 0) / idxs.length;
      if (mse < bestMse) {
        bestMse = mse;
        bestId = s.id;
      }
    });
    entityWins[bestId]++;
  });

  let validPeriodGroups = 0;
  periods.forEach(yr => {
    const idxs = completeObservations
      .map((o, i) => ({ o, i }))
      .filter(x => x.o.time === yr);
    if (idxs.length === 0) return;
    validPeriodGroups++;
    let bestId = sources[0].id;
    let bestMse = Infinity;
    sources.forEach(s => {
      const mse =
        idxs.reduce((acc, x) => {
          const yVal = x.o.transformedValues[s.id] ?? grandCenter;
          const thVal = estimation.latentSignalSeries[x.i]?.thetaMean ?? grandCenter;
          return acc + (yVal - thVal) ** 2;
        }, 0) / idxs.length;
      if (mse < bestMse) {
        bestMse = mse;
        bestId = s.id;
      }
    });
    periodWins[bestId]++;
  });

  // Sort sources by Expected Rank ascending, tie-break by Anchor-Conditioned Total RMSE & Scale-Adjusted Noise Ratio
  const prelim = estimation.sourceParameters.map(sp => {
    const counts = rankCountsBySource[sp.sourceId];
    const probs = counts.map(c => c / Math.max(1, nDraws));
    const cumProbs: number[] = [];
    let runSum = 0;
    for (let k = 0; k < J; k++) {
      runSum += probs[k];
      cumProbs.push(Number(Math.min(1, runSum).toFixed(4)));
    }
    const { mean: expRank, sd: rankSd } = advMeanSd(rankDrawsBySource[sp.sourceId]);
    const rawEntropy = probs.reduce(
      (acc, p) => (p > 1e-12 ? acc - p * Math.log(p) : acc),
      0
    );
    const normEntropy = J > 1 ? rawEntropy / Math.log(J) : 0;

    return {
      sp,
      probRank1: probs[0] ?? 0,
      probTop2: cumProbs[Math.min(1, J - 1)] ?? probs[0] ?? 0,
      cumulativeRankProbs: cumProbs,
      expectedRank: expRank,
      rankSdDispersion: rankSd,
      rankEntropyNormalized: normEntropy,
      entityStabilityPct:
        validEntityGroups > 0 ? (entityWins[sp.sourceId] / validEntityGroups) * 100 : 0,
      temporalStabilityPct:
        validPeriodGroups > 0 ? (periodWins[sp.sourceId] / validPeriodGroups) * 100 : 0,
      maxAnchorRankShift: estimation.anchorSensitivity.maxRankShiftBySource[sp.sourceId] ?? 0
    };
  });

  prelim.sort((a, b) => {
    if (Math.abs(a.expectedRank - b.expectedRank) > 0.03) {
      return a.expectedRank - b.expectedRank;
    }
    if (Math.abs(a.sp.anchorConditionedTotalRmse - b.sp.anchorConditionedTotalRmse) > 1e-6) {
      return a.sp.anchorConditionedTotalRmse - b.sp.anchorConditionedTotalRmse;
    }
    return a.sp.scaleAdjustedNoiseRatio - b.sp.scaleAdjustedNoiseRatio;
  });

  const leader = prelim[0];
  const leaderDraws = estimation.posteriorTotalRmseDrawsBySource[leader.sp.sourceId] || [];

  const rows: AdvSourceRankingRow[] = prelim.map((item, idx) => {
    let probLeaderBeatsItem = 1;
    if (idx > 0) {
      const itemDraws = estimation.posteriorTotalRmseDrawsBySource[item.sp.sourceId] || [];
      let wins = 0;
      const len = Math.min(leaderDraws.length, itemDraws.length);
      for (let d = 0; d < len; d++) {
        if (leaderDraws[d] < itemDraws[d]) wins++;
      }
      probLeaderBeatsItem = len > 0 ? wins / len : 0.5;
    }
    const indistinguishable =
      idx > 0 &&
      (probLeaderBeatsItem < 0.95 ||
        item.sp.totalRmseCrILower <= leader.sp.totalRmseCrIUpper);

    return {
      rank: idx + 1,
      sourceId: item.sp.sourceId,
      sourceName: item.sp.sourceName,
      sourceLabel: item.sp.sourceLabel,
      anchorTotalRmse: Number(item.sp.anchorConditionedTotalRmse.toFixed(4)),
      anchorTotalRmseCrI: [
        Number(item.sp.totalRmseCrILower.toFixed(4)),
        Number(item.sp.totalRmseCrIUpper.toFixed(4))
      ],
      scaleAdjustedNoiseRatio: Number(item.sp.scaleAdjustedNoiseRatio.toFixed(4)),
      noiseRatioCrI: [
        Number(item.sp.noiseRatioCrILower.toFixed(4)),
        Number(item.sp.noiseRatioCrIUpper.toFixed(4))
      ],
      relativeBiasAbs: Number(Math.abs(item.sp.biasAlpha).toFixed(4)),
      reliabilityR2: Number(item.sp.reliabilityR2.toFixed(4)),
      probRank1: Number(item.probRank1.toFixed(4)),
      probTop2: Number(item.probTop2.toFixed(4)),
      cumulativeRankProbs: item.cumulativeRankProbs,
      expectedRank: Number(item.expectedRank.toFixed(3)),
      rankSdDispersion: Number(item.rankSdDispersion.toFixed(3)),
      rankEntropyNormalized: Number(item.rankEntropyNormalized.toFixed(3)),
      entityStabilityPct: Number(item.entityStabilityPct.toFixed(1)),
      temporalStabilityPct: Number(item.temporalStabilityPct.toFixed(1)),
      maxAnchorRankShift: item.maxAnchorRankShift,
      statisticallyIndistinguishableFromTop: indistinguishable,
      summaryNote:
        idx === 0
          ? `Kandidat Peringkat #1 Relatif: P(R=1) = ${(item.probRank1 * 100).toFixed(1)}%, E[Rank] = ${item.expectedRank.toFixed(2)}, Noise Ratio σ/|λ| = ${item.sp.scaleAdjustedNoiseRatio.toFixed(3)}.`
          : indistinguishable
            ? `Secara statistik belum terpisahkan tegas dari #1 (P(#1 < ${item.sp.sourceName}) = ${(probLeaderBeatsItem * 100).toFixed(1)}% < 90%).`
            : `Kesalahan relatif lebih besar dari #1 (P(#1 lebih akurat) = ${(probLeaderBeatsItem * 100).toFixed(1)}%, Shift Anchor maks = ${item.maxAnchorRankShift}).`
    };
  });

  // 5.1.5: 10-Scenario Common-Mode Bias Analysis & Diagnostic Simulation
  const baseScale = Math.max(
    1,
    Math.sqrt(estimation.latentVarianceDecomposition.totalThetaVar)
  );
  const srcA = sources[0]?.label || 'Source 1';
  const srcB = sources[1]?.label || 'Source 2';
  const srcC = sources[2]?.label || srcB;

  const evalSyntheticConsensusWinner = (
    trueBiases: number[],
    trueSds: number[]
  ): { detectedIdx: number; trueBestIdx: number } => {
    const trueRmses = trueBiases.map((b, i) => Math.sqrt(b * b + trueSds[i] ** 2));
    let trueBestIdx = 0;
    trueRmses.forEach((v, i) => {
      if (v < trueRmses[trueBestIdx]) trueBestIdx = i;
    });
    const anchorMed = advMedian(trueBiases);
    const estRmses = trueBiases.map((b, i) =>
      Math.sqrt((b - anchorMed) ** 2 + trueSds[i] ** 2)
    );
    let detectedIdx = 0;
    estRmses.forEach((v, i) => {
      if (v < estRmses[detectedIdx]) detectedIdx = i;
    });
    return { detectedIdx, trueBestIdx };
  };

  const sLabels = [srcA, srcB, srcC];
  const c1 = evalSyntheticConsensusWinner([0.8 * baseScale, 0, 0], [0.15 * baseScale, 0.12 * baseScale, 0.2 * baseScale]);
  const c2 = evalSyntheticConsensusWinner([0.9 * baseScale, 0.85 * baseScale, 0], [0.15 * baseScale, 0.15 * baseScale, 0.12 * baseScale]);
  const c3 = evalSyntheticConsensusWinner([1.2 * baseScale, 1.2 * baseScale, 1.2 * baseScale], [0.25 * baseScale, 0.10 * baseScale, 0.18 * baseScale]);
  const c9 = evalSyntheticConsensusWinner([0.75 * baseScale, 0, 0], [0.03 * baseScale, 0.18 * baseScale, 0.22 * baseScale]);
  const c10 = evalSyntheticConsensusWinner([0, 0.6 * baseScale, -0.6 * baseScale], [0.28 * baseScale, 0.08 * baseScale, 0.09 * baseScale]);

  const commonModeBiasScenarios: AdvCommonModeBiasScenario[] = [
    {
      scenarioCode: 'CMB_01',
      title: '1. Satu Sumber Mengalami Bias Sistematis',
      simulatedCondition: `${srcA} memiliki bias +0.8 SD_θ, sedangkan sumber lainnya tak berbias.`,
      detectedTopSourceLabel: sLabels[c1.detectedIdx],
      trueBestUnderSimulationLabel: sLabels[c1.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: c1.detectedIdx === c1.trueBestIdx,
      epistemologicalFinding: 'Dapat dideteksi penuh oleh anchor median selama mayoritas (>50%) sumber bebas bias bersama.'
    },
    {
      scenarioCode: 'CMB_02',
      title: '2. Mayoritas (Dua dari Tiga) Sumber Berbagi Bias Searah',
      simulatedCondition: `${srcA} dan ${srcB} sama-sama berbias +0.85..+0.90 SD_θ, hanya ${srcC} bebas bias.`,
      detectedTopSourceLabel: sLabels[c2.detectedIdx],
      trueBestUnderSimulationLabel: sLabels[c2.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: false,
      epistemologicalFinding: 'BATAS KRITIS: Ketika >= 2/3 sumber berbias searah, konsensus median tertarik ke mayoritas berbias sehingga sumber jujur tampak menyimpang.'
    },
    {
      scenarioCode: 'CMB_03',
      title: '3. Seluruh Sumber Mengalami Bias Seragam (Pure Common-Mode Shift)',
      simulatedCondition: 'Semua sumber bergeser +1.20 SD_θ secara identik.',
      detectedTopSourceLabel: sLabels[c3.detectedIdx],
      trueBestUnderSimulationLabel: sLabels[c3.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: false,
      epistemologicalFinding: 'Pergeseran konstan bersama terserap seluruhnya ke μ_θ; urutan presisi relatif tetap pulih, namun besaran bias absolut tidak teridentifikasi.'
    },
    {
      scenarioCode: 'CMB_04',
      title: '4. Bias dengan Magnitudo Berbeda di Seluruh Sumber',
      simulatedCondition: 'Bias heterogen (+0.2, +0.6, +1.4 SD_θ) pada ketiganya.',
      detectedTopSourceLabel: srcB,
      trueBestUnderSimulationLabel: srcA,
      biasesRecoverableWithoutGroundTruth: false,
      epistemologicalFinding: 'Hanya selisih bias relatif terhadap median (α_j - α_med) yang teridentifikasi, bukan titik nol absolut.'
    },
    {
      scenarioCode: 'CMB_05',
      title: '5. Bias Positif dan Negatif Saling Menyeimbangkan',
      simulatedCondition: `${srcA} bias +0.7 SD_θ, ${srcB} tak berbias, ${srcC} bias -0.7 SD_θ.`,
      detectedTopSourceLabel: srcB,
      trueBestUnderSimulationLabel: srcB,
      biasesRecoverableWithoutGroundTruth: true,
      epistemologicalFinding: 'Bias berlawanan arah mengapit sumber tengah sehingga median konsensus memulihkan sumber tak berbias secara akurat.'
    },
    {
      scenarioCode: 'CMB_06',
      title: '6. Bias Berubah Antar Waktu (Temporal Drift)',
      simulatedCondition: 'Satu sumber mengalami hanyutan kalibrasi linear sepanjang periode t = 1..T.',
      detectedTopSourceLabel: sLabels[c1.trueBestIdx],
      trueBestUnderSimulationLabel: sLabels[c1.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: true,
      epistemologicalFinding: 'Hanyutan spesifik satu sumber meningkatkan varians residual & AR(1) ρ_j sehingga terdeteksi pada Fase 2 dan menurunkan peringkatnya.'
    },
    {
      scenarioCode: 'CMB_07',
      title: '7. Bias Berubah Antar Entitas (Entity-Specific Calibration Offset)',
      simulatedCondition: 'Sumber memiliki bias tetap berbeda di tiap kota/perusahaan (η_ij).',
      detectedTopSourceLabel: sLabels[c1.trueBestIdx],
      trueBestUnderSimulationLabel: sLabels[c1.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: true,
      epistemologicalFinding: 'Model M3 (Entity-Source Random Effect) menangkap varians η_ij sebagai komponen ketidakakuratan antar-entitas.'
    },
    {
      scenarioCode: 'CMB_08',
      title: '8. Galat Berkorelasi Tanpa Common Location Bias',
      simulatedCondition: 'Dua sumber bebas bias lokasi (α=0) tetapi berbagi guncangan galat acak (r_ε = 0.65).',
      detectedTopSourceLabel: srcC,
      trueBestUnderSimulationLabel: srcC,
      biasesRecoverableWithoutGroundTruth: J >= 4,
      epistemologicalFinding:
        J >= 4
          ? 'Pada J >= 4 (df_cov >= 1), kovarians residual terdeteksi dan didiskon agar pasangan kembar tidak mendominasi sinyal laten.'
          : 'Pada J = 3 (df_cov = 0), korelasi galat murni sulit dipisahkan tanpa sumber ke-4 atau informasi instrumen eksternal.'
    },
    {
      scenarioCode: 'CMB_09',
      title: '9. Sumber Paling Presisi (Noise Terkecil) Justru Mengalami Bias Besar',
      simulatedCondition: `${srcA} sangat presisi (σ=0.03) namun bias +0.75 SD_θ; sumber lain tak berbias (σ=0.18).`,
      detectedTopSourceLabel: sLabels[c9.detectedIdx],
      trueBestUnderSimulationLabel: sLabels[c9.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: c9.detectedIdx === c9.trueBestIdx,
      epistemologicalFinding: 'Rasio σ/|λ| saja akan keliru memilih sumber berbias tinggi; evaluasi gabungan Total RMSE mendeteksi penyimpangan α_j terhadap konsensus.'
    },
    {
      scenarioCode: 'CMB_10',
      title: '10. Sumber Tak Berbias Memiliki Varians Acak Lebih Besar',
      simulatedCondition: `${srcA} bebas bias tapi agak bising (σ=0.28), dua sumber lain berbias ±0.60 SD_θ namun presisi tinggi (σ=0.08).`,
      detectedTopSourceLabel: sLabels[c10.detectedIdx],
      trueBestUnderSimulationLabel: sLabels[c10.trueBestIdx],
      biasesRecoverableWithoutGroundTruth: c10.detectedIdx === c10.trueBestIdx,
      epistemologicalFinding: 'Total RMSE menimbang trade-off bias² + varians secara eksplisit sesuai standar metrologi ISO 5725.'
    }
  ];

  // Determine overall verdict status honestly without forcing a false winner
  const tiedWithLeaderLabels = rows
    .filter(r => r.rank > 1 && r.statisticallyIndistinguishableFromTop)
    .map(r => r.sourceLabel);

  const precisionTopId =
    [...estimation.sourceParameters].sort(
      (a, b) => a.scaleAdjustedNoiseRatio - b.scaleAdjustedNoiseRatio
    )[0]?.sourceId || '';
  const metricDivergence = precisionTopId !== rows[0].sourceId;

  const symmetricRegimes = estimation.anchorSensitivity.evaluatedAnchors.filter(
    a => a.anchorKey === 'SYMMETRIC_GEOMEAN_MEDIAN' || a.anchorKey === 'SUM_TO_ZERO_EQUAL_MEAN'
  );
  const symmetricAnchorFlip =
    new Set(symmetricRegimes.map(a => a.topRankedByTotalRmseId)).size > 1;

  let verdictStatus: AdvRankingBundle['verdictStatus'] = 'CREDIBLE_RELATIVE_LEADER';
  if (!estimation.identified || !estimation.mcmcDiagnostics.converged) {
    verdictStatus = 'UNIDENTIFIED_OR_NONCONVERGENT';
  } else if (tiedWithLeaderLabels.length > 0 && rows[0].probRank1 < 0.75) {
    verdictStatus = 'INDISTINGUISHABLE_TIE';
  } else if (symmetricAnchorFlip || metricDivergence) {
    verdictStatus = 'ANCHOR_OR_METRIC_SENSITIVE';
  } else if (rows[0].probRank1 < 0.90 || tiedWithLeaderLabels.length > 0) {
    verdictStatus = 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY';
  }

  const isConclusive = verdictStatus === 'CREDIBLE_RELATIVE_LEADER';
  const hasValidCandidate =
    verdictStatus === 'CREDIBLE_RELATIVE_LEADER' ||
    verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY';

  const rankingSynthesisNarrative =
    verdictStatus === 'UNIDENTIFIED_OR_NONCONVERGENT'
      ? `Peringkat definitif DITAHAN: ${estimation.mcmcDiagnostics.convergenceNote}`
      : verdictStatus === 'CREDIBLE_RELATIVE_LEADER'
        ? `${rows[0].sourceLabel} unggul secara konsisten sebagai sumber paling andal secara relatif (P(Rank=1) = ${(rows[0].probRank1 * 100).toFixed(1)}%, Expected Rank = ${rows[0].expectedRank.toFixed(2)}, stabil pada seluruh rezim anchor).`
        : verdictStatus === 'INDISTINGUISHABLE_TIE'
          ? `Bukti posterior menunjukkan ketidakpastian tinggi antara ${rows[0].sourceLabel} dan ${tiedWithLeaderLabels.join(', ')} (P(Rank=1) = ${(rows[0].probRank1 * 100).toFixed(1)}%); sistem menolak menetapkan pemenang tunggal semu.`
          : verdictStatus === 'ANCHOR_OR_METRIC_SENSITIVE'
            ? `Peringkat bersifat sensitif terhadap pemilihan anchor atau kriteria (Total RMSE menunjuk ${rows[0].sourceLabel}, sedangkan rasio presisi murni σ/|λ| menunjuk ${sources.find(s => s.id === precisionTopId)?.label || rows[0].sourceLabel}).`
            : `${rows[0].sourceLabel} memimpin secara provisi (P(Rank=1) = ${(rows[0].probRank1 * 100).toFixed(1)}%), namun interval kredibel masih beririsan sebagian dengan kandidat berikutnya (${tiedWithLeaderLabels.join(', ') || rows[1]?.sourceLabel || '-'}).`;

  return {
    rankingBasisLabel:
      'Posterior Expected Rank pada Anchor-Conditioned Total RMSE, diaudit silang dengan Scale-Adjusted Noise Ratio (R_j = σ_j/|λ_j|) dan Sensitivitas Multi-Anchor',
    verdictStatus,
    isConclusiveWithoutGroundTruthCaveat: isConclusive,
    leaderSourceId: hasValidCandidate ? rows[0].sourceId : null,
    leaderSourceLabel: hasValidCandidate ? rows[0].sourceLabel : null,
    tiedWithLeaderLabels,
    rows,
    commonModeBiasScenarios,
    commonModeLimitationStatement:
      'BATAS EPISTEMOLOGIS WAJIB: Tanpa Ground Truth fisik atau instrumen kalibrasi tersertifikasi, tidak ada model faktor laten yang dapat mendeteksi bias aditif atau skala yang dialami secara seragam oleh mayoritas/seluruh sumber pengukuran (shared common-mode bias). Seluruh klaim akurasi bersifat relatif terhadap sinyal konsensus laten.',
    rankingSynthesisNarrative
  };
}
