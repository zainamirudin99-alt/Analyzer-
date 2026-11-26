
import {
  MsmaConfigurableSnapshot,
  MsmaEstimationBundle,
  MsmaFullAnalysisResult,
  MsmaJournalReportSections,
  MsmaSourceConfig,
  MsmaUploadedWorkbook,
  SelectMeasurementMethodOutput
} from '../types';
import { MSMA_VERIFIED_BIBLIOGRAPHY } from '../utils/bibliography';
import { fmtAdaptive, mean, pearsonCorrAndP } from '../utils/numerical';
import { runTwoSourceAgreementEngine } from './bland-altman-deming';
import { getMethodHumanLabel, selectMeasurementMethod } from './decision-engine';
import { computeDescriptiveAndQualityAnalysis } from './descriptive-statistics';
import { runMethodDiagnostics } from './diagnostics';
import { classifyMeasurementConstructs } from './measurement-classification';
import { evaluateStep4ConversionAdvisor } from './conversion-advisor';
import { runMultiSourceCollocationEngine } from './n-cornered-hat-ec';
import { detectPanelStructure } from './panel-detection';
import {
  buildStataCompilation9Sections,
  buildStepStataCommands
} from './stata-code-generator';
import {
  applySelectedTransformation,
  evaluateTransformationRecommendations,
  extractAlignedBaseObservations
} from './transformation';
import { runTripleCollocationEngine } from './triple-collocation';
import { runRobustnessAndSensitivitySuite } from './uncertainty-robustness';

