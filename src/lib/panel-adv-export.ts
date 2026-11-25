// ============================================================
// OPTION 3 — Multi-Format Academic Report Exporters (PDF 1.4, DOCX, XLSX, CSV)
// Formula-Injection Safe & Chronologically Ordered Steps 1–9
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import * as XLSX from 'xlsx';
import { sanitizeSpreadsheetText } from './panel-accuracy-validation';
import { AdvPanelFitResult } from './panel-adv-types';

const fmt = (n: number | null | undefined, d = 4): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return Number(n).toFixed(d);
};

export function generateOption3CSV(result: AdvPanelFitResult): string {
  const headers = [
    'Rank',
    'Source_ID',
    'Source_Name',
    'Source_Label',
    'Anchor_Total_RMSE',
    'Total_RMSE_CrI_Lower',
    'Total_RMSE_CrI_Upper',
    'Scale_Noise_Ratio_Sigma_Over_Lambda',
    'Noise_Ratio_CrI_Lower',
    'Noise_Ratio_CrI_Upper',
    'Abs_Bias_Alpha',
    'Reliability_R2_Pct',
    'Prob_Rank1_Pct',
    'Prob_Top2_Pct',
    'Expected_Rank',
    'Rank_SD',
    'Rank_Entropy',
    'Entity_Stability_Pct',
    'Temporal_Stability_Pct',
    'Max_Anchor_Rank_Shift',
    'Indistinguishable_From_Top'
  ];
  const rows = result.ranking.rows.map(r => [
    r.rank,
    sanitizeSpreadsheetText(r.sourceId),
    sanitizeSpreadsheetText(r.sourceName),
    `"${sanitizeSpreadsheetText(r.sourceLabel).replace(/"/g, '""')}"`,
    fmt(r.anchorTotalRmse, 5),
    fmt(r.anchorTotalRmseCrI[0], 5),
    fmt(r.anchorTotalRmseCrI[1], 5),
    fmt(r.scaleAdjustedNoiseRatio, 5),
    fmt(r.noiseRatioCrI[0], 5),
    fmt(r.noiseRatioCrI[1], 5),
    fmt(r.relativeBiasAbs, 5),
    fmt(r.reliabilityR2 * 100, 2),
    fmt(r.probRank1 * 100, 2),
    fmt(r.probTop2 * 100, 2),
    fmt(r.expectedRank, 3),
    fmt(r.rankSdDispersion, 3),
    fmt(r.rankEntropyNormalized, 4),
    fmt(r.entityStabilityPct, 1),
    fmt(r.temporalStabilityPct, 1),
    r.maxAnchorRankShift,
    r.statisticallyIndistinguishableFromTop ? 'YES' : 'NO'
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function fitXlsxCols(rows: unknown[][]): XLSX.ColInfo[] {
  if (!rows.length) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths = new Array<number>(colCount).fill(13);
  rows.forEach(r => {
    for (let i = 0; i < colCount; i++) {
      const len = String(r[i] ?? '').length;
      if (len + 3 > widths[i]) widths[i] = Math.min(86, len + 3);
    }
  });
  return widths.map(wch => ({ wch }));
}

function appendSafeSheet(wb: XLSX.WorkBook, name: string, aoa: unknown[][]) {
  const safe = aoa.map(row =>
    row.map(cell => (typeof cell === 'string' ? sanitizeSpreadsheetText(cell) : cell))
  );
  const ws = XLSX.utils.aoa_to_sheet(safe);
  ws['!cols'] = fitXlsxCols(safe);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function generateOption3XLSX(
  result: AdvPanelFitResult,
  datasetName = 'Option3_Panel_Accuracy.xlsx'
): Buffer {
  const wb = XLSX.utils.book_new();

  appendSafeSheet(wb, '01_Ringkasan_Eksekutif', [
    ['OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION'],
    ['Dataset', datasetName],
    ['Waktu Eksekusi', result.executedAt],
    ['Dimensi Panel (G Entitas × T Periode × J Sumber)', `${result.datasetSummary.nEntities} × ${result.datasetSummary.nPeriods} × ${result.datasetSummary.nSources}`],
    ['Pasangan Complete-Case / Total Baris', `${result.datasetSummary.nCompletePairs} / ${result.datasetSummary.nRawRows}`],
    ['Skala Kerja Aktif', result.datasetSummary.workingScaleLabel],
    ['Status Identifikasi', result.autoDecision.overallIdentifiabilityStatus],
    ['Status Keputusan Peringkat', result.ranking.verdictStatus],
    ['Kandidat Keandalan Relatif Teratas', result.ranking.leaderSourceLabel || 'Inkonklusif / Seri'],
    [],
    ['KESIMPULAN ILMIAH & BATAS EPISTEMOLOGIS'],
    ['Headline', result.scientificConclusion.headline],
    ['Narasi Alasan Terpilih (Lintas Metode)', result.scientificConclusion.finalNarrativeConclusion],
    ['Tahap Lulus Penuh', `${result.scientificConclusion.passedMethodsCount} / ${result.scientificConclusion.totalMethodsCount}`],
    ['Sintesis Keandalan Relatif', result.scientificConclusion.relativeReliabilitySummary],
    ['Batas Ground Truth', result.scientificConclusion.epistemologicalGroundTruthBoundary],
    ...result.scientificConclusion.keyLimitations.map((l, idx) => [`Batasan ${idx + 1}`, l]),
    [],
    ['JEJAK PEMBUKTIAN MULTI-METODE (MENGAPA VARIABEL TERPILIH)'],
    ['Tahap', 'Metode', 'Status', 'Metrik Utama', 'Temuan Data Aktual', 'Alasan Kontribusi Pemilihan'],
    ...result.scientificConclusion.whySelectedEvidence.map(ev => [
      ev.stageLabel,
      ev.methodName,
      ev.status,
      ev.keyMetricBadge,
      ev.finding,
      ev.selectionReason
    ])
  ]);

  appendSafeSheet(wb, '02_Auto_Decision_Step2', [
    ['KEPUTUSAN OTOMATIS 12 KOMPONEN METODOLOGI (STEP 2)'],
    ['Aturan Hierarki', result.autoDecision.hierarchyRule],
    ['Override Manual Aktif?', result.autoDecision.hasManualOverrides ? 'YA' : 'TIDAK'],
    [],
    ['Dimensi', 'Metode Terpilih', 'Tingkat Keyakinan', 'Override?', 'Alasan Pemilihan', 'Basis Data Empiris', 'Dampak pada Hasil'],
    ...result.autoDecision.decisions.map(d => [
      d.dimensionLabel,
      d.selectedMethod,
      d.confidenceLevel,
      d.isOverriddenByUser ? 'YA' : 'TIDAK',
      d.whySelected,
      d.empiricalDataBasis,
      d.impactOnResults
    ])
  ]);

  appendSafeSheet(wb, '03_Preprocessing_Step3', [
    ['PROFIL SUMBER & AUDIT PENCILAN PANEL MAD/IQR (STEP 3)'],
    ['Sumber', 'Label', 'Unit', 'N Valid', 'Missing (%)', 'Mean', 'SD', 'Median', 'MAD', 'Skewness', 'Excess Kurtosis', 'Panel MAD Outliers', 'Within-Entity IQR Outliers'],
    ...result.preprocessing.sourceProfiles.map(sp => [
      sp.sourceName,
      sp.sourceLabel,
      sp.unit,
      sp.nValid,
      sp.missingPct,
      sp.mean,
      sp.sd,
      sp.median,
      sp.mad,
      sp.skewness,
      sp.excessKurtosis,
      sp.panelMadOutlierCount,
      sp.withinEntityIqrOutlierCount
    ]),
    [],
    ['EVALUASI 10 KANDIDAT TRANSFORMASI'],
    ['Metode', 'Label', 'Layak?', 'Terpilih?', 'Pelestarian Estimand', 'Skor Normalitas Sentral', '|t| Heteroskedastisitas', 'Alasan Keputusan'],
    ...result.preprocessing.transformationEvaluations.map(tr => [
      tr.method,
      tr.label,
      tr.eligible ? 'YA' : 'TIDAK',
      tr.selected ? 'YA' : 'TIDAK',
      tr.estimandPreservation,
      tr.centralNormalityScore,
      tr.proportionalHeteroscedasticityAbsT,
      tr.decisionReason
    ])
  ]);

  appendSafeSheet(wb, '04_Latent_MCMC_Step4_5', [
    ['PARAMETER MODEL LATEN & DIAGNOSTIK VEHTARI (2021) (STEP 4–5)'],
    ['Max Split R-hat', result.estimation.mcmcDiagnostics.maxRankNormalizedRhat],
    ['Max Folded R-hat', result.estimation.mcmcDiagnostics.maxFoldedRhat],
    ['Min Bulk-ESS / Min Tail-ESS', `${result.estimation.mcmcDiagnostics.minBulkEss} / ${result.estimation.mcmcDiagnostics.minTailEss}`],
    ['Marginal WAIC / PSIS-LOO ELPD / Max Pareto-k', `${result.estimation.mcmcDiagnostics.marginalWaic} / ${result.estimation.mcmcDiagnostics.psisLooElpd} / ${result.estimation.mcmcDiagnostics.psisMaxParetoK}`],
    [],
    ['Sumber', 'Label', 'Bias α', '95% CrI α', 'Loading λ', '95% CrI λ', 'Error SD σ', '95% CrI σ', 'Noise Ratio σ/|λ|', 'Anchor Total RMSE', 'Reliabilitas R² (%)', 'AR(1) ρ', 'Split R-hat', 'Folded R-hat', 'Bulk-ESS', 'Tail-ESS'],
    ...result.estimation.sourceParameters.map(sp => {
      const m = result.estimation.mcmcDiagnostics.perSource.find(x => x.sourceId === sp.sourceId);
      return [
        sp.sourceName,
        sp.sourceLabel,
        sp.biasAlpha,
        `[${sp.biasCrILower}, ${sp.biasCrIUpper}]`,
        sp.loadingLambda,
        `[${sp.loadingCrILower}, ${sp.loadingCrIUpper}]`,
        sp.errorSd,
        `[${sp.errorSdCrILower}, ${sp.errorSdCrIUpper}]`,
        sp.scaleAdjustedNoiseRatio,
        sp.anchorConditionedTotalRmse,
        Number((sp.reliabilityR2 * 100).toFixed(2)),
        sp.ar1RhoResidual,
        m?.rankNormalizedRhat ?? '-',
        m?.foldedRhat ?? '-',
        m?.bulkEss ?? '-',
        m?.tailEss ?? '-'
      ];
    }),
    [],
    ['SELEKSI MODEL KETERGANTUNGAN M1–M4'],
    ['Model ID', 'Label', 'Teridentifikasi?', 'df_cov', 'Marginal WAIC', 'LOO ELPD', 'Terpilih?', 'Alasan'],
    ...result.estimation.candidateModels.map(cm => [
      cm.modelId,
      cm.modelLabel,
      cm.isIdentifiable ? 'YA' : 'TIDAK',
      cm.degreesOfFreedomCov,
      cm.marginalWaic,
      cm.looElpd,
      cm.selected ? 'YA' : 'TIDAK',
      cm.selectionReason
    ])
  ]);

  appendSafeSheet(wb, '05_Ranking_Anchor_Step6', [
    ['PEMERINGKATAN PROBABILISTIK & SENSITIVITAS MULTI-ANCHOR (STEP 6)'],
    ['Kendall W (Total RMSE)', result.estimation.anchorSensitivity.kendallWTotalRmse],
    ['Kendall W (Noise Ratio σ/|λ|)', result.estimation.anchorSensitivity.kendallWNoiseRatio],
    ['Status Sensitivitas Anchor', result.estimation.anchorSensitivity.sensitivityStatus],
    [],
    ['Rank', 'Sumber', 'Anchor Total RMSE', '95% CrI RMSE', 'Noise Ratio σ/|λ|', '95% CrI Ratio', 'P(Rank=1) %', 'P(Rank<=2) %', 'Expected Rank', 'Rank SD', 'Entropy', 'Entity Stability %', 'Time Stability %', 'Max Anchor Shift', 'Seri dgn #1?'],
    ...result.ranking.rows.map(r => [
      r.rank,
      `${r.sourceName} (${r.sourceLabel})`,
      r.anchorTotalRmse,
      `[${r.anchorTotalRmseCrI[0]}, ${r.anchorTotalRmseCrI[1]}]`,
      r.scaleAdjustedNoiseRatio,
      `[${r.noiseRatioCrI[0]}, ${r.noiseRatioCrI[1]}]`,
      Number((r.probRank1 * 100).toFixed(2)),
      Number((r.probTop2 * 100).toFixed(2)),
      r.expectedRank,
      r.rankSdDispersion,
      r.rankEntropyNormalized,
      r.entityStabilityPct,
      r.temporalStabilityPct,
      r.maxAnchorRankShift,
      r.statisticallyIndistinguishableFromTop ? 'YA' : 'TIDAK'
    ]),
    [],
    ['PERBANDINGAN LINTAS REZIM ANCHOR'],
    ['Anchor Regime', 'Formula Konstrain', 'Top #1 by Noise Ratio', 'Top #1 by Total RMSE'],
    ...result.estimation.anchorSensitivity.evaluatedAnchors.map(a => [
      a.anchorLabel,
      a.constraintFormula,
      a.topRankedByPrecisionRatioId,
      a.topRankedByTotalRmseId
    ])
  ]);

  appendSafeSheet(wb, '06_Validation_Holm_Step7', [
    ['LOSO COVARIANCE AUDIT, PAIR FE HOLM & REPEATED-MEASURES LOA (STEP 7)'],
    ['Sumber Dikeluarkan (LOSO)', 'Teridentifikasi?', 'Korelasi dgn Full θ', 'LOSO MAE', 'LOSO RMSE', 'Audit Suku Kovarians', 'Debiased Error SD', 'Full Error SD', 'Perubahan Urutan Peer?'],
    ...result.validation.losoEntries.map(l => [
      l.leftOutSourceLabel,
      l.losoIdentified ? 'YA' : 'PARSIAL',
      l.latentCorrelationWithFull,
      l.losoPredictiveMae,
      l.losoPredictiveRmse,
      l.covarianceTermAudit,
      l.debiasedImpliedErrorSd,
      l.fullModelErrorSd,
      l.rankChangedAmongPeers ? 'YA' : 'TIDAK'
    ]),
    [],
    ['KONTRAS BERPASANGAN PAIR FIXED EFFECTS (TERKOREKSI HOLM 1979)'],
    ['Sumber A', 'Sumber B', 'Diff |e|_A - |e|_B', 'SE Aktif', 'Metode SE', 'p Asimtotik', 'p Wild Bootstrap', 'p Holm Adjusted', 'Simultaneous 95% CI', 'Signifikan FWER 5%?'],
    ...result.validation.pairwiseHolmContrasts.map(c => [
      c.sourceALabel,
      c.sourceBLabel,
      c.diffAbsErrorAminusB,
      c.seSelected,
      c.seMethodUsed,
      c.pRawAsymptotic,
      c.pWildBootstrap,
      c.pHolmAdjusted,
      `[${c.simultaneous95Ci[0]}, ${c.simultaneous95Ci[1]}]`,
      c.significantFamilywise05 ? 'YA' : 'TIDAK'
    ]),
    [],
    ['REPEATED-MEASURES MIXED-EFFECTS BLAND-ALTMAN & CCC (PARKER ET AL., 2020)'],
    ['Sumber', 'Lin CCC', '95% CI CCC', 'Within-Entity r', 'Mean Bias', 'SD Between-Entity', 'SD Within-Entity', 'Total RM SD', 'Mixed LoA Lower', 'Mixed LoA Upper', 'Naive LoA Width', 'Mixed LoA Width'],
    ...result.validation.repeatedMeasuresAgreement.map(rm => [
      rm.sourceLabel,
      rm.linsCcc,
      `[${rm.linsCccCi[0]}, ${rm.linsCccCi[1]}]`,
      rm.withinEntityR,
      rm.meanBias,
      rm.betweenEntityDiffSd,
      rm.withinEntityDiffSd,
      rm.totalRepeatedMeasuresDiffSd,
      rm.mixedEffectsLoaLower,
      rm.mixedEffectsLoaUpper,
      rm.naivePooledLoaWidth,
      rm.mixedEffectsLoaWidth
    ])
  ]);

  appendSafeSheet(wb, '07_MonteCarlo_CMB_Step8', [
    ['VALIDASI SIMULASI MONTE CARLO 7 KELUARGA (STEP 8)'],
    ['Keluarga', 'ID Skenario', 'Judul Skenario', 'Replikasi', 'Bias Mean', 'RMSE Parameter', 'Cakupan 95% (%)', 'Pemulihan Rank #1 (%)', 'Type I Error (%)', 'Power (%)', 'Konvergensi (%)', 'Gagal Identifikasi (%)', 'Interpretasi'],
    ...result.monteCarlo.scenarios.map(s => [
      s.family,
      s.scenarioId,
      s.scenarioTitle,
      s.replications,
      s.parameterBiasMean,
      s.parameterRmse,
      s.interval95CoveragePct,
      s.top1RankingRecoveryPct,
      s.empiricalTypeIErrorPct,
      s.empiricalPowerPct,
      s.convergenceRatePct,
      s.identificationFailurePct,
      s.interpretation
    ]),
    [],
    ['10 SKENARIO AUDIT COMMON-MODE BIAS'],
    ['Kode', 'Skenario', 'Kondisi Simulasi', 'Terdeteksi #1 oleh Model', 'Terbaik Sejati di Simulasi', 'Bias Bersama Terdeteksi Tanpa GT?', 'Temuan Epistemologis'],
    ...result.ranking.commonModeBiasScenarios.map(c => [
      c.scenarioCode,
      c.title,
      c.simulatedCondition,
      c.detectedTopSourceLabel,
      c.trueBestUnderSimulationLabel,
      c.biasesRecoverableWithoutGroundTruth ? 'YA' : 'TIDAK',
      c.epistemologicalFinding
    ])
  ]);

  appendSafeSheet(wb, '08_Stata_Code_Literature', [
    ['KODE STATA 17/18 PER STEP & DAFTAR LITERATUR ILMIAH TERVERIFIKASI'],
    ['Step', 'Judul Step', 'Metode', 'Padanan Eksak Native Stata?', 'Alternatif Stata Terdekat', 'Kode Stata'],
    ...result.stepStataGuides.map(st => [
      st.stepNumber,
      st.stepTitle,
      st.methodName,
      st.limitationsAndNativeGap.hasExactNativeStata ? 'YA' : 'PARSIAL (Lihat Catatan)',
      st.limitationsAndNativeGap.closestStataAlternative,
      st.stataCode
    ]),
    [],
    ['DAFTAR LITERATUR PEER-REVIEWED TERVERIFIKASI'],
    ['Penulis', 'Tahun', 'Judul', 'Jurnal', 'Volume/Halaman', 'DOI', 'Kategori Bukti', 'Peran pada Option 3'],
    ...result.literature.map(lit => [
      lit.authors,
      lit.year,
      lit.title,
      lit.journal,
      lit.volumePages,
      lit.doi,
      lit.evidenceCategory,
      lit.roleInOption3
    ])
  ]);

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function escapePdf(text: string): string {
  const ascii = text
    .replace(/CO₂/g, 'CO2')
    .replace(/[₀]/g, '0')
    .replace(/[₁]/g, '1')
    .replace(/[₂]/g, '2')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[ε]/g, 'eps')
    .replace(/[θ]/g, 'theta')
    .replace(/[λ]/g, 'lambda')
    .replace(/[μ]/g, 'mu')
    .replace(/[ρ]/g, 'rho')
    .replace(/[σ]/g, 'sigma')
    .replace(/[φ]/g, 'phi')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[±]/g, '+/-')
    .replace(/[×]/g, 'x')
    .replace(/[·]/g, '*')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfText(text: string, maxChars = 92): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function generateOption3PDF(
  result: AdvPanelFitResult,
  datasetName = 'Option3_Panel_Accuracy.xlsx'
): Buffer {
  interface LineItem {
    kind: 'title' | 'section' | 'body' | 'mono' | 'spacer';
    text: string;
    font: 'F1' | 'F2' | 'F3';
    size: number;
    leading: number;
  }
  const lines: LineItem[] = [];
  const pushSpacer = (leading = 7) => lines.push({ kind: 'spacer', text: '', font: 'F1', size: 8, leading });
  const pushSection = (t: string) => {
    pushSpacer(8);
    wrapPdfText(t, 82).forEach(l => lines.push({ kind: 'section', text: l, font: 'F2', size: 10.5, leading: 15 }));
  };
  const pushBody = (t: string) => {
    wrapPdfText(t, 92).forEach(l => lines.push({ kind: 'body', text: l, font: 'F1', size: 8.8, leading: 12 }));
  };
  const pushMono = (t: string) => {
    t.split('\n').forEach(raw => {
      const chunks = raw.length <= 94 ? [raw] : [raw.slice(0, 94), `  ${raw.slice(94, 184)}`];
      chunks.forEach(c => lines.push({ kind: 'mono', text: c, font: 'F3', size: 7.4, leading: 10 }));
    });
  };

  lines.push({
    kind: 'title',
    text: 'OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION',
    font: 'F2',
    size: 12,
    leading: 17
  });
  pushBody(
    `Dataset: ${datasetName} | Panel: G=${result.datasetSummary.nEntities}, T=${result.datasetSummary.nPeriods}, J=${result.datasetSummary.nSources}, N_CC=${result.datasetSummary.nCompletePairs} | Skala: ${result.datasetSummary.workingScaleLabel}`
  );
  pushBody(`Status Keputusan: ${result.ranking.verdictStatus} | Kandidat Relatif #1: ${result.ranking.leaderSourceLabel || 'Inkonklusif'}`);

  pushSection('1. KESIMPULAN ILMIAH, ALASAN PEMILIHAN MULTI-METODE & BATAS GROUND TRUTH');
  pushBody(result.scientificConclusion.headline);
  pushBody(result.scientificConclusion.finalNarrativeConclusion);
  result.scientificConclusion.whySelectedEvidence.forEach(ev => {
    pushBody(`[${ev.status}] ${ev.stageLabel} (${ev.keyMetricBadge}): ${ev.finding} -> ${ev.selectionReason}`);
  });
  pushBody(result.scientificConclusion.epistemologicalGroundTruthBoundary);

  pushSection('2. KEPUTUSAN OTOMATIS 12 KOMPONEN METODOLOGI (STEP 2)');
  result.autoDecision.decisions.forEach((d, idx) => {
    pushBody(`${idx + 1}. ${d.dimensionLabel}: ${d.selectedMethod} [${d.confidenceLevel}] - ${d.whySelected}`);
  });

  pushSection('3. PARAMETER LATEN, KONVERGENSI VEHTARI (2021) & PEMERINGKATAN PROBABILISTIK');
  pushBody(result.estimation.mcmcDiagnostics.convergenceNote);
  pushMono(
    [
      'Rank | Sumber                  | TotalRMSE | R_j(s/|l|) | P(R=1)% | E[Rank] | Entropi | AnchorShift',
      '-----+-------------------------+-----------+------------+---------+---------+---------+------------',
      ...result.ranking.rows.map(
        r =>
          `${String(r.rank).padStart(4)} | ${r.sourceLabel.slice(0, 23).padEnd(23)} | ${fmt(r.anchorTotalRmse, 4).padStart(9)} | ${fmt(r.scaleAdjustedNoiseRatio, 4).padStart(10)} | ${fmt(r.probRank1 * 100, 1).padStart(7)} | ${fmt(r.expectedRank, 2).padStart(7)} | ${fmt(r.rankEntropyNormalized, 3).padStart(7)} | ${String(r.maxAnchorRankShift).padStart(10)}`
      )
    ].join('\n')
  );
  pushBody(result.estimation.anchorSensitivity.interpretation);

  pushSection('4. VALIDASI LOSO, PAIR FE TERKOREKSI HOLM (1979) & MIXED-EFFECTS LOA');
  pushBody(result.validation.seSelectionRationale);
  result.validation.pairwiseHolmContrasts.forEach(c => {
    pushBody(
      `- ${c.sourceALabel} vs ${c.sourceBLabel}: Diff=${fmt(c.diffAbsErrorAminusB, 4)}, SE=${fmt(c.seSelected, 4)}, p_Wild=${fmt(c.pWildBootstrap, 4)}, p_Holm=${fmt(c.pHolmAdjusted, 4)}, Sim95%CI=[${fmt(c.simultaneous95Ci[0], 4)}, ${fmt(c.simultaneous95Ci[1], 4)}] (${c.significantFamilywise05 ? 'Signifikan FWER' : 'Tidak Signifikan'})`
    );
  });

  pushSection('5. RINGKASAN MONTE CARLO 7 KELUARGA & DAFTAR LITERATUR');
  pushBody(result.monteCarlo.overallValidationSummary);
  result.literature.forEach(lit => {
    pushBody(`- ${lit.authors} (${lit.year}). ${lit.title}. ${lit.journal}, ${lit.volumePages}. DOI: ${lit.doi}`);
  });

  pushSection('6. KODE REPRODUKSIBILITAS STATA 17/18 (MASTER DO-FILE)');
  pushMono(result.masterStataDoFile);

  const TOP_Y = 784;
  const BOT_Y = 54;
  const pages: LineItem[][] = [];
  let curPage: LineItem[] = [];
  let curY = TOP_Y;
  lines.forEach(ln => {
    if (curY - ln.leading < BOT_Y && curPage.length > 0) {
      pages.push(curPage);
      curPage = [];
      curY = TOP_Y;
    }
    curPage.push(ln);
    curY -= ln.leading;
  });
  if (curPage.length > 0 || pages.length === 0) pages.push(curPage);

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  const firstPageObj = 6;
  const pageObjNums = pages.map((_, i) => firstPageObj + i * 2);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj');

  pages.forEach((pLines, pIdx) => {
    const pObjNum = firstPageObj + pIdx * 2;
    const cObjNum = pObjNum + 1;
    let y = TOP_Y;
    const cmds: string[] = [
      'q',
      '0.06 0.35 0.25 RG 0.8 w 40 798 m 555 798 l S',
      '0.75 0.80 0.86 RG 0.5 w 40 42 m 555 42 l S',
      'Q',
      'BT',
      '/F1 7.5 Tf 0.35 0.42 0.48 rg',
      '1 0 0 1 40 806 Tm',
      '(OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION) Tj',
      '1 0 0 1 40 28 Tm',
      `(${escapePdf(`Dataset: ${datasetName} | Halaman ${pIdx + 1}/${pages.length}`)}) Tj`
    ];
    pLines.forEach(ln => {
      y -= ln.leading;
      if (!ln.text.trim() && ln.kind === 'spacer') return;
      cmds.push(ln.kind === 'section' || ln.kind === 'title' ? '0.05 0.28 0.22 rg' : '0.10 0.12 0.16 rg');
      cmds.push(`/${ln.font} ${ln.size} Tf`);
      cmds.push(`1 0 0 1 40 ${y.toFixed(1)} Tm`);
      cmds.push(`(${escapePdf(ln.text)}) Tj`);
    });
    cmds.push('ET');
    const stream = cmds.join('\n');
    objects.push(
      `${pObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cObjNum} 0 R >>\nendobj`
    );
    objects.push(
      `${cObjNum} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  });
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

const fmtSmartAdv = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs === 0) return '0.000';
  if (abs < 10) return n.toFixed(3);
  if (abs < 1000) return n.toFixed(2);
  return n.toFixed(1);
};

const padR = (s: string, w: number): string => {
  const clean = String(s ?? '');
  return clean.length > w ? `${clean.slice(0, Math.max(1, w - 2))}..` : clean.padEnd(w);
};

const padL = (s: string, w: number): string => {
  const clean = String(s ?? '');
  return clean.length > w ? clean.slice(0, w) : clean.padStart(w);
};

const RULE_92 = '-'.repeat(92);

function wrapConsoleLine(prefix: string, body: string, maxWidth = 92): string[] {
  const indent = ' '.repeat(prefix.length);
  const avail = Math.max(20, maxWidth - prefix.length);
  const words = body.split(/\s+/).filter(Boolean);
  if (!words.length) return [prefix.trimEnd()];
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= avail) cur += ` ${w}`;
    else {
      out.push((out.length === 0 ? prefix : indent) + cur);
      cur = w;
    }
  }
  if (cur) out.push((out.length === 0 ? prefix : indent) + cur);
  return out;
}

export interface Option3OrderedStataTableBlock {
  stepId: number;
  stepTitle: string;
  stataCommand: string;
  outputTableText: string;
}

/**
 * Generates clean, fixed-width (<= 92 cols) chronological Stata-style console tables
 * for Option 3 Steps 1 through 9, ready for publication-grade Word (.docx) reporting.
 */
export function buildOption3OrderedStataTables(
  result: AdvPanelFitResult
): Option3OrderedStataTableBlock[] {
  const ds = result.datasetSummary;
  const est = result.estimation;
  const rk = result.ranking;
  const val = result.validation;
  const mc = result.monteCarlo;
  const prof = result.preprocessing;

  const step1 = [
    `. xtset ${ds.entityColumn} ${ds.timeColumn}`,
    '. xtdescribe // Option 3 Step 1: Struktur Panel & Validasi Identifikasi',
    RULE_92,
    `${padR('Parameter Struktur Panel', 38)} | ${padR('Nilai Aktual', 51)}`,
    RULE_92,
    `${padR('Kolom Entitas (i)', 38)} | ${padR(`${ds.entityColumn} (G = ${ds.nEntities} entitas)`, 51)}`,
    `${padR('Kolom Waktu (t)', 38)} | ${padR(`${ds.timeColumn} (T = ${ds.nPeriods} periode)`, 51)}`,
    `${padR('Jumlah Sumber Pengukuran (J)', 38)} | ${padR(`J = ${ds.nSources} sumber dievaluasi setara`, 51)}`,
    `${padR('Baris Complete-Case / Raw', 38)} | ${padR(`${ds.nCompletePairs} CC / ${ds.nRawRows} raw baris`, 51)}`,
    `${padR('Keseimbangan Panel', 38)} | ${padR(ds.isBalanced ? 'Balanced Panel' : 'Unbalanced Panel', 51)}`,
    `${padR('Status Identifikasi Model Laten', 38)} | ${padR(result.autoDecision.overallIdentifiabilityStatus, 51)}`,
    RULE_92
  ].join('\n');

  const step2 = [
    '. * Option 3 Step 2: 12-Component Validity-First Automatic Decision Engine',
    `Hierarchy : Validity -> Identifiability -> Assumptions -> Diagnostics -> Robustness`,
    RULE_92,
    `${padR('Dimensi Keputusan', 34)} | ${padR('Metode Aktif', 34)} | ${padR('Keyakinan', 18)}`,
    RULE_92,
    ...result.autoDecision.decisions.map(
      d =>
        `${padR(d.dimensionLabel, 34)} | ${padR(d.selectedMethod, 34)} | ${padR(d.isOverriddenByUser ? 'MANUAL OVERRIDE' : d.confidenceLevel, 18)}`
    ),
    RULE_92
  ].join('\n');

  const step3 = [
    '. tabstat src_*, stats(n mean sd median mad skew kurt) // Step 3: Panel MAD & Transformasi',
    `Skala Kerja Aktif: ${prof.workingScaleLabel} (Transformasi: ${prof.chosenTransformation})`,
    RULE_92,
    `${padR('Sumber', 22)} | ${padL('N', 5)} ${padL('Mean', 9)} ${padL('SD', 9)} ${padL('Median', 9)} ${padL('MAD', 8)} ${padL('Skew', 6)} ${padL('MADOut', 7)} ${padL('Miss%', 6)}`,
    RULE_92,
    ...prof.sourceProfiles.map(
      sp =>
        `${padR(`${sp.sourceName} ${sp.sourceLabel}`, 22)} | ${padL(String(sp.nValid), 5)} ${padL(fmtSmartAdv(sp.mean), 9)} ${padL(fmtSmartAdv(sp.sd), 9)} ${padL(fmtSmartAdv(sp.median), 9)} ${padL(fmtSmartAdv(sp.mad), 8)} ${padL(sp.skewness.toFixed(2), 6)} ${padL(String(sp.panelMadOutlierCount), 7)} ${padL(`${sp.missingPct.toFixed(1)}%`, 6)}`
    ),
    RULE_92
  ].join('\n');

  const step4 = [
    `. bayes, nchains(${est.mcmcDiagnostics.nChains}) burnin(${est.mcmcDiagnostics.warmupPerChain}): gsem (Theta -> src_*) // Woodbury MCMC`,
    `Vehtari (2021): Split R-hat=${est.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)} | Folded R-hat=${est.mcmcDiagnostics.maxFoldedRhat.toFixed(4)} | Bulk-ESS=${est.mcmcDiagnostics.minBulkEss} | Tail-ESS=${est.mcmcDiagnostics.minTailEss}`,
    RULE_92,
    `${padR('Sumber', 20)} | ${padL('Alpha(a)', 9)} ${padL('Lambda', 7)} ${padL('ErrSD', 8)} ${padL('R_j(s/l)', 9)} ${padL('Rel R2', 7)} ${padL('SplitR', 7)} ${padL('B-ESS', 6)} ${padL('T-ESS', 6)}`,
    RULE_92,
    ...est.sourceParameters.map(sp => {
      const m = est.mcmcDiagnostics.perSource.find(x => x.sourceId === sp.sourceId);
      return `${padR(`${sp.sourceName} ${sp.sourceLabel}`, 20)} | ${padL(fmtSmartAdv(sp.biasAlpha), 9)} ${padL(sp.loadingLambda.toFixed(3), 7)} ${padL(fmtSmartAdv(sp.errorSd), 8)} ${padL(fmtSmartAdv(sp.scaleAdjustedNoiseRatio), 9)} ${padL(`${(sp.reliabilityR2 * 100).toFixed(1)}%`, 7)} ${padL(m ? m.rankNormalizedRhat.toFixed(3) : '-', 7)} ${padL(m ? String(m.bulkEss) : '-', 6)} ${padL(m ? String(m.tailEss) : '-', 6)}`;
    }),
    RULE_92
  ].join('\n');

  const srcShortHdrs = est.sourceParameters.map(sp => padL(sp.sourceName, 8)).join(' ');
  const step5 = [
    '. * Step 5: Seleksi Ketergantungan Galat (M1-M4 Marginal WAIC / PSIS-LOO) & Corr(eps)',
    `Model Terpilih: ${est.activeDependencyModel} | Marginal WAIC=${est.mcmcDiagnostics.marginalWaic.toFixed(2)} | LOO ELPD=${est.mcmcDiagnostics.psisLooElpd.toFixed(2)}`,
    RULE_92,
    `${padR('Kandidat Model', 36)} | ${padR('ID?', 5)} ${padL('dfCov', 6)} ${padL('MargWAIC', 10)} ${padL('LOO-ELPD', 10)} ${padR('Status', 17)}`,
    RULE_92,
    ...est.candidateModels.map(
      cm =>
        `${padR(cm.modelLabel, 36)} | ${padR(cm.isIdentifiable ? 'YA' : 'NO', 5)} ${padL(String(cm.degreesOfFreedomCov), 6)} ${padL(cm.marginalWaic.toFixed(2), 10)} ${padL(cm.looElpd.toFixed(2), 10)} ${padR(cm.selected ? 'SELECTED (*)' : 'Candidate', 17)}`
    ),
    RULE_92,
    `${padR('Corr(eps_a,eps_b)', 20)} | ${srcShortHdrs} ${padL('AR1 rho', 8)}`,
    RULE_92,
    ...est.sourceParameters.map((sp, rIdx) => {
      const cells = (est.residualCorrelationMatrix[rIdx] || [])
        .map(v => padL(v.toFixed(3), 8))
        .join(' ');
      return `${padR(`${sp.sourceName} ${sp.sourceLabel}`, 20)} | ${cells} ${padL(sp.ar1RhoResidual.toFixed(3), 8)}`;
    }),
    RULE_92
  ].join('\n');

  const step6 = [
    '. * Step 6: Pemeringkatan Probabilistik Dual-Estimand & Sensitivitas Multi-Anchor',
    `Verdict: [${rk.verdictStatus}] | Kendall W(TotalRMSE)=${est.anchorSensitivity.kendallWTotalRmse.toFixed(3)} | Kendall W(R_j)=${est.anchorSensitivity.kendallWNoiseRatio.toFixed(3)}`,
    RULE_92,
    `${padR('Rank', 5)} | ${padR('Sumber', 21)} | ${padL('TotRMSE', 8)} ${padL('R_j', 8)} ${padL('P(R=1)', 7)} ${padL('ExpRk', 6)} ${padL('Entr', 6)} ${padL('EntStb', 7)} ${padL('AncShf', 6)}`,
    RULE_92,
    ...rk.rows.map(
      r =>
        `${padR(`#${r.rank}`, 5)} | ${padR(`${r.sourceName} ${r.sourceLabel}`, 21)} | ${padL(fmtSmartAdv(r.anchorTotalRmse), 8)} ${padL(fmtSmartAdv(r.scaleAdjustedNoiseRatio), 8)} ${padL(`${(r.probRank1 * 100).toFixed(1)}%`, 7)} ${padL(r.expectedRank.toFixed(2), 6)} ${padL(r.rankEntropyNormalized.toFixed(3), 6)} ${padL(`${r.entityStabilityPct.toFixed(0)}%`, 7)} ${padL(String(r.maxAnchorRankShift), 6)}`
    ),
    RULE_92
  ].join('\n');

  const step7 = [
    `. xtreg abs_err i.source_num, fe vce(${val.selectedSeMethod}) // + Holm (1979) & Mixed LoA`,
    `Omnibus Pair FE: F = ${val.pairFeOmnibusF.toFixed(3)} | p(asym)=${val.pairFeOmnibusP.toFixed(4)} | p(WildBoot)=${val.pairFeOmnibusWildP.toFixed(4)}`,
    RULE_92,
    `${padR('Kontras Pasangan', 28)} | ${padL('Diff|e|', 8)} ${padL('SE', 8)} ${padL('pWild', 7)} ${padL('pHolm', 7)} ${padR('Sim 95% CI', 19)} ${padR('FWER', 5)}`,
    RULE_92,
    ...val.pairwiseHolmContrasts.map(
      c =>
        `${padR(`${c.sourceALabel}-${c.sourceBLabel}`, 28)} | ${padL(fmtSmartAdv(c.diffAbsErrorAminusB), 8)} ${padL(fmtSmartAdv(c.seSelected), 8)} ${padL(c.pWildBootstrap.toFixed(4), 7)} ${padL(c.pHolmAdjusted.toFixed(4), 7)} ${padR(`[${fmtSmartAdv(c.simultaneous95Ci[0])},${fmtSmartAdv(c.simultaneous95Ci[1])}]`, 19)} ${padR(c.significantFamilywise05 ? 'SIG' : 'NS', 5)}`
    ),
    RULE_92,
    `${padR('LOSO & Mixed-LoA', 22)} | ${padL('LOSO-MAE', 9)} ${padL('LOSO-RMSE', 9)} ${padL('CovAudit', 9)} ${padL('LinCCC', 7)} ${padL('MixLoAW', 9)} ${padL('NaiveW', 9)}`,
    RULE_92,
    ...val.losoEntries.map(l => {
      const rm = val.repeatedMeasuresAgreement.find(a => a.sourceId === l.leftOutSourceId);
      return `${padR(l.leftOutSourceLabel, 22)} | ${padL(fmtSmartAdv(l.losoPredictiveMae), 9)} ${padL(fmtSmartAdv(l.losoPredictiveRmse), 9)} ${padL(fmtSmartAdv(l.covarianceTermAudit), 9)} ${padL(rm ? rm.linsCcc.toFixed(4) : '-', 7)} ${padL(rm ? fmtSmartAdv(rm.mixedEffectsLoaWidth) : '-', 9)} ${padL(rm ? fmtSmartAdv(rm.naivePooledLoaWidth) : '-', 9)}`;
    }),
    RULE_92
  ].join('\n');

  const step8 = [
    `. simulate, reps(${mc.scenarios[0]?.replications ?? 30}): sim_panel_latent_mc // 7-Family ADEMP`,
    `Kalibrasi: G=${mc.calibratedDimensions.G}, T=${mc.calibratedDimensions.T}, J=${mc.calibratedDimensions.J} | Mean Rank #1 Recovery=${mc.meanRankingRecoveryPct.toFixed(1)}% | Mean Cov95=${mc.meanCoverage95Pct.toFixed(1)}%`,
    RULE_92,
    `${padR('Skenario Monte Carlo', 38)} | ${padL('Bias', 7)} ${padL('Cov95%', 7)} ${padL('Rk1Rec', 7)} ${padL('T1/Pwr', 8)} ${padL('FailID', 7)}`,
    RULE_92,
    ...mc.scenarios.map(
      s =>
        `${padR(s.scenarioTitle, 38)} | ${padL(s.parameterBiasMean.toFixed(3), 7)} ${padL(`${s.interval95CoveragePct.toFixed(1)}%`, 7)} ${padL(`${s.top1RankingRecoveryPct.toFixed(1)}%`, 7)} ${padL(s.empiricalTypeIErrorPct > 0 ? `T${s.empiricalTypeIErrorPct.toFixed(0)}%` : `P${s.empiricalPowerPct.toFixed(0)}%`, 8)} ${padL(`${s.identificationFailurePct.toFixed(0)}%`, 7)}`
    ),
    RULE_92
  ].join('\n');

  const step9 = [
    '. * Step 9: Sintesis Pembuktian Lintas-Metode & Ringkasan Reproduksibilitas',
    RULE_92,
    `${padR('Tahap Metode', 34)} | ${padR('Status', 8)} | ${padR('Metrik Kunci', 44)}`,
    RULE_92,
    ...result.scientificConclusion.whySelectedEvidence.map(
      ev => `${padR(ev.stageLabel, 34)} | ${padR(ev.status, 8)} | ${padR(ev.keyMetricBadge, 44)}`
    ),
    RULE_92,
    ...wrapConsoleLine('Kesimpulan Akhir: ', result.scientificConclusion.finalNarrativeConclusion, 92),
    RULE_92
  ].join('\n');

  return [
    { stepId: 1, stepTitle: 'Step 1 — Struktur Panel & Validasi Identifikasi', stataCommand: 'xtset / xtdescribe', outputTableText: step1 },
    { stepId: 2, stepTitle: 'Step 2 — Keputusan Otomatis 12 Komponen Metodologi', stataCommand: 'auto_decision_engine', outputTableText: step2 },
    { stepId: 3, stepTitle: 'Step 3 — Audit Panel MAD/IQR & Skala Kerja', stataCommand: 'tabstat / panel_mad', outputTableText: step3 },
    { stepId: 4, stepTitle: 'Step 4 — Model Laten Bayesian Woodbury & Diagnostik Vehtari (2021)', stataCommand: 'bayes: gsem', outputTableText: step4 },
    { stepId: 5, stepTitle: 'Step 5 — Seleksi Struktur Error M1-M4 (WAIC/LOO) & Korelasi Residual', stataCommand: 'gsem / pwcorr res_*', outputTableText: step5 },
    { stepId: 6, stepTitle: 'Step 6 — Pemeringkatan Probabilistik Dual-Estimand & Multi-Anchor', stataCommand: 'nlcom / anchor_loop', outputTableText: step6 },
    { stepId: 7, stepTitle: 'Step 7 — Validasi LOSO, Pair FE (Holm 1979) & Mixed-Effects LoA', stataCommand: 'xtreg, fe / mtest(holm) / mixed', outputTableText: step7 },
    { stepId: 8, stepTitle: 'Step 8 — Validasi Simulasi Monte Carlo 7 Keluarga', stataCommand: 'simulate', outputTableText: step8 },
    { stepId: 9, stepTitle: 'Step 9 — Sintesis Keputusan Multi-Metode & Reproduksibilitas', stataCommand: 'estimates table', outputTableText: step9 }
  ];
}

function docH1(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: '0F2942'
      })
    ],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 110 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '1D4ED8' }
    }
  });
}

