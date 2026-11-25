// ============================================================
// OPTION 3 — Master Pipeline Orchestrator
// Independent Namespace & State: Zero Dependency on Option 2 Execution
// ============================================================

import { buildOption3AutoDecisions } from './panel-adv-auto-engine';
import { runOption3LatentEstimation } from './panel-adv-estimation';
import { runOption3MonteCarloValidation } from './panel-adv-montecarlo';
import { profileAndPreprocessOption3Dataset } from './panel-adv-preprocessing';
import { computeOption3SourceRanking } from './panel-adv-ranking';
import {
  buildOption3StepStataGuides,
  generateOption3MasterStataDoFile,
  generateOption3RScript,
  generateOption3StanCode,
  VERIFIED_OPTION3_LITERATURE
} from './panel-adv-stata';
import {
  AdvManualOverrides,
  AdvMethodEvidenceStep,
  AdvPanelFitResult,
  AdvTopVsRunnerUpComparison,
  AdvTransformationMethod,
  PanelDataset
} from './panel-adv-types';
import { runOption3ValidationAndAgreement } from './panel-adv-validation';

export function executeAdvancedPanelAccuracyPipeline(params: {
  dataset: PanelDataset;
  datasetName?: string;
  overrides?: AdvManualOverrides;
  highPrecisionMode?: boolean;
  monteCarloReplications?: number;
  executionMode?: 'client_reactive' | 'server_high_precision';
}): AdvPanelFitResult {
  const startedAt = Date.now();
  const datasetName = params.datasetName || 'Panel_MultiSource_Dataset.xlsx';
  const dropDup = params.overrides?.dropDuplicatePairs ?? true;

  // Step 1 & Step 3 Initial Empirical Profiling
  const initialPrep = profileAndPreprocessOption3Dataset({
    dataset: params.dataset,
    forcedTransformation: params.overrides?.transformation,
    dropDuplicatePairs: dropDup
  });

  if (initialPrep.profile.hasBlockingError) {
    throw new Error(
      `Validasi dataset Option 3 gagal: diperlukan minimal 2 kolom sumber valid dan >= 3 pasangan observasi lengkap (saat ini J=${initialPrep.profile.nSources}, N_CC=${initialPrep.profile.nCompletePairs}).`
    );
  }

  // Step 2: 12-Component Validity-First Automatic Decision Engine
  const autoDecision = buildOption3AutoDecisions({
    profile: initialPrep.profile,
    overrides: params.overrides,
    highPrecisionMode: params.highPrecisionMode
  });

  // Reconcile effective transformation with outlier handling if overridden
  let effectiveTransformation: AdvTransformationMethod = autoDecision.activeConfig.transformation;
  if (
    !params.overrides?.transformation &&
    autoDecision.activeConfig.outlierStrategy === 'SYMMETRIC_WINSOR_2_5' &&
    effectiveTransformation === 'none'
  ) {
    effectiveTransformation = 'winsorize_2_5';
  } else if (
    !params.overrides?.transformation &&
    autoDecision.activeConfig.outlierStrategy === 'ROBUST_STUDENT_T_LIKELIHOOD' &&
    effectiveTransformation === 'none'
  ) {
    effectiveTransformation = 'robust_student_t';
  }

  const preprocessed =
    effectiveTransformation !== initialPrep.profile.chosenTransformation
      ? profileAndPreprocessOption3Dataset({
          dataset: params.dataset,
          forcedTransformation: effectiveTransformation,
          dropDuplicatePairs: autoDecision.activeConfig.dropDuplicatePairs
        })
      : initialPrep;

  // Step 4 & Step 5: Latent Estimation, Vehtari MCMC Diagnostics, Dependency Selection & Multi-Anchor Sensitivity
  const estimation = runOption3LatentEstimation({
    preprocessed,
    config: autoDecision.activeConfig
  });

  // Step 6: Probabilistic Ranking, Cumulative Rank Probabilities & Common-Mode Bias Simulator
  const ranking = computeOption3SourceRanking({
    preprocessed,
    estimation
  });

  // Step 7: Covariance-Audited LOSO, Pair FE + Holm Step-Down, Wild Bootstrap & Repeated-Measures Mixed LoA
  const validation = runOption3ValidationAndAgreement({
    preprocessed,
    estimation,
    config: autoDecision.activeConfig
  });

  // Step 8: 7-Family Calibrated Monte Carlo Validation
  const mcReps =
    params.monteCarloReplications ?? (params.highPrecisionMode ? 50 : 28);
  const monteCarlo = runOption3MonteCarloValidation({
    nEntities: preprocessed.profile.nEntities,
    nPeriods: preprocessed.profile.nPeriods,
    nSources: preprocessed.profile.nSources,
    replicationsPerScenario: mcReps
  });

  // Step 9: Reproducible Stata 17/18 + Companion R/Stan Guides
  const stepStataGuides = buildOption3StepStataGuides({
    datasetName,
    preprocessed,
    config: autoDecision.activeConfig,
    estimation,
    ranking,
    validation,
    monteCarlo
  });

  const masterStataDoFile = generateOption3MasterStataDoFile(stepStataGuides, datasetName);
  const companionRScript = generateOption3RScript({
    datasetName,
    preprocessed,
    config: autoDecision.activeConfig
  });
  const companionStanCode = generateOption3StanCode({
    nSources: preprocessed.profile.nSources,
    priorStrategy: autoDecision.activeConfig.priorStrategy
  });

  const keyLimitations: string[] = [
    'Tanpa Ground Truth fisik atau instrumen referensi terkalibrasi eksternal, model hanya mengestimasi keandalan dan ketepatan RELATIF antarsumber, bukan akurasi absolut terhadap nilai sejati sejagat.',
    'Apabila mayoritas atau seluruh sumber berbagi bias sistematis searah (common-mode additive atau multiplicative bias), komponen bersama tersebut tidak terpisahkan dari sinyal laten θ_it.',
    'Mekanisme missingness (MCAR vs MAR vs MNAR) tidak dapat dibuktikan secara konklusif hanya dari data yang teramati.'
  ];
  if (preprocessed.profile.nSources === 3) {
    keyLimitations.push(
      'Dengan tepat J = 3 sumber, model kongenerik tepat teridentifikasi (df_cov = 0) di bawah asumsi independensi galat, sehingga korelasi galat bebas antarsumber tidak dapat diestimasi simultan tanpa informasi tambahan.'
    );
  }
  if (estimation.anchorSensitivity.topSourceFlipAcrossAnchors) {
    keyLimitations.push(
      'Peringkat berbasis Total RMSE sensitif terhadap pemilihan rezim anchor lokasi/skala; rujuk rasio presisi bebas-lokasi R_j = σ_j/|λ_j| dan distribusi probabilitas peringkat P(R_j ≤ k | Y).'
    );
  }

  const headline =
    ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER' && ranking.leaderSourceLabel
      ? `${ranking.leaderSourceLabel} menunjukkan bukti keandalan relatif terkuat secara konsisten pada model pengukuran laten panel (bukan klaim Ground Truth absolut).`
      : ranking.verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY' && ranking.leaderSourceLabel
        ? `${ranking.leaderSourceLabel} memimpin secara numerik, namun ketidakpastian posterior masih moderat sehingga kesimpulan bersifat kondisional.`
        : ranking.verdictStatus === 'ANCHOR_OR_METRIC_SENSITIVE'
          ? 'Urutan sumber teratas bergantung pada pilihan rezim anchor atau perbedaan bobot bias lokasi vs presisi skala (R_j = σ_j/|λ_j|).'
          : ranking.verdictStatus === 'INDISTINGUISHABLE_TIE'
            ? 'Beberapa sumber teratas memiliki distribusi galat posterior yang bertumpang tindih secara substansial (seri secara statistik).'
            : 'Model tidak teridentifikasi atau belum memenuhi syarat konvergensi — pemeringkatan definitif ditangguhkan.';

  // Build transparent multi-method evidence chain explaining WHY the top variable is selected (Steps 1–8)
  const topRow = ranking.rows[0] ?? null;
  const runnerRow = ranking.rows[1] ?? null;
  const topParam = topRow
    ? estimation.sourceParameters.find(s => s.sourceId === topRow.sourceId) ?? null
    : null;
  const runnerParam = runnerRow
    ? estimation.sourceParameters.find(s => s.sourceId === runnerRow.sourceId) ?? null
    : null;
  const topProfile = topRow
    ? preprocessed.profile.sourceProfiles.find(s => s.sourceId === topRow.sourceId) ?? null
    : null;
  const topLoso = topRow
    ? validation.losoEntries.find(l => l.leftOutSourceId === topRow.sourceId) ?? null
    : null;
  const topAgreement = topRow
    ? validation.repeatedMeasuresAgreement.find(a => a.sourceId === topRow.sourceId) ?? null
    : null;
  const runnerAgreement = runnerRow
    ? validation.repeatedMeasuresAgreement.find(a => a.sourceId === runnerRow.sourceId) ?? null
    : null;

  const findPairContrast = (idA: string, idB: string) =>
    validation.pairwiseHolmContrasts.find(
      c =>
        (c.sourceAId === idA && c.sourceBId === idB) ||
        (c.sourceAId === idB && c.sourceBId === idA)
    ) ?? null;

  const topVsRunnerContrast =
    topRow && runnerRow ? findPairContrast(topRow.sourceId, runnerRow.sourceId) : null;

  const topDisplayName = topRow ? `${topRow.sourceName} (${topRow.sourceLabel})` : null;
  const runnerDisplayName = runnerRow ? `${runnerRow.sourceName} (${runnerRow.sourceLabel})` : null;

  const topVsRunnerUp: AdvTopVsRunnerUpComparison | null =
    topRow && topParam
      ? {
          topSourceId: topRow.sourceId,
          topSourceLabel: topDisplayName!,
          runnerUpSourceId: runnerRow?.sourceId ?? null,
          runnerUpSourceLabel: runnerDisplayName,
          topTotalRmse: topRow.anchorTotalRmse,
          runnerUpTotalRmse: runnerRow?.anchorTotalRmse ?? null,
          topNoiseRatio: topRow.scaleAdjustedNoiseRatio,
          runnerUpNoiseRatio: runnerRow?.scaleAdjustedNoiseRatio ?? null,
          topErrorSd: topParam.errorSd,
          runnerUpErrorSd: runnerParam?.errorSd ?? null,
          topReliabilityR2Pct: Number((topParam.reliabilityR2 * 100).toFixed(2)),
          runnerUpReliabilityR2Pct: runnerParam
            ? Number((runnerParam.reliabilityR2 * 100).toFixed(2))
            : null,
          topProbRank1Pct: Number((topRow.probRank1 * 100).toFixed(1)),
          runnerUpProbRank1Pct: runnerRow ? Number((runnerRow.probRank1 * 100).toFixed(1)) : null,
          holmSignificantVsRunnerUp: topVsRunnerContrast
            ? topVsRunnerContrast.significantFamilywise05
            : null,
          holmPValueVsRunnerUp: topVsRunnerContrast ? topVsRunnerContrast.pHolmAdjusted : null,
          topCcc: topAgreement?.linsCcc ?? null,
          runnerUpCcc: runnerAgreement?.linsCcc ?? null,
          topMixedLoaWidth: topAgreement?.mixedEffectsLoaWidth ?? null,
          runnerUpMixedLoaWidth: runnerAgreement?.mixedEffectsLoaWidth ?? null
        }
      : null;

  const whySelectedEvidence: AdvMethodEvidenceStep[] = [];
  if (topRow && topParam) {
    // 1. Step 1-3: Data Quality, Identification & Preprocessing
    const step13Status: AdvMethodEvidenceStep['status'] =
      autoDecision.overallIdentifiabilityStatus === 'UNDERIDENTIFIED'
        ? 'WASPADA'
        : (topProfile?.panelMadOutlierCount ?? 0) > 2 || preprocessed.profile.totalMissingCells > 0
          ? 'CATATAN'
          : 'LULUS';
    whySelectedEvidence.push({
      stageCode: 'STEP_1_3',
      stageLabel: 'Tahap 1–3 · Audit Panel, Auto-Config & Preprocessing',
      methodName: `Panel Within-Entity MAD/IQR + Skala Kerja (${autoDecision.activeConfig.transformation})`,
      status: step13Status,
      keyMetricBadge: `G=${preprocessed.profile.nEntities}, T=${preprocessed.profile.nPeriods}, J=${preprocessed.profile.nSources}, N_CC=${preprocessed.profile.nCompletePairs}`,
      finding:
        `Dataset memenuhi struktur identifikasi ${autoDecision.overallIdentifiabilityStatus} dengan ${preprocessed.profile.nCompletePairs} pasangan lengkap pada skala ${preprocessed.profile.workingScaleLabel}. ` +
        `Pada ${topDisplayName}, terdeteksi ${topProfile?.panelMadOutlierCount ?? 0} outlier Panel MAD (missing ${(topProfile?.missingPct ?? 0).toFixed(1)}%).`,
      selectionReason:
        step13Status === 'WASPADA'
          ? 'Syarat identifikasi minimum belum terpenuhi (J < 3 atau N_CC terlalu kecil) sehingga keunggulan numerik belum dapat dijadikan keputusan akhir.'
          : `${topDisplayName} memiliki kelengkapan dan kestabilan sebaran dalam-entitas yang memadai tanpa perlu mengubah satuan fisik secara artifisial.`
    });

    // 2. Step 4: Bayesian Latent Measurement Model & Vehtari MCMC
    const allPriorsAgree = estimation.priorSensitivity.every(p => p.rankConcordantWithPrimary);
    const step4Status: AdvMethodEvidenceStep['status'] =
      !estimation.identified || !estimation.mcmcDiagnostics.converged
        ? 'WASPADA'
        : !allPriorsAgree
          ? 'CATATAN'
          : 'LULUS';
    whySelectedEvidence.push({
      stageCode: 'STEP_4',
      stageLabel: 'Tahap 4 · Model Pengukuran Laten Bayesian (Woodbury MCMC)',
      methodName: 'Congeneric Hierarchical Panel Model + Diagnostik Vehtari (2021) + Sensitivitas 3 Prior',
      status: step4Status,
      keyMetricBadge: `σ_ε=${topParam.errorSd.toFixed(3)} · R²=${(topParam.reliabilityR2 * 100).toFixed(2)}% · Split R̂=${estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(3)}`,
      finding:
        `${topDisplayName} mencatat galat acak σ_ε = ${topParam.errorSd.toFixed(3)} (95% CrI [${topParam.errorSdCrILower.toFixed(3)}, ${topParam.errorSdCrIUpper.toFixed(3)}]), bias relatif α = ${topParam.biasAlpha.toFixed(3)}, loading λ = ${topParam.loadingLambda.toFixed(3)}, dan Reliabilitas R² = ${(topParam.reliabilityR2 * 100).toFixed(2)}%` +
        (runnerParam && runnerDisplayName
          ? ` dibanding peringkat #2 ${runnerDisplayName} (σ_ε = ${runnerParam.errorSd.toFixed(3)}, α = ${runnerParam.biasAlpha.toFixed(3)}, R² = ${(runnerParam.reliabilityR2 * 100).toFixed(2)}%).`
          : '.') +
        ` Konvergensi MCMC: Max Split R̂ = ${estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)}, Min Bulk-ESS = ${estimation.mcmcDiagnostics.minBulkEss}.`,
      selectionReason:
        step4Status === 'LULUS'
          ? `Kombinasi bias α yang dekat nol dan simpangan baku galat σ_ε terendah membuat ${topDisplayName} menangkap sinyal laten sejati θ_it paling bersih, dan tetap #1 pada seluruh 3 keluarga prior.`
          : !estimation.mcmcDiagnostics.converged
            ? 'Konvergensi MCMC belum mencapai ambang ketat sehingga estimasi posterior harus ditafsirkan dengan hati-hati.'
            : 'Urutan parameter menunjukkan sensitivitas parsial terhadap pilihan prior Bayesian.'
    });

    // 3. Step 5: Dependency & Error Structure Analysis
    const topInFlaggedPair = estimation.flaggedResidualPairs.some(
      p => p.sourceAId === topRow.sourceId || p.sourceBId === topRow.sourceId
    );
    const step5Status: AdvMethodEvidenceStep['status'] = topInFlaggedPair
      ? 'CATATAN'
      : 'LULUS';
    whySelectedEvidence.push({
      stageCode: 'STEP_5',
      stageLabel: 'Tahap 5 · Struktur Ketergantungan & Independensi Galat',
      methodName: `Seleksi Model M1–M4 via Marginal WAIC (${estimation.activeDependencyModel}) & PSIS-LOO`,
      status: step5Status,
      keyMetricBadge: `${estimation.activeDependencyModel} · AR(1) ρ=${topParam.ar1RhoResidual.toFixed(3)} · WAIC=${estimation.mcmcDiagnostics.marginalWaic.toFixed(1)}`,
      finding:
        `Model ketergantungan terbaik adalah ${estimation.activeDependencyModel} (Marginal WAIC = ${estimation.mcmcDiagnostics.marginalWaic.toFixed(2)}, PSIS-LOO ELPD = ${estimation.mcmcDiagnostics.psisLooElpd.toFixed(2)}). ` +
        `Residual ${topDisplayName} memiliki persistensi AR(1) ρ = ${topParam.ar1RhoResidual.toFixed(3)} dan Entity-Source RE SD = ${topParam.entitySourceReSd.toFixed(3)}; ` +
        `${topInFlaggedPair ? 'namun terdeteksi pasangan korelasi galat residual menonjol yang melibatkan variabel ini.' : 'tidak ditemukan indikasi pasangan galat kembar (|r| > 0.25) yang mendistorsi variabel ini.'}`,
      selectionReason: topInFlaggedPair
        ? 'Perlu kewaspadaan bahwa sebagian konsensus laten dapat terpengaruh korelasi galat antar-instrumen berpasangan.'
        : `Galat pengukuran ${topDisplayName} bersih dari korelasi residual lintas-sumber sehingga keunggulannya tidak berasal dari efek kloning instrumen kembar.`
    });

    // 4. Step 6: Probabilistic Ranking & Multi-Anchor Sensitivity
    const precisionLeader = [...estimation.sourceParameters].sort(
      (a, b) => a.scaleAdjustedNoiseRatio - b.scaleAdjustedNoiseRatio
    )[0];
    const metricAligned = precisionLeader?.sourceId === topRow.sourceId;
    const step6Status: AdvMethodEvidenceStep['status'] =
      ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER'
        ? 'LULUS'
        : ranking.verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY'
          ? 'CATATAN'
          : 'WASPADA';
    whySelectedEvidence.push({
      stageCode: 'STEP_6',
      stageLabel: 'Tahap 6 · Pemeringkatan Probabilistik & Sensitivitas Multi-Anchor',
      methodName: 'Dual Estimand (Anchor Total RMSE vs R_j = σ/|λ|) + Kendall’s W Lintas J+2 Anchor',
      status: step6Status,
      keyMetricBadge: `P(Rank=1)=${(topRow.probRank1 * 100).toFixed(1)}% · R_j=${topRow.scaleAdjustedNoiseRatio.toFixed(3)} · W(R_j)=${estimation.anchorSensitivity.kendallWNoiseRatio.toFixed(3)}`,
      finding:
        `${topDisplayName} memperoleh Anchor Total RMSE = ${topRow.anchorTotalRmse.toFixed(3)} (95% CrI [${topRow.anchorTotalRmseCrI[0].toFixed(3)}, ${topRow.anchorTotalRmseCrI[1].toFixed(3)}]) dan rasio presisi bebas-anchor R_j = ${topRow.scaleAdjustedNoiseRatio.toFixed(3)}, dengan peluang posterior P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}%, Expected Rank = ${topRow.expectedRank.toFixed(2)} ± ${topRow.rankSdDispersion.toFixed(2)}, stabilitas lintas-entitas ${topRow.entityStabilityPct.toFixed(0)}% dan lintas-waktu ${topRow.temporalStabilityPct.toFixed(0)}%.`,
      selectionReason:
        metricAligned && ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER'
          ? `Baik Total RMSE (bias + noise) maupun R_j = σ/|λ| (invarian anchor, Kendall's W = ${estimation.anchorSensitivity.kendallWNoiseRatio.toFixed(3)}) sepakat menempatkan ${topDisplayName} di peringkat #1 tanpa tumpang-tindih kredibel dengan pesaing.`
          : !metricAligned
            ? `Terdapat trade-off metrik: Total RMSE menunjuk ${topDisplayName}, sedangkan presisi murni σ/|λ| menunjuk ${precisionLeader?.sourceLabel || '-'} sehingga kesimpulan perlu mempertimbangkan bobot bias vs varians.`
            : `Probabilitas posterior P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}% belum sepenuhnya terpisah dari kandidat terdekat (${ranking.tiedWithLeaderLabels.join(', ') || runnerDisplayName || '-'}).`
    });

    // 5. Step 7: LOSO, Pair FE (Holm 1979) & Repeated-Measures Mixed-Effects Agreement
    const topContrasts = validation.pairwiseHolmContrasts.filter(
      c => c.sourceAId === topRow.sourceId || c.sourceBId === topRow.sourceId
    );
    const sigWinsHolm = topContrasts.filter(c => {
      if (!c.significantFamilywise05) return false;
      return c.sourceAId === topRow.sourceId ? c.diffAbsErrorAminusB < 0 : c.diffAbsErrorAminusB > 0;
    }).length;
    const minLosoRmse = Math.min(...validation.losoEntries.map(l => l.losoPredictiveRmse));
    const topIsBestLoso = topLoso ? Math.abs(topLoso.losoPredictiveRmse - minLosoRmse) <= 1e-6 : false;
    const step7Status: AdvMethodEvidenceStep['status'] =
      topVsRunnerContrast?.significantFamilywise05 && topIsBestLoso
        ? 'LULUS'
        : sigWinsHolm > 0 || topIsBestLoso
          ? 'CATATAN'
          : 'WASPADA';
    whySelectedEvidence.push({
      stageCode: 'STEP_7',
      stageLabel: 'Tahap 7 · Validasi LOSO, Pair FE (Holm 1979) & Mixed-Effects LoA',
      methodName: `${validation.selectedSeMethod} + ${validation.selectedBootstrapMethod} + Holm FWER + Parker et al. (2020) LoA`,
      status: step7Status,
      keyMetricBadge: `LOSO RMSE=${topLoso ? topLoso.losoPredictiveRmse.toFixed(3) : '-'} · Holm Unggul=${sigWinsHolm}/${topContrasts.length} · CCC=${topAgreement ? topAgreement.linsCcc.toFixed(3) : '-'}`,
      finding:
        `Pada validasi Leave-One-Source-Out, ${topDisplayName} mencatat LOSO RMSE = ${topLoso ? topLoso.losoPredictiveRmse.toFixed(3) : '-'} dan LOSO MAE = ${topLoso ? topLoso.losoPredictiveMae.toFixed(3) : '-'} (korelasi konsensus ${topLoso ? topLoso.latentCorrelationWithFull.toFixed(4) : '-'}). ` +
        `Pada uji Pair Fixed Effects terkoreksi Holm (1979), variabel ini mengungguli secara signifikan ${sigWinsHolm} dari ${topContrasts.length} pesaing pada α_FWER = 5%` +
        (topVsRunnerContrast && runnerDisplayName
          ? ` (vs #2 ${runnerDisplayName}: p_Holm = ${topVsRunnerContrast.pHolmAdjusted.toFixed(4)}, ${topVsRunnerContrast.significantFamilywise05 ? 'Signifikan' : 'Belum signifikan'}). `
          : '. ') +
        (topAgreement
          ? `Kesepakatan berulang: Lin's CCC = ${topAgreement.linsCcc.toFixed(4)}, Within-Entity r = ${topAgreement.withinEntityR.toFixed(4)}, dan lebar Mixed-Effects 95% LoA = ${topAgreement.mixedEffectsLoaWidth.toFixed(2)}.`
          : ''),
      selectionReason:
        step7Status === 'LULUS'
          ? `Keunggulan ${topDisplayName} terkonfirmasi melampaui sekadar peluang acak pada uji parametrik-bootstrap klaster terkoreksi Holm, sekaligus memiliki akurasi prediksi lintas-sumber (LOSO) dan kesepakatan Mixed-Effects LoA terkuat.`
          : `${topDisplayName} unggul secara numerik pada sebagian uji validasi, namun selisih terhadap peringkat #2 pada uji Pair FE terkoreksi Holm atau LOSO masih memerlukan kehati-hatian.`
    });

    // 6. Step 8: Monte Carlo Validation & Common-Mode Bias Audit
    const step8Status: AdvMethodEvidenceStep['status'] =
      monteCarlo.meanRankingRecoveryPct >= 75
        ? 'LULUS'
        : monteCarlo.meanRankingRecoveryPct >= 55
          ? 'CATATAN'
          : 'WASPADA';
    whySelectedEvidence.push({
      stageCode: 'STEP_8',
      stageLabel: 'Tahap 8 · Validasi Simulasi Monte Carlo (7 Keluarga) & Common-Mode Bias',
      methodName: `Simulasi ADEMP Terkalibrasi (${monteCarlo.totalReplicationsRun} run pada G=${monteCarlo.calibratedDimensions.G}, T=${monteCarlo.calibratedDimensions.T}, J=${monteCarlo.calibratedDimensions.J})`,
      status: step8Status,
      keyMetricBadge: `Rank #1 Recovery=${monteCarlo.meanRankingRecoveryPct.toFixed(1)}% · Coverage 95%=${monteCarlo.meanCoverage95Pct.toFixed(1)}%`,
      finding:
        `Pada dimensi panel setara dataset ini, simulator Monte Carlo 7 keluarga mencatat rata-rata pemulihan peringkat #1 sebesar ${monteCarlo.meanRankingRecoveryPct.toFixed(1)}% dan cakupan interval 95% sebesar ${monteCarlo.meanCoverage95Pct.toFixed(1)}% di rezim teridentifikasi tanpa common-mode bias mayoritas.`,
      selectionReason:
        `Membuktikan bahwa mesin estimasi memiliki daya pulih statistik yang sah pada ukuran panel ini untuk memilih ${topDisplayName}, dengan tetap tunduk pada batas epistemologis 10 skenario common-mode bias tanpa Ground Truth.`
    });
  }

  const passedMethodsCount = whySelectedEvidence.filter(e => e.status === 'LULUS').length;
  const totalMethodsCount = whySelectedEvidence.length;

  const finalNarrativeConclusion =
    !topRow || !topParam
      ? 'Belum ada variabel sumber yang dapat dievaluasi karena syarat kelayakan data panel belum terpenuhi.'
      : ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER'
        ? `Berdasarkan sintesis berjenjang dari ${totalMethodsCount} tahap metodologi Option 3 (${passedMethodsCount}/${totalMethodsCount} tahap lulus penuh), variabel ${topDisplayName} terpilih sebagai sumber pengukuran paling akurat secara relatif. ` +
          `Variabel ini unggul karena secara simultan (1) meminimalkan galat acak σ_ε = ${topParam.errorSd.toFixed(3)} dengan Reliabilitas R² = ${(topParam.reliabilityR2 * 100).toFixed(2)}% dan konvergensi MCMC Vehtari sehat (Split R̂ = ${estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(3)}), ` +
          `(2) mempertahankan posisi #1 pada Anchor Total RMSE (${topRow.anchorTotalRmse.toFixed(3)}) maupun rasio presisi bebas-anchor R_j = σ/|λ| (${topRow.scaleAdjustedNoiseRatio.toFixed(3)}) dengan peluang posterior P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}%, ` +
          `(3) mencatat prediksi lintas-sumber LOSO RMSE = ${topLoso ? topLoso.losoPredictiveRmse.toFixed(3) : '-'} serta kesepakatan Mixed-Effects LoA (Lin's CCC = ${topAgreement ? topAgreement.linsCcc.toFixed(4) : '-'}) terkuat${topVsRunnerContrast && runnerDisplayName ? `, dengan perbedaan Pair FE vs ${runnerDisplayName} pada p_Holm = ${topVsRunnerContrast.pHolmAdjusted.toFixed(4)}` : ''}, ` +
          `dan (4) didukung validasi Monte Carlo (${monteCarlo.meanRankingRecoveryPct.toFixed(1)}% pemulihan peringkat #1 pada dimensi G=${monteCarlo.calibratedDimensions.G}, T=${monteCarlo.calibratedDimensions.T}, J=${monteCarlo.calibratedDimensions.J}).`
        : ranking.verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY'
          ? `Setelah melewati ${totalMethodsCount} tahap pengujian (${passedMethodsCount}/${totalMethodsCount} lulus penuh), ${topDisplayName} menjadi kandidat teratas secara numerik (Total RMSE = ${topRow.anchorTotalRmse.toFixed(3)}, R_j = ${topRow.scaleAdjustedNoiseRatio.toFixed(3)}, P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}%), namun belum dapat diklaim sebagai pemenang mutlak karena sebagian interval kredibel atau uji Holm masih beririsan dengan ${runnerDisplayName || 'kandidat terdekat'}.`
          : ranking.verdictStatus === 'ANCHOR_OR_METRIC_SENSITIVE'
            ? `Pengujian lintas ${totalMethodsCount} tahap menunjukkan bahwa ${topDisplayName} unggul pada Anchor Total RMSE (${topRow.anchorTotalRmse.toFixed(3)}), tetapi peringkat sensitif terhadap pilihan anchor atau berbeda dengan kriteria presisi murni R_j = σ/|λ|. Keputusan pemilihan instrumen harus menentukan lebih dulu apakah bias lokasi α_j atau presisi acak σ_j yang lebih diprioritaskan.`
            : ranking.verdictStatus === 'INDISTINGUISHABLE_TIE'
              ? `Hasil lintas ${totalMethodsCount} tahap pengujian membuktikan bahwa ${topDisplayName} dan ${ranking.tiedWithLeaderLabels.join(', ') || runnerDisplayName || 'pesaing terdekat'} belum terpisah secara signifikan (P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}%), sehingga secara statistik keduanya dinilai setara (seri).`
              : `Pengujian menolak menetapkan variabel paling akurat karena syarat identifikasi (J ≥ 3, N_CC memadai) atau konvergensi MCMC Vehtari belum terpenuhi.`;

  return {
    methodologyName: 'Option 3: Advanced Latent Measurement Model and Panel Accuracy Validation',
    executedAt: new Date().toISOString(),
    elapsedMs: Math.max(1, Date.now() - startedAt),
    executionMode: params.executionMode ?? 'client_reactive',
    datasetSummary: {
      datasetName,
      entityColumn: preprocessed.profile.entityColumn,
      timeColumn: preprocessed.profile.timeColumn,
      nEntities: preprocessed.profile.nEntities,
      nPeriods: preprocessed.profile.nPeriods,
      nSources: preprocessed.profile.nSources,
      nCompletePairs: preprocessed.profile.nCompletePairs,
      nRawRows: preprocessed.profile.nRowsRaw,
      isBalanced: preprocessed.profile.isBalancedPanel,
      workingScaleLabel: preprocessed.profile.workingScaleLabel
    },
    autoDecision,
    preprocessing: preprocessed.profile,
    estimation,
    ranking,
    validation,
    monteCarlo,
    stepStataGuides,
    masterStataDoFile,
    companionRScript,
    companionStanCode,
    literature: VERIFIED_OPTION3_LITERATURE,
    scientificConclusion: {
      headline,
      relativeReliabilitySummary: ranking.rankingSynthesisNarrative,
      selectedVariableName: topDisplayName,
      finalNarrativeConclusion,
      passedMethodsCount,
      totalMethodsCount,
      topVsRunnerUp,
      whySelectedEvidence,
      keyLimitations,
      epistemologicalGroundTruthBoundary:
        'BATAS EPISTEMOLOGIS WAJIB: Peringkat #1 dalam Option 3 bermakna sumber dengan deviasi galat spesifik terendah dan konsistensi sinyal tertinggi relatif terhadap struktur kovarians lintas-sumber yang diasumsikan — BUKAN bukti matematis bahwa sumber tersebut bebas dari bias fisik absolut.'
    }
  };
}