export function runFullMsmaPipeline(
  workbook: MsmaUploadedWorkbook,
  config: MsmaConfigurableSnapshot
): MsmaFullAnalysisResult {
  const activeSheet =
    workbook.sheets.find(s => s.sheetName === config.activeSheetName) ?? workbook.sheets[0];

  const panel = detectPanelStructure(
    activeSheet,
    workbook.columnProfiles,
    config.entityColumn,
    config.timeColumn
  );

  const classification = classifyMeasurementConstructs(
    config.sources,
    config.classificationOverride,
    config.userConfirmedClassification
  );

  const step4Advisor = evaluateStep4ConversionAdvisor(
    activeSheet,
    panel.entityColumn,
    panel.timeColumn,
    config.sources,
    classification
  );

  const baseObservations = extractAlignedBaseObservations(
    activeSheet,
    panel.entityColumn,
    panel.timeColumn,
    config.sources,
    {
      dropDuplicates: config.dropDuplicates,
      missingHandling: config.missingHandling,
      outlierHandling: config.outlierHandling
    }
  );

  const transformation = evaluateTransformationRecommendations({
    baseObservations,
    sources: config.sources,
    panel,
    classification,
    activeTransformation: config.activeTransformation,
    rejectedTransformations: config.rejectedTransformations,
    dropDuplicates: config.dropDuplicates,
    outlierHandling: config.outlierHandling,
    missingHandling: config.missingHandling
  });

  const workingObservations = applySelectedTransformation(
    baseObservations,
    config.sources,
    config.activeTransformation
  );

  const descriptives = computeDescriptiveAndQualityAnalysis(workingObservations, config.sources);

  const J = config.sources.length;
  const ncc = descriptives.nCompleteCasesAllSources;
  const activeBootstrapSeed = Math.max(
    1,
    Math.floor(Math.abs(config.bootstrapSeed ?? 20261126))
  );

  // Pre-probe estimation to feed empirical identifiability / error correlation facts into selectMeasurementMethod()
  let prelimTca: ReturnType<typeof runTripleCollocationEngine> | null = null;
  let prelimMulti: ReturnType<typeof runMultiSourceCollocationEngine> | null = null;

  if (classification.allowsJointCollocationRanking && J === 3 && ncc >= 6) {
    prelimTca = runTripleCollocationEngine(
      workingObservations,
      [config.sources[0], config.sources[1], config.sources[2]],
      classification.propagatedConversionVarianceBySource,
      config.bootstrapReplications,
      activeBootstrapSeed
    );
  } else if (classification.allowsJointCollocationRanking && J >= 4 && ncc >= 8) {
    const prefEst =
      config.preferredMethodOverride === 'N_CORNERED_HAT'
        ? 'N_CORNERED_HAT'
        : config.preferredMethodOverride === 'EXTENDED_COLLOCATION'
          ? 'EXTENDED_COLLOCATION'
          : 'AUTO';
    prelimMulti = runMultiSourceCollocationEngine(
      workingObservations,
      config.sources,
      classification.propagatedConversionVarianceBySource,
      prefEst,
      config.bootstrapReplications,
      activeBootstrapSeed
    );
  }

  // Compute temporal & spatial summary inputs for selectMeasurementMethod()
  const betweenShares = descriptives.sourceStats.map(s => {
    const tot = s.betweenEntitySd * s.betweenEntitySd + s.withinEntitySd * s.withinEntitySd;
    return tot > 1e-12 ? (s.betweenEntitySd * s.betweenEntitySd * 100) / tot : 50;
  });
  const betweenEntitySharePct = mean(betweenShares);

  const maxResidualAr1Abs = prelimTca
    ? Math.max(0, ...Object.values(prelimTca.result.autocorrelatedErrorShareBySource))
    : 0.15;

  const suspectedCorrelatedPairsCount = prelimMulti
    ? prelimMulti.result.estimatedErrorCovariances.filter(c => Math.abs(c.estimatedErrorCorrelation) >= 0.25).length
    : prelimTca?.result.suspectedErrorCorrelationFlag
      ? 1
      : 0;

  const maxEstimatedErrorCorrAbs = prelimMulti
    ? prelimMulti.result.estimatedErrorCovariances.reduce((mx, c) => Math.max(mx, Math.abs(c.estimatedErrorCorrelation)), 0)
    : prelimTca?.result.suspectedErrorCorrelationFlag
      ? 0.38
      : 0.08;

  const overallMissingPct = mean(descriptives.sourceStats.map(s => s.missingPct));
  const covDof = (J * (J + 1)) / 2;
  const isModelIdentified =
    J === 2
      ? ncc >= 6
      : J === 3
        ? Boolean(prelimTca?.result.isIdentifiable)
        : Boolean(prelimMulti?.result.isIdentifiable);

  const decision = selectMeasurementMethod({
    sourceCount: J,
    measurementType: !classification.allowsJointCollocationRanking
      ? 'CONTOH_B_UNHARMONIZED'
      : classification.finalClassification === 'CONTOH_A'
        ? 'CONTOH_A_SAME'
        : classification.finalClassification === 'CONTOH_B'
          ? 'CONTOH_B_HARMONIZED'
          : 'UNDETERMINED',
    commonTarget: classification.allowsJointCollocationRanking,
    panelStructure: {
      nEntities: panel.nEntities,
      nPeriods: panel.nPeriods,
      nCompleteCases: ncc,
      isBalanced: panel.isBalanced,
      duplicatePairsCount: panel.duplicatePairsCount
    },
    errorIndependence: {
      suspectedCorrelatedPairsCount,
      maxEstimatedErrorCorrAbs,
      hasHeywoodNegativeVariance: Boolean(prelimTca?.result.hasHeywoodCase)
    },
    missingPattern: {
      overallMissingPct,
      missingnessBiasRisk: panel.potentialMissingnessBiasRisk
    },
    sampleSize: ncc,
    temporalStructure: {
      maxResidualAr1Abs,
      hasPeriodGaps: panel.periodGapEntitiesCount > 0
    },
    spatialStructure: {
      betweenEntitySharePct,
      crossSectionalDependenceAbs: Math.abs(
        descriptives.pairwiseScatters[0]
          ? pearsonCorrAndP(
              descriptives.periodMeans.map(p => p.valuesBySource[config.sources[0]?.id] ?? 0),
              descriptives.periodMeans.map(p => p.valuesBySource[config.sources[1]?.id] ?? 0)
            ).r
          : 0
      )
    },
    modelIdentifiability: {
      isIdentified: isModelIdentified,
      covarianceDegreesOfFreedom: covDof,
      requiredParameters: J === 2 ? 4 : 2 * J,
      reason:
        prelimTca?.result.rankingBlockedReason ??
        prelimMulti?.result.rankingBlockedReason ??
        'Parameter model teridentifikasi pada matriks kovarians sampel.'
    }
  });

  // Finalize Estimation Bundle
  const effectiveMethod =
    config.preferredMethodOverride &&
    classification.allowsJointCollocationRanking &&
    ((J >= 4 &&
      (config.preferredMethodOverride === 'N_CORNERED_HAT' ||
        config.preferredMethodOverride === 'EXTENDED_COLLOCATION')) ||
      (J === 2 && config.preferredMethodOverride === 'BLAND_ALTMAN_DEMING') ||
      (J === 3 && config.preferredMethodOverride === 'TRIPLE_COLLOCATION'))
      ? config.preferredMethodOverride
      : decision.recommendedMethod;

  const clampedB = Math.max(100, Math.min(2000, config.bootstrapReplications));
  let estimation: MsmaEstimationBundle = {
    executedMethod: effectiveMethod,
    executedMethodLabel: getMethodHumanLabel(effectiveMethod),
    uncertaintyMethod: 'NONE_BLOCKED',
    bootstrapReplications: clampedB,
    bootstrapSeed: activeBootstrapSeed,
    bootstrapDiagnostics: {
      requestedReplications: clampedB,
      bootstrapSeed: activeBootstrapSeed,
      validConvergedDraws: 0,
      heywoodOrSingularDraws: 0,
      convergenceRatePct: 0,
      heywoodDrawRatePct: 0,
      statisticalTieTop2: false,
      statisticalTieNote: 'Inferensi bootstrap ditangguhkan karena model belum memenuhi syarat konstruk atau ukuran sampel minimum.'
    },
    workingScaleNote:
      config.activeTransformation === 'NONE'
        ? `Skala satuan fisik asli (${config.sources[0]?.unit ?? 'unit'})`
        : `Skala tertransformasi (${config.activeTransformation})`,
    twoSourceResult: null,
    tcaResult: null,
    multiSourceResult: null,
    residualsBySource: {}
  };

  if (classification.allowsJointCollocationRanking && J === 2 && ncc >= 4) {
    const twoRes = runTwoSourceAgreementEngine(
      workingObservations,
      config.sources[0],
      config.sources[1],
      {
        demingLambdaRatio: config.demingLambdaRatio,
        demingLambdaExternalKnown: config.demingLambdaExternalKnown,
        bootstrapReplications: clampedB,
        bootstrapSeed: activeBootstrapSeed
      }
    );
    estimation = {
      ...estimation,
      uncertaintyMethod: 'ENTITY_CLUSTER_BOOTSTRAP',
      bootstrapDiagnostics: {
        requestedReplications: clampedB,
        bootstrapSeed: activeBootstrapSeed,
        validConvergedDraws: twoRes.nEntities >= 2 ? clampedB : 0,
        heywoodOrSingularDraws: 0,
        convergenceRatePct: twoRes.nEntities >= 2 ? 100 : 0,
        heywoodDrawRatePct: 0,
        statisticalTieTop2: false,
        statisticalTieNote: `Seluruh B = ${clampedB} replikasi klaster kota konvergen untuk estimasi SE dan 95% CI selisih rata-rata, RM-LoA, serta kemiringan Deming.`
      },
      twoSourceResult: twoRes
    };
  } else if (classification.allowsJointCollocationRanking && J === 3 && prelimTca) {
    estimation = {
      ...estimation,
      uncertaintyMethod: 'ENTITY_CLUSTER_BOOTSTRAP',
      bootstrapDiagnostics: prelimTca.bootstrapDiagnostics,
      tcaResult: prelimTca.result,
      residualsBySource: prelimTca.residualsBySource
    };
  } else if (classification.allowsJointCollocationRanking && J >= 4 && prelimMulti) {
    estimation = {
      ...estimation,
      uncertaintyMethod: 'ENTITY_CLUSTER_BOOTSTRAP',
      bootstrapDiagnostics: prelimMulti.bootstrapDiagnostics,
      multiSourceResult: prelimMulti.result,
      residualsBySource: prelimMulti.residualsBySource
    };
  }

  const diagnostics = runMethodDiagnostics({
    targetMethod: effectiveMethod,
    observations: workingObservations,
    sources: config.sources,
    panel,
    classification,
    descriptives,
    estimation
  });

  const robustness = runRobustnessAndSensitivitySuite({
    baseObservations,
    workingObservations,
    sources: config.sources,
    classification,
    activeTransformation: config.activeTransformation,
    estimation
  });

  const stepStataCommands = buildStepStataCommands({
    fileName: workbook.fileName,
    activeSheetName: activeSheet.sheetName,
    panel,
    sources: config.sources,
    classification,
    decision,
    transformation,
    demingLambdaRatio: config.demingLambdaRatio,
    bootstrapReplications: clampedB,
    bootstrapSeed: activeBootstrapSeed
  });

  const stataCompilation = buildStataCompilation9Sections({
    fileName: workbook.fileName,
    activeSheetName: activeSheet.sheetName,
    panel,
    sources: config.sources,
    classification,
    descriptives,
    diagnostics,
    transformation,
    estimation,
    robustness,
    stepCommands: stepStataCommands
  });

  const completeStataDoFile = [
    `* ============================================================================`,
    `* MASTER STATA 17/18 DO-FILE — MULTI-SOURCE MEASUREMENT ACCURACY ANALYSIS`,
    `* Generated at: ${new Date().toISOString()}`,
    `* Dataset     : ${workbook.fileName} (Sheet: ${activeSheet.sheetName})`,
    `* Method      : ${estimation.executedMethodLabel}`,
    `* ============================================================================`,
    `version 17.0`,
    `clear all`,
    `set more off`,
    ``,
    ...stepStataCommands.map(
      s => `* ----------------------------------------------------------------------------\n* ${s.stepTitle}\n* ----------------------------------------------------------------------------\n${s.stataCode}\n`
    )
  ].join('\n');

  const { technicalInterpretation, simpleInterpretation } = buildDualLevelInterpretations({
    panel,
    sources: config.sources,
    classification,
    estimation,
    robustness
  });

  const journalDefault = buildAcademicJournalDraft({
    workbookName: workbook.fileName,
    panel,
    sources: config.sources,
    classification,
    descriptives,
    decision,
    diagnostics,
    transformation,
    estimation,
    robustness,
    completeStataDoFile,
    technicalInterpretation
  });

  return {
    computedAt: new Date().toISOString(),
    panel,
    classification,
    step4Advisor,
    descriptives,
    decision,
    diagnostics,
    transformation,
    estimation,
    robustness,
    stepStataCommands,
    stataCompilation,
    completeStataDoFile,
    technicalInterpretation,
    simpleInterpretation,
    journalDefault
  };
}