function docH2(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 21,
        color: '065F46'
      })
    ],
    spacing: { before: 180, after: 80 }
  });
}

function docPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, color: '1E293B' })],
    spacing: { after: 100, line: 276 }
  });
}

function docMonoBlock(title: string, content: string): Paragraph[] {
  const lines = content.split('\n');
  return [
    docH2(title),
    new Paragraph({
      children: lines.flatMap((line, idx) => [
        new TextRun({
          text: line,
          font: 'Courier New',
          size: 16,
          color: '0F172A'
        }),
        ...(idx < lines.length - 1 ? [new TextRun({ break: 1 })] : [])
      ]),
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
      border: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 12, color: '0F766E' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      },
      spacing: { before: 60, after: 140, line: 220 }
    })
  ];
}

function docTable(
  headers: string[],
  rows: string[][],
  rightAlignCols: number[] = []
): Table {
  const borderSpec = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
  };
  const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 };
  const rightSet = new Set(rightAlignCols);

  const mkHeaderCell = (text: string, colIdx: number) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: rightSet.has(colIdx) ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: true, size: 18, color: 'FFFFFF' })]
        })
      ],
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F2942' },
      margins: cellMargins,
      borders: borderSpec
    });

  const mkDataCell = (text: string, rowIdx: number, colIdx: number) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: rightSet.has(colIdx) ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, size: 17, color: '0F172A' })]
        })
      ],
      shading: {
        type: ShadingType.CLEAR,
        color: 'auto',
        fill: rowIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF'
      },
      margins: cellMargins,
      borders: borderSpec
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, cIdx) => mkHeaderCell(h, cIdx))
      }),
      ...rows.map(
        (r, rIdx) =>
          new TableRow({
            children: r.map((c, cIdx) => mkDataCell(c, rIdx, cIdx))
          })
      )
    ]
  });
}