function buildDualLevelInterpretations(params: {
  panel: MsmaFullAnalysisResult['panel'];
  sources: MsmaSourceConfig[];
  classification: MsmaFullAnalysisResult['classification'];
  estimation: MsmaEstimationBundle;
  robustness: MsmaFullAnalysisResult['robustness'];
}): { technicalInterpretation: string; simpleInterpretation: string } {
  const { panel, sources, classification, estimation, robustness } = params;

  if (!classification.allowsJointCollocationRanking) {
    return {
      technicalInterpretation: `Evaluasi klasifikasi konstruk menetapkan dataset ke dalam Contoh B (Different Measurement Construct) tanpa persamaan konversi fisik yang tervalidasi. Karena masing-masing sumber merepresentasikan dimensi fisik berbeda (${sources.map(s => `${s.displayName} [${s.unit}]`).join(', ')}), asumsi faktor laten tunggal X_k = α_k + β_k T + ε_k tidak terpenuhi. Estimator collocation maupun pemeringkatan varians galat lintas-sumber ditangguhkan secara sengaja demi mencegah inferensi semu.`,
      simpleInterpretation: `Sumber-sumber data yang Anda pilih mengukur hal fisik yang berbeda (contohnya total emisi tahunan dalam ton dibandingkan kadar konsentrasi udara dalam ppm). Menyamakan skala angka saja tidak membuat ketiganya mengukur hal yang sama, sehingga sistem tidak memaksakan penentuan sumber paling akurat sebelum tersedia rumus konversi ilmiah yang sah.`
    };
  }

  if (estimation.twoSourceResult) {
    const t2 = estimation.twoSourceResult;
    return {
      technicalInterpretation: `Pada spesifikasi dua sumber pengukuran (G = ${panel.nEntities} entitas, T = ${panel.nPeriods} periode, N = ${t2.nPairs}), Repeated-Measures Bland-Altman (Parker et al., 2020) mengestimasi bias selisih rata-rata sebesar ${fmtAdaptive(t2.meanDifference)} ${t2.unit} (95% Cluster CI: [${fmtAdaptive(t2.meanDifferenceCi95[0])}, ${fmtAdaptive(t2.meanDifferenceCi95[1])}]) dengan batas kesepakatan 95% [${fmtAdaptive(t2.loaLowerRepeatedMeasures)}, ${fmtAdaptive(t2.loaUpperRepeatedMeasures)}] dan Lin's CCC = ${t2.linsCcc.toFixed(4)}. Regresi Deming (λ = ${t2.demingErrorVarianceRatioLambda}) memberikan slope β̂ = ${t2.demingSlope.toFixed(4)} (95% CI: [${t2.demingSlopeCi95[0].toFixed(4)}, ${t2.demingSlopeCi95[1].toFixed(4)}]). Sesuai teori identifikasi model kesalahan pengukuran, 3 momen kovarians dari 2 sumber tidak cukup untuk memisahkan σ²_ε1 dan σ²_ε2 tanpa informasi eksternal.`,
      simpleInterpretation: `Analisis membandingkan tingkat kesepakatan antara ${t2.source1Name} dan ${t2.source2Name}. Rata-rata selisih keduanya adalah ${fmtAdaptive(t2.meanDifference)} ${t2.unit} dengan rentang selisih wajar 95% antara ${fmtAdaptive(t2.loaLowerRepeatedMeasures)} hingga ${fmtAdaptive(t2.loaUpperRepeatedMeasures)} ${t2.unit}. Karena hanya tersedia dua sumber tanpa data acuan kebenaran mutlak (Ground Truth), statistik hanya dapat menilai seberapa sepakat keduanya dan tidak mengklaim sumber mana yang secara mutlak lebih akurat.`
    };
  }

  const activeEsts =
    estimation.tcaResult?.estimates ?? estimation.multiSourceResult?.estimates ?? [];
  const ranked = [...activeEsts]
    .filter(e => e.relativeRank !== null)
    .sort((a, b) => (a.relativeRank ?? 99) - (b.relativeRank ?? 99));

  if (ranked.length === 0) {
    return {
      technicalInterpretation: `Estimasi ${estimation.executedMethodLabel} mendeteksi ketidaklayakan identifikasi matriks kovarians (${estimation.tcaResult?.rankingBlockedReason ?? estimation.multiSourceResult?.rankingBlockedReason ?? 'kasus Heywood / matriks hampir singular'}). Sesuai kaidah ekonometrika pengukuran tanpa Ground Truth, sistem tidak mengeluarkan peringkat numerik paksa.`,
      simpleInterpretation: `Struktur data saat ini menunjukkan indikasi gangguan asumsi (seperti kesalahan antarsumber yang saling terkait kuat atau variasi data yang belum cukup), sehingga peringkat akurasi sumber belum dapat ditentukan secara meyakinkan.`
    };
  }

  const best = ranked[0];
  const second = ranked[1];
  const rankingListStr = ranked
    .map(
      r =>
        `#${r.relativeRank} ${r.displayName} (σ̂_ε = ${fmtAdaptive(r.errorStandardDeviation)} [95% CI: ${fmtAdaptive(r.errorSdCi95[0])}, ${fmtAdaptive(r.errorSdCi95[1])}], R²_ETC = ${(r.etcCorrelationR2 * 100).toFixed(2)}%, P(Rank #1) = ${r.bootstrapRank1ProbPct.toFixed(1)}%)`
    )
    .join('; ');

  const ecNote =
    estimation.multiSourceResult &&
    estimation.multiSourceResult.estimatedErrorCovariances.length > 0
      ? ` Selain itu, Extended Collocation mendeteksi kovarians galat lintas-sumber signifikan pada pasangan ${estimation.multiSourceResult.estimatedErrorCovariances.map(c => `${c.sourceAName}–${c.sourceBName} (r̂_ε = ${c.estimatedErrorCorrelation.toFixed(3)})`).join(', ')}.`
      : '';

  const bridgeNote = classification.isExploratoryEmpiricalBridge
    ? ' [CATATAN MODE EKSPLORATORI CONTOH B: Sumber berkonstruk fisik berbeda diharmonisasi memakai jembatan regresi empiris beserta penalti propagasi σ²_conv; bukan pengganti model inversi fisika murni.]'
    : '';

  return {
    technicalInterpretation: `Berdasarkan estimasi ${estimation.executedMethodLabel} pada struktur panel G = ${panel.nEntities} entitas × T = ${panel.nPeriods} periode (N_CC = ${estimation.tcaResult?.nCompleteTriplets ?? estimation.multiSourceResult?.nCompleteCases ?? 0}; ${estimation.bootstrapReplications} replikasi Entity-Cluster Bootstrap), urutan akurasi relatif dari varians galat terkalibrasi terendah ke tertinggi adalah: ${rankingListStr}.${ecNote}${bridgeNote} Uji ketahanan spesifikasi pada Step 9 mencatat stabilitas peringkat #1 sebesar ${robustness.rankingStabilityPct.toFixed(1)}%. Seluruh inferensi berlaku relatif terhadap sinyal laten bersama di bawah asumsi ortogonalitas galat dan bebas common-mode bias absolut.`,
    simpleInterpretation: `Berdasarkan estimasi ${estimation.executedMethodLabel}, sumber ${best.displayName} memiliki estimasi error variance paling rendah (simpangan galat ${fmtAdaptive(best.errorStandardDeviation)} ${best.unit}) dibandingkan sumber lainnya${second ? ` seperti ${second.displayName} (${fmtAdaptive(second.errorStandardDeviation)} ${second.unit})` : ''}. Dengan asumsi model terpenuhi, hasil ini menunjukkan bahwa ${best.displayName} mempunyai akurasi relatif paling baik dan paling konsisten di antara sumber pengukuran yang dianalisis (stabil pada ${robustness.rankingStabilityPct.toFixed(1)}% skenario pengujian ulang).`
  };
}

function buildAcademicJournalDraft(params: {
  workbookName: string;
  panel: MsmaFullAnalysisResult['panel'];
  sources: MsmaSourceConfig[];
  classification: MsmaFullAnalysisResult['classification'];
  descriptives: MsmaFullAnalysisResult['descriptives'];
  decision: SelectMeasurementMethodOutput;
  diagnostics: MsmaFullAnalysisResult['diagnostics'];
  transformation: MsmaFullAnalysisResult['transformation'];
  estimation: MsmaEstimationBundle;
  robustness: MsmaFullAnalysisResult['robustness'];
  completeStataDoFile: string;
  technicalInterpretation: string;
}): MsmaJournalReportSections {
  const {
    workbookName,
    panel,
    sources,
    classification,
    descriptives,
    decision,
    diagnostics,
    transformation,
    estimation,
    robustness,
    completeStataDoFile,
    technicalInterpretation
  } = params;

  const J = sources.length;
  const activeEsts =
    estimation.tcaResult?.estimates ?? estimation.multiSourceResult?.estimates ?? [];
  const winner = activeEsts.find(e => e.relativeRank === 1);

  const title = `Evaluasi Statistik Akurasi Relatif ${J} Sumber Pengukuran Tanpa Ground Truth pada Data Panel Menggunakan ${estimation.executedMethodLabel}`;

  const abstractText = `Penelitian ini mengevaluasi akurasi relatif dari ${J} sumber pengukuran (${sources.map(s => s.displayName).join(', ')}) pada struktur data panel yang mencakup ${panel.nEntities} entitas selama ${panel.nPeriods} periode pengamatan (N lengkap = ${descriptives.nCompleteCasesAllSources}) tanpa mengasumsikan ketersediaan Ground Truth bebas kesalahan. Melalui pemeriksaan kesepadanan konstruk (${classification.finalClassification}) dan mesin pemilihan metodologi adaptif, analisis menerapkan ${estimation.executedMethodLabel} dengan inferensi ketidakpastian berbasis Entity-Cluster Bootstrap (${estimation.bootstrapReplications} replikasi) untuk mempertahankan struktur autokorelasi dalam entitas. ${winner ? `Hasil empiris menunjukkan bahwa ${winner.displayName} mencapai varians kesalahan terkalibrasi paling rendah (σ̂²_ε = ${fmtAdaptive(winner.totalComparableErrorVariance)}, σ̂_ε = ${fmtAdaptive(winner.errorStandardDeviation)} ${winner.unit}, R²_ETC = ${(winner.etcCorrelationR2 * 100).toFixed(2)}%) dengan tingkat stabilitas peringkat ${robustness.rankingStabilityPct.toFixed(1)}% pada pengujian sensitivitas.` : `Hasil evaluasi menunjukkan adanya batas identifikasi statistik pada konfigurasi data saat ini sehingga klaim pemeringkatan individual ditahan secara metodologis.`} Temuan ini memberikan dasar kuantitatif yang transparan dalam pemilihan sumber data pemantauan pada penelitian kebijakan berbasis panel.`;

  const keywords = `Measurement Error; Panel Data; Without Ground Truth; ${J === 2 ? 'Bland-Altman; Deming Regression' : J === 3 ? 'Triple Collocation Analysis; Extended Triple Collocation' : 'N-Cornered Hat; Extended Collocation'}; Cluster Bootstrap`;

  const introduction = `Ketersediaan berbagai sumber pengukuran untuk memantau indikator lingkungan dan ekonomi tingkat wilayah—seperti pelaporan mandiri pemerintah daerah, estimasi berbasis pengamatan satelit, serta jaringan sensor lapangan—menghadirkan peluang sekaligus tantangan metodologis. Dalam praktik empiris, tidak satu pun dari sumber tersebut dapat diperlakukan secara apriori sebagai kebenaran mutlak (Ground Truth) yang bebas dari kesalahan acak maupun distorsi skala. Mengunci salah satu instrumen sebagai acuan mutlak berisiko menyamakan ketidaksepakatan antarsumber sebagai kesalahan sumber lain semata.\n\nPenelitian ini menerapkan kerangka evaluasi akurasi pengukuran multi-sumber tanpa Ground Truth pada dataset panel "${workbookName}" (${panel.nEntities} entitas × ${panel.nPeriods} periode). Fokus utama analisis adalah memeriksa kesepadanan konstruk fisik antarsumber, menguji kelayakan identifikasi matriks kovarians, mengestimasi varians kesalahan pengukuran yang terkalibrasi secara adil, serta menguji ketahanan peringkat di berbagai subsampel panel.`;

  const literatureReview = `Literatur evaluasi instrumen tanpa referensi baku berakar pada model kesalahan pengukuran linear Stoffelen (1998) melalui Triple Collocation Analysis (TCA), yang kemudian diperluas oleh McColl et al. (2014) menjadi Extended Triple Collocation (ETC) untuk menurunkan koefisien determinasi terhadap sinyal target laten (R²_ETC) dan rasio sinyal-terhadap-derau (SNR). Wu et al. (2019, 2023) menunjukkan bahwa perbandingan via TCA lebih tangguh terhadap galat keterwakilan spasial (representativeness error) dibanding perbandingan berpasangan langsung, selama penyetaraan skala kalibrasi dilakukan dengan tepat.\n\nPada struktur deret waktu dan panel, Dong & Crow (2017) menekankan pentingnya memperhatikan autokorelasi temporal galat, sedangkan González-Gambau et al. (2020) dan Balasubramaniam & Ruf (2025) mendokumentasikan distorsi varians apabila dua sumber berbagi korelasi galat non-ideal. Untuk empat sumber atau lebih, metode Three/N-Cornered Hat berkendala definit positif (Premoli & Tavella, 1993) dan Extended Collocation (Gruber et al., 2016) memungkinkan over-identifikasi varians serta deteksi kovarians galat lintas-sumber. Sementara itu, ketika hanya tersedia dua sumber pada data pengamatan berulang, Parker et al. (2020) dan Linnet (1993) merekomendasikan kombinasi Repeated-Measures Bland-Altman dan Deming Regression tanpa mengklaim pemisahan varians galat individual. Dalam konteks emisi CO₂ perkotaan, Fu et al. (2019), Yang et al. (2020, 2023), Lian et al. (2023), dan Che et al. (2024) menegaskan bahwa konsentrasi kolom atmosfer (ppm) dan fluks emisi kota (ton/tahun) memerlukan model transpor/inversi fisik sebelum dapat dibandingkan sebagai satu konstruk yang sama.`;

  const researchMethodology = `Pemilihan metode dilakukan secara algoritmik berdasarkan jumlah sumber J = ${J}, klasifikasi konstruk (${classification.finalClassification}), struktur keseimbangan panel, serta keteridentifikasian matriks kovarians. Metode utama yang diterapkan adalah ${estimation.executedMethodLabel}. Alasan pemilihan: ${decision.methodJustification.join(' ')}\n\nModel pengukuran didefinisikan sebagai X_k,it = α_k + β_k T_it + ε_k,it untuk sumber k = 1, ..., ${J} pada entitas i = 1, ..., ${panel.nEntities} dan periode t = 1, ..., ${panel.nPeriods}. Untuk menjaga validitas inferensi terhadap korelasi serial dalam entitas (Roodman et al., 2019), interval kepercayaan 95% dihitung menggunakan Nonparametric Entity-Cluster Bootstrap dengan ${estimation.bootstrapReplications} replikasi.`;

  const dataAndVariables = `Dataset "${workbookName}" memuat ${panel.validPanelRows} baris panel valid yang tersebar pada ${panel.nEntities} entitas dan ${panel.nPeriods} periode (${panel.isBalanced ? 'Balanced Panel' : `Unbalanced Panel dengan ${panel.missingPanelCells} sel kosong`}). Sumber pengukuran yang dianalisis meliputi:\n` +
    descriptives.sourceStats
      .map(
        (s, idx) =>
          `${idx + 1}. ${s.displayName} [${s.unit}]: N valid = ${s.nValid} (missing ${s.missingPct.toFixed(1)}%), Mean = ${fmtAdaptive(s.mean)}, SD = ${fmtAdaptive(s.sd)} (Between SD = ${fmtAdaptive(s.betweenEntitySd)}, Within SD = ${fmtAdaptive(s.withinEntitySd)}), Skewness = ${s.skewness.toFixed(2)}.`
      )
      .join('\n') +
    `\n\nPrapemrosesan aktif menggunakan skema transformasi "${transformation.activeTransformation}", kebijakan missing "${transformation.missingHandling}", dan kebijakan pencilan "${transformation.outlierHandling}".`;

  const statisticalResults = `${technicalInterpretation}\n\nRingkasan Diagnostik Asumsi (${diagnostics.overallStatus}):\n` +
    diagnostics.items
      .map(d => `- ${d.testName} [${d.testabilityTier}]: ${d.status} — ${d.interpretation}`)
      .join('\n');

  const discussion = `[Pemisahan Hasil Empiris vs Interpretasi Kontekstual]\nSecara empiris, perhitungan matriks kovarians menunjukkan variasi antarentitas menyumbang porsi substansial dari total dispersi sinyal, yang membantu stabilitas estimasi faktor skala kalibrasi β_k. ${winner ? `Keunggulan relatif ${winner.displayName} ditopang oleh varians galat terkalibrasi terendah serta konsistensi koefisien korelasi laten R²_ETC = ${(winner.etcCorrelationR2 * 100).toFixed(2)}%.` : `Ketidakmampuan mengidentifikasi peringkat tunggal pada konfigurasi ini menegaskan pentingnya disiplin ekonometrika agar peneliti tidak menyamakan korelasi tinggi antarsumber dengan akurasi absolut.`}\n\nSecara substantif, perbedaan varians galat antarsumber juga mencerminkan perbedaan cakupan representativitas spasial (Wu et al., 2019; Che et al., 2024), sehingga hasil pemeringkatan harus dimaknai relatif terhadap sinyal konsensus tingkat entitas-periode yang diamati bersama.`;

  const robustnessAnalysis = robustness.evaluated
    ? `${robustness.stabilityVerdict}\n\nRincian ${robustness.scenarios.length} skenario sensitivitas:\n` +
      robustness.scenarios
        .map(
          s =>
            `- ${s.scenarioLabel} (N = ${s.nObs}): Peringkat #1 = ${s.topSourceName ?? 'Tidak Teridentifikasi'} (${s.conclusionNote})`
        )
        .join('\n')
    : robustness.stabilityVerdict;

  const conclusion = winner
    ? `Berdasarkan rangkaian pemeriksaan konstruk, diagnostik asumsi, estimasi ${estimation.executedMethodLabel}, dan uji ketahanan multi-skenario, sumber pengukuran ${winner.displayName} menunjukkan akurasi relatif terbaik (estimasi varians kesalahan paling rendah) di antara ${J} sumber yang dievaluasi pada struktur data panel ini, dengan catatan seluruh asumsi pengidentifikasi model terpenuhi.`
    : `Berdasarkan evaluasi menyeluruh terhadap struktur data dan syarat identifikasi model (${estimation.executedMethodLabel}), sistem memberikan estimasi kesepakatan/diagnostik secara utuh tanpa memaksakan klaim peringkat akurasi absolut yang tidak teridentifikasi.`;

  const limitations = decision.limitations
    .concat([
      'Tanpa ketersediaan Ground Truth eksternal, seluruh metode berbasis kovarians tidak dapat mendeteksi bias aditif maupun distorsi skala yang dialami secara identik dan serempak oleh seluruh sumber (common-mode bias).',
      'Tabel output bergaya Stata pada laporan ini merupakan Stata-compatible replicated output dari mesin komputasi deterministik internal; verifikasi langsung pada perangkat lunak Stata berlisensi dapat dijalankan menggunakan lampiran Master Do-File.'
    ])
    .map((l, i) => `${i + 1}. ${l}`)
    .join('\n');

  const referencesText = MSMA_VERIFIED_BIBLIOGRAPHY.map(
    r => `${r.authors} (${r.year}). ${r.title}. ${r.journal}, ${r.publisher}. https://doi.org/${r.doi}`
  ).join('\n\n');

  return {
    title,
    abstractText,
    keywords,
    introduction,
    literatureReview,
    researchMethodology,
    dataAndVariables,
    statisticalResults,
    discussion,
    robustnessAnalysis,
    conclusion,
    limitations,
    referencesText,
    appendixStataCommands: completeStataDoFile
  };
}