export async function generateOption3Docx(
  result: AdvPanelFitResult,
  datasetName = 'Option3_Panel_Accuracy.xlsx'
): Promise<Buffer> {
  const orderedStata = buildOption3OrderedStataTables(result);
  const topRunner = result.scientificConclusion.topVsRunnerUp;
  const est = result.estimation;
  const rk = result.ranking;
  const val = result.validation;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION',
                    size: 16,
                    color: '64748B'
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${datasetName}   |   Halaman `, size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                  new TextRun({ text: ' dari ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' })
                ]
              })
            ]
          })
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'LAPORAN OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION',
                bold: true,
                size: 30,
                color: '0F2942'
              })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Komparasi Bayesian Multi-Sumber Lanjutan Tanpa Ground Truth — Laporan Lengkap Step 1 s.d. Step 9',
                bold: true,
                size: 21,
                color: '065F46'
              })
            ],
            spacing: { after: 140 }
          }),

          // Executive Metadata Summary Table
          docTable(
            ['Parameter Ringkasan', 'Nilai Aktual'],
            [
              ['Dataset', datasetName],
              [
                'Mesin Komputasi',
                'Option 3 Marginalized Woodbury Bayesian MCMC + Diagnostik Vehtari (2021) + WAIC/PSIS-LOO + Multi-Anchor Sensitivity + Pair FE Holm (1979) & Webb Wild Bootstrap + Mixed-Effects LoA + Monte Carlo 7 Keluarga'
              ],
              [
                'Sumber Dievaluasi (J Setara)',
                result.preprocessing.sourceProfiles.map(s => `${s.sourceName} (${s.sourceLabel})`).join(', ')
              ],
              [
                'Struktur Panel (G × T)',
                `G = ${result.datasetSummary.nEntities} entitas × T = ${result.datasetSummary.nPeriods} periode (${result.datasetSummary.isBalanced ? 'Balanced' : 'Unbalanced'})`
              ],
              [
                'Sampel Complete-Case / Raw',
                `${result.datasetSummary.nCompletePairs} / ${result.datasetSummary.nRawRows} baris`
              ],
              [
                'Skala Kerja & Transformasi',
                `${result.datasetSummary.workingScaleLabel} (${result.autoDecision.activeConfig.transformation})`
              ],
              [
                'Konvergensi Vehtari (2021)',
                `Max Split R-hat = ${est.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)} | Folded R-hat = ${est.mcmcDiagnostics.maxFoldedRhat.toFixed(4)} | Bulk-ESS = ${est.mcmcDiagnostics.minBulkEss} | Tail-ESS = ${est.mcmcDiagnostics.minTailEss} | PPP = ${est.mcmcDiagnostics.posteriorPredictivePValue.toFixed(3)}`
              ],
              [
                'Struktur Laten & Ketergantungan',
                `${est.activeLatentStructure} | ${est.activeDependencyModel} (Marginal WAIC = ${est.mcmcDiagnostics.marginalWaic.toFixed(2)})`
              ],
              ['Status Keputusan Ranking', rk.verdictStatus],
              [
                'Kandidat Terbaik Relatif (#1)',
                result.scientificConclusion.selectedVariableName || rk.leaderSourceLabel || 'Belum Dapat Ditetapkan Secara Mutlak'
              ]
            ]
          ),

          // STEP 1-2
          docH1('Step 1–2. Validasi Struktur Panel, Identifiabilitas & Keputusan Otomatis 12 Komponen'),
          docPara(
            `${result.autoDecision.summaryHeadline} Hierarki pemilihan otomatis: ${result.autoDecision.hierarchyRule}. Status identifikasi global: ${result.autoDecision.overallIdentifiabilityStatus} (${result.autoDecision.hasManualOverrides ? 'terdapat manual override pengguna' : 'seluruh keputusan murni otomatis berdasarkan profil data'}).`
          ),
          docTable(
            ['Dimensi Keputusan', 'Metode Terpilih', 'Keyakinan', 'Basis Empiris & Alasan Pemilihan'],
            result.autoDecision.decisions.map(d => [
              d.dimensionLabel,
              d.selectedMethod,
              d.isOverriddenByUser ? 'MANUAL OVERRIDE' : d.confidenceLevel,
              `${d.whySelected} (${d.empiricalDataBasis})`
            ])
          ),

          // STEP 3
          docH1('Step 3. Profil Deskriptif, Audit Pencilan Panel MAD/IQR & Evaluasi 10 Transformasi'),
          docTable(
            ['Sumber', 'N', 'Mean', 'SD', 'Median', 'MAD', 'Skew', 'MAD Out.', 'Miss (%)'],
            result.preprocessing.sourceProfiles.map(sp => [
              `${sp.sourceName} (${sp.sourceLabel})`,
              String(sp.nValid),
              fmtSmartAdv(sp.mean),
              fmtSmartAdv(sp.sd),
              fmtSmartAdv(sp.median),
              fmtSmartAdv(sp.mad),
              sp.skewness.toFixed(2),
              String(sp.panelMadOutlierCount),
              `${sp.missingPct.toFixed(1)}%`
            ]),
            [1, 2, 3, 4, 5, 6, 7, 8]
          ),
          docPara(result.preprocessing.whyNotDefaultGrubbsNote),
          docH2('Evaluasi 10 Kandidat Skala & Transformasi (Estimand-First)'),
          docTable(
            ['Kandidat', 'Pelestarian Estimand', 'Layak', 'Skor Norm.', '|t| Hetero', 'Status & Alasan'],
            result.preprocessing.transformationEvaluations.map(tr => [
              tr.selected ? `${tr.label} (*)` : tr.label,
              tr.estimandPreservation,
              tr.eligible ? 'YA' : 'TIDAK',
              tr.eligible ? tr.centralNormalityScore.toFixed(3) : '-',
              tr.eligible ? tr.proportionalHeteroscedasticityAbsT.toFixed(2) : '-',
              tr.eligible ? tr.decisionReason : tr.ineligibleReason || 'Tidak memenuhi syarat domain'
            ]),
            [3, 4]
          ),

          // STEP 4
          docH1('Step 4. Model Pengukuran Laten Bayesian (Woodbury MCMC) & Diagnostik Vehtari (2021)'),
          docTable(
            ['Sumber', 'Alpha (α)', 'Lambda (λ)', 'Error SD (σ_ε)', 'R_j = σ/|λ|', 'Rel R²', 'Split R-hat', 'Bulk/Tail ESS'],
            est.sourceParameters.map(sp => {
              const mc = est.mcmcDiagnostics.perSource.find(x => x.sourceId === sp.sourceId);
              return [
                `${sp.sourceName} (${sp.sourceLabel})`,
                `${sp.biasAlpha >= 0 ? '+' : ''}${fmtSmartAdv(sp.biasAlpha)}`,
                sp.loadingLambda.toFixed(3),
                fmtSmartAdv(sp.errorSd),
                fmtSmartAdv(sp.scaleAdjustedNoiseRatio),
                `${(sp.reliabilityR2 * 100).toFixed(2)}%`,
                mc ? mc.rankNormalizedRhat.toFixed(4) : '-',
                mc ? `${mc.bulkEss} / ${mc.tailEss}` : '-'
              ];
            }),
            [1, 2, 3, 4, 5, 6, 7]
          ),
          docPara(
            `${est.mcmcDiagnostics.convergenceNote} Dekomposisi varians sinyal laten θ_it: Antar-Entitas = ${est.latentVarianceDecomposition.betweenEntitySharePct.toFixed(1)}%, Antar-Periode = ${est.latentVarianceDecomposition.betweenTimeSharePct.toFixed(1)}%, Persistensi Temporal AR(1) φ = ${est.latentVarianceDecomposition.temporalPersistencePhi.toFixed(3)}.`
          ),
          docH2('Audit Sensitivitas 3 Keluarga Prior Bayesian (van Erp et al., 2018)'),
          docTable(
            ['Keluarga Prior', 'Kandidat #1', 'Pergeseran Maks σ (%)', 'Konkordan dgn Primer?'],
            est.priorSensitivity.map(pr => [
              pr.priorStrategy,
              est.sourceParameters.find(s => s.sourceId === pr.topSourceId)?.sourceLabel || pr.topSourceId,
              `${pr.maxAbsParameterShiftPct.toFixed(2)}%`,
              pr.rankConcordantWithPrimary ? 'YA (Stabil)' : 'BERGESER'
            ]),
            [2]
          ),

          // STEP 5
          docH1('Step 5. Struktur Ketergantungan Galat (M1–M4 WAIC/LOO) & Korelasi Residual'),
          docTable(
            ['Kandidat Model', 'Teridentifikasi', 'df_cov', 'Marginal WAIC', 'PSIS-LOO ELPD', 'Status & Alasan'],
            est.candidateModels.map(cm => [
              cm.selected ? `${cm.modelLabel} (*)` : cm.modelLabel,
              cm.isIdentifiable ? 'YA' : 'TIDAK',
              String(cm.degreesOfFreedomCov),
              cm.marginalWaic.toFixed(2),
              cm.looElpd.toFixed(2),
              cm.selectionReason
            ]),
            [2, 3, 4]
          ),
          docH2('Matriks Korelasi Residual Antarsumber Corr(ε̂_a, ε̂_b) & Autokorelasi AR(1)'),
          docTable(
            ['Sumber', ...est.sourceParameters.map(s => s.sourceName), 'AR(1) ρ_j', 'Ent-Src RE SD'],
            est.sourceParameters.map((sp, rIdx) => [
              `${sp.sourceName} (${sp.sourceLabel})`,
              ...(est.residualCorrelationMatrix[rIdx] || []).map(v => v.toFixed(3)),
              sp.ar1RhoResidual.toFixed(3),
              fmtSmartAdv(sp.entitySourceReSd)
            ]),
            Array.from({ length: est.sourceParameters.length + 2 }, (_, idx) => idx + 1)
          ),

          // STEP 6
          docH1(`Step 6. Pemeringkatan Probabilistik (#1 s/d #${rk.rows.length}) & Sensitivitas Multi-Anchor`),
          docTable(
            ['Rank', 'Sumber', 'Anchor Total RMSE [95% CrI]', 'R_j = σ/|λ|', 'P(R=1)', 'E[Rank]', 'Entropi', 'Stab Ent/Wkt', 'Anchor Shift'],
            rk.rows.map(r => [
              `#${r.rank}`,
              `${r.sourceName} (${r.sourceLabel})`,
              `${fmtSmartAdv(r.anchorTotalRmse)} [${fmtSmartAdv(r.anchorTotalRmseCrI[0])}, ${fmtSmartAdv(r.anchorTotalRmseCrI[1])}]`,
              fmtSmartAdv(r.scaleAdjustedNoiseRatio),
              `${(r.probRank1 * 100).toFixed(1)}%`,
              r.expectedRank.toFixed(2),
              r.rankEntropyNormalized.toFixed(3),
              `${r.entityStabilityPct.toFixed(0)}% / ${r.temporalStabilityPct.toFixed(0)}%`,
              String(r.maxAnchorRankShift)
            ]),
            [2, 3, 4, 5, 6, 7, 8]
          ),
          docPara(est.anchorSensitivity.interpretation),
          docH2(`Evaluasi Lintas ${est.anchorSensitivity.evaluatedAnchors.length} Rezim Anchor`),
          docTable(
            ['Rezim Anchor', 'Formula Konstrain', 'Top #1 by R_j (Invarian)', 'Top #1 by Total RMSE'],
            est.anchorSensitivity.evaluatedAnchors.map(a => [
              a.anchorLabel,
              a.constraintFormula,
              est.sourceParameters.find(s => s.sourceId === a.topRankedByPrecisionRatioId)?.sourceLabel || a.topRankedByPrecisionRatioId,
              est.sourceParameters.find(s => s.sourceId === a.topRankedByTotalRmseId)?.sourceLabel || a.topRankedByTotalRmseId
            ])
          ),

          // STEP 7
          docH1('Step 7. Validasi LOSO, Pair Fixed Effects (Holm 1979) & Mixed-Effects Bland-Altman LoA'),
          docH2('7A. Leave-One-Source-Out (LOSO) & Audit Suku Kovarians'),
          docTable(
            ['Sumber Dikeluarkan', 'Corr dgn θ_full', 'LOSO MAE', 'LOSO RMSE', 'Audit 2λCov', 'Debiased σ / Full σ', 'Peer Stabil?'],
            val.losoEntries.map(l => [
              l.leftOutSourceLabel,
              l.latentCorrelationWithFull.toFixed(4),
              fmtSmartAdv(l.losoPredictiveMae),
              fmtSmartAdv(l.losoPredictiveRmse),
              fmtSmartAdv(l.covarianceTermAudit),
              `${fmtSmartAdv(l.debiasedImpliedErrorSd)} / ${fmtSmartAdv(l.fullModelErrorSd)}`,
              l.rankChangedAmongPeers ? 'Bergeser' : 'Stabil'
            ]),
            [1, 2, 3, 4, 5]
          ),
          docPara(val.losoVarianceFormulaNote),

          docH2('7B. Kontras Berpasangan Pair Fixed Effects + Koreksi Holm (1979) & Wild Bootstrap'),
          docTable(
            ['Kontras (A vs B)', 'Diff |e|', `SE (${val.selectedSeMethod})`, 'p WildBoot', 'p Holm', 'Simultaneous 95% CI', 'FWER 5%'],
            val.pairwiseHolmContrasts.map(c => [
              `${c.sourceALabel} vs ${c.sourceBLabel}`,
              fmtSmartAdv(c.diffAbsErrorAminusB),
              fmtSmartAdv(c.seSelected),
              c.pWildBootstrap.toFixed(4),
              c.pHolmAdjusted.toFixed(4),
              `[${fmtSmartAdv(c.simultaneous95Ci[0])}, ${fmtSmartAdv(c.simultaneous95Ci[1])}]`,
              c.significantFamilywise05 ? 'SIGNIFIKAN' : 'TIDAK SIG.'
            ]),
            [1, 2, 3, 4, 5]
          ),
          docPara(
            `${val.seSelectionRationale} Uji Omnibus Pair FE menghasilkan F = ${val.pairFeOmnibusF.toFixed(3)} (p asimtotik = ${val.pairFeOmnibusP.toFixed(4)}, p Wild Bootstrap = ${val.pairFeOmnibusWildP.toFixed(4)}).`
          ),

          docH2('7C. Repeated-Measures Mixed-Effects Bland-Altman LoA & Lin’s CCC (Parker et al., 2020)'),
          docTable(
            ['Sumber', 'Lin CCC [95% CI]', 'Within r', 'SD Betw/With', 'Mixed 95% LoA', 'Lebar Mixed vs Naive'],
            val.repeatedMeasuresAgreement.map(rm => [
              rm.sourceLabel,
              `${rm.linsCcc.toFixed(4)} [${rm.linsCccCi[0].toFixed(3)}, ${rm.linsCccCi[1].toFixed(3)}]`,
              rm.withinEntityR.toFixed(4),
              `${fmtSmartAdv(rm.betweenEntityDiffSd)} / ${fmtSmartAdv(rm.withinEntityDiffSd)}`,
              `[${fmtSmartAdv(rm.mixedEffectsLoaLower)}, ${fmtSmartAdv(rm.mixedEffectsLoaUpper)}]`,
              `${fmtSmartAdv(rm.mixedEffectsLoaWidth)} vs ${fmtSmartAdv(rm.naivePooledLoaWidth)}`
            ]),
            [1, 2, 3, 4, 5]
          ),

          // STEP 8
          docH1('Step 8. Validasi Simulasi Monte Carlo 7 Keluarga & Audit Common-Mode Bias'),
          docPara(result.monteCarlo.overallValidationSummary),
          docTable(
            ['Skenario Monte Carlo', 'Bias σ', 'Cov 95%', 'Rank #1 Rec.', 'Type I / Power', 'Gagal ID', 'Interpretasi'],
            result.monteCarlo.scenarios.map(s => [
              s.scenarioTitle,
              s.parameterBiasMean.toFixed(3),
              `${s.interval95CoveragePct.toFixed(1)}%`,
              `${s.top1RankingRecoveryPct.toFixed(1)}%`,
              s.empiricalTypeIErrorPct > 0 ? `T1: ${s.empiricalTypeIErrorPct}%` : `Pwr: ${s.empiricalPowerPct}%`,
              `${s.identificationFailurePct.toFixed(0)}%`,
              s.interpretation
            ]),
            [1, 2, 3, 4, 5]
          ),
          docH2('Audit 10 Skenario Batas Epistemologis Common-Mode Bias'),
          docTable(
            ['Kode', 'Skenario Bias Bersama', 'Terdeteksi #1', 'Terbaik Fisik', 'Terdeteksi Tanpa GT?', 'Temuan Epistemologis'],
            rk.commonModeBiasScenarios.map(cm => [
              cm.scenarioCode,
              cm.title,
              cm.detectedTopSourceLabel,
              cm.trueBestUnderSimulationLabel,
              cm.biasesRecoverableWithoutGroundTruth ? 'PARSIAL' : 'TIDAK (Butuh GT)',
              cm.epistemologicalFinding
            ])
          ),

          // STEP 9A
          docH1('Step 9A. Pembuktian Lintas-Metode ("Mengapa Variabel Terpilih?") & Kesimpulan Akhir'),
          docPara(result.scientificConclusion.headline),
          docPara(result.scientificConclusion.finalNarrativeConclusion),
          ...(topRunner
            ? [
                docH2(`Ringkasan Head-to-Head: ${topRunner.topSourceLabel} (#1) vs ${topRunner.runnerUpSourceLabel || 'Pesaing'} (#2)`),
                docTable(
                  ['Metrik Evaluasi', `${topRunner.topSourceLabel} (#1)`, `${topRunner.runnerUpSourceLabel || 'Peringkat #2'}`],
                  [
                    ['Anchor Total RMSE', fmtSmartAdv(topRunner.topTotalRmse), fmtSmartAdv(topRunner.runnerUpTotalRmse)],
                    ['Scale-Invariant Noise Ratio R_j = σ/|λ|', fmtSmartAdv(topRunner.topNoiseRatio), fmtSmartAdv(topRunner.runnerUpNoiseRatio)],
                    ['Error SD (σ_ε)', fmtSmartAdv(topRunner.topErrorSd), fmtSmartAdv(topRunner.runnerUpErrorSd)],
                    ['Reliabilitas R² (%)', `${topRunner.topReliabilityR2Pct.toFixed(2)}%`, topRunner.runnerUpReliabilityR2Pct !== null ? `${topRunner.runnerUpReliabilityR2Pct.toFixed(2)}%` : '-'],
                    ['Peluang Posterior P(Rank=1)', `${topRunner.topProbRank1Pct.toFixed(1)}%`, topRunner.runnerUpProbRank1Pct !== null ? `${topRunner.runnerUpProbRank1Pct.toFixed(1)}%` : '-'],
                    ['Lin’s CCC', topRunner.topCcc !== null ? topRunner.topCcc.toFixed(4) : '-', topRunner.runnerUpCcc !== null ? topRunner.runnerUpCcc.toFixed(4) : '-'],
                    ['Lebar Mixed-Effects 95% LoA', fmtSmartAdv(topRunner.topMixedLoaWidth), fmtSmartAdv(topRunner.runnerUpMixedLoaWidth)],
                    ['Uji Pair FE Holm (#1 vs #2)', topRunner.holmPValueVsRunnerUp !== null ? `p_Holm = ${topRunner.holmPValueVsRunnerUp.toFixed(4)}` : '-', topRunner.holmSignificantVsRunnerUp === null ? '-' : topRunner.holmSignificantVsRunnerUp ? 'Signifikan (α_FWER = 5%)' : 'Belum Signifikan']
                  ],
                  [1, 2]
                )
              ]
            : []),
          docH2(`Rincian 6 Tahap Pembuktian Lintas Metode (${result.scientificConclusion.passedMethodsCount}/${result.scientificConclusion.totalMethodsCount} Lulus Penuh)`),
          docTable(
            ['Tahap & Metode', 'Status', 'Metrik Kunci', 'Temuan & Kontribusi Keputusan'],
            result.scientificConclusion.whySelectedEvidence.map(ev => [
              `${ev.stageLabel}\n(${ev.methodName})`,
              ev.status,
              ev.keyMetricBadge,
              `${ev.finding} ${ev.selectionReason}`
            ])
          ),
          docH2('Keterbatasan Epistemologis & Metodologis'),
          ...result.scientificConclusion.keyLimitations.map(lim => docPara(`- ${lim}`)),
          docPara(result.scientificConclusion.epistemologicalGroundTruthBoundary),

          // STEP 9B
          docH1('Step 9B. Output Tabel Stata Terurut (Step 1 s.d. Step 9)'),
          ...orderedStata.flatMap(st =>
            docMonoBlock(`${st.stepTitle} (. ${st.stataCommand})`, st.outputTableText)
          ),

          // LAMPIRAN
          docH1('Lampiran. Kode Reproduksibilitas Lengkap (Stata .do, Stan .stan, & R .R)'),
          ...docMonoBlock('Master Stata 17/18 Do-File (.do)', result.masterStataDoFile),
          ...docMonoBlock('Companion Bayesian Stan Model (.stan)', result.companionStanCode),
          ...docMonoBlock('Companion R Script (.R)', result.companionRScript)
        ]
      }
    ]
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}
