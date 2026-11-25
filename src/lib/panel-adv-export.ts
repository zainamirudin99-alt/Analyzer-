// ============================================================
// OPTION 3 — Multi-Format Academic Report Exporters (PDF 1.4, DOCX, XLSX, CSV)
// Formula-Injection Safe & Chronologically Ordered Steps 1–9
// ============================================================

import {
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
    ['Sintesis Keandalan Relatif', result.scientificConclusion.relativeReliabilitySummary],
    ['Batas Ground Truth', result.scientificConclusion.epistemologicalGroundTruthBoundary],
    ...result.scientificConclusion.keyLimitations.map((l, idx) => [`Batasan ${idx + 1}`, l])
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

  pushSection('1. KESIMPULAN ILMIAH & BATAS EPISTEMOLOGIS GROUND TRUTH');
  pushBody(result.scientificConclusion.headline);
  pushBody(result.scientificConclusion.relativeReliabilitySummary);
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

function docHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: '065F46' })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '059669' } }
  });
}

function docPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, color: '1E293B' })],
    spacing: { after: 90, line: 270 }
  });
}

function docTable(headers: string[], rows: string[][]): Table {
  const bSpec = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          h =>
            new TableCell({
              borders: bSpec,
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'ECFDF5' },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: '064E3B' })] })]
            })
        )
      }),
      ...rows.map(
        r =>
          new TableRow({
            children: r.map(
              c =>
                new TableCell({
                  borders: bSpec,
                  children: [new Paragraph({ children: [new TextRun({ text: c, size: 18, color: '1E293B' })] })]
                })
            )
          })
      )
    ]
  });
}

export async function generateOption3Docx(
  result: AdvPanelFitResult,
  datasetName = 'Option3_Panel_Accuracy.xlsx'
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Option 3: Advanced Latent Measurement Model — ${datasetName}`,
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
                children: [
                  new TextRun({ text: 'Halaman ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' })
                ]
              })
            ]
          })
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'OPTION 3: ADVANCED LATENT MEASUREMENT MODEL & PANEL ACCURACY VALIDATION',
                bold: true,
                size: 28,
                color: '064E3B'
              })
            ],
            spacing: { after: 120 }
          }),
          docPara(
            `Dataset: ${datasetName} | Entitas G=${result.datasetSummary.nEntities}, Periode T=${result.datasetSummary.nPeriods}, Sumber J=${result.datasetSummary.nSources}, Complete-Case N=${result.datasetSummary.nCompletePairs} | Skala Kerja: ${result.datasetSummary.workingScaleLabel}`
          ),
          docHeading('1. Kesimpulan Ilmiah & Batas Epistemologis'),
          docPara(result.scientificConclusion.headline),
          docPara(result.scientificConclusion.relativeReliabilitySummary),
          docPara(result.scientificConclusion.epistemologicalGroundTruthBoundary),

          docHeading('2. Keputusan Otomatis 12 Komponen Metodologi (Step 2)'),
          docTable(
            ['Dimensi', 'Metode Terpilih', 'Keyakinan', 'Basis Empiris'],
            result.autoDecision.decisions.map(d => [
              d.dimensionLabel,
              d.selectedMethod,
              d.confidenceLevel,
              d.empiricalDataBasis
            ])
          ),

          docHeading('3. Pemeringkatan Probabilistik & Ketidakpastian Posterior (Step 6)'),
          docTable(
            ['Rank', 'Sumber', 'Total RMSE [95% CrI]', 'R_j = σ/|λ|', 'P(R=1)%', 'E[Rank]', 'Entropi', 'Anchor Shift'],
            result.ranking.rows.map(r => [
              String(r.rank),
              `${r.sourceName} (${r.sourceLabel})`,
              `${fmt(r.anchorTotalRmse, 4)} [${fmt(r.anchorTotalRmseCrI[0], 4)}, ${fmt(r.anchorTotalRmseCrI[1], 4)}]`,
              fmt(r.scaleAdjustedNoiseRatio, 4),
              `${fmt(r.probRank1 * 100, 1)}%`,
              fmt(r.expectedRank, 2),
              fmt(r.rankEntropyNormalized, 3),
              String(r.maxAnchorRankShift)
            ])
          ),

          docHeading('4. Kontras Pair Fixed Effects Terkoreksi Holm & Mixed-Effects LoA (Step 7)'),
          docTable(
            ['Kontras', 'Diff |e|', 'SE', 'p Wild', 'p Holm', 'Sim 95% CI', 'Signifikan?'],
            result.validation.pairwiseHolmContrasts.map(c => [
              `${c.sourceALabel} vs ${c.sourceBLabel}`,
              fmt(c.diffAbsErrorAminusB, 4),
              fmt(c.seSelected, 4),
              fmt(c.pWildBootstrap, 4),
              fmt(c.pHolmAdjusted, 4),
              `[${fmt(c.simultaneous95Ci[0], 4)}, ${fmt(c.simultaneous95Ci[1], 4)}]`,
              c.significantFamilywise05 ? 'YA' : 'TIDAK'
            ])
          ),

          docHeading('5. Validasi Simulasi Monte Carlo 7 Keluarga (Step 8)'),
          docPara(result.monteCarlo.overallValidationSummary),
          docTable(
            ['Skenario', 'Bias', 'Cakupan 95%', 'Rank #1 Recovery', 'Type I / Power', 'Gagal ID'],
            result.monteCarlo.scenarios.map(s => [
              s.scenarioTitle,
              fmt(s.parameterBiasMean, 4),
              `${fmt(s.interval95CoveragePct, 1)}%`,
              `${fmt(s.top1RankingRecoveryPct, 1)}%`,
              s.empiricalTypeIErrorPct > 0 ? `T1: ${s.empiricalTypeIErrorPct}%` : `Pwr: ${s.empiricalPowerPct}%`,
              `${fmt(s.identificationFailurePct, 1)}%`
            ])
          ),

          docHeading('6. Literatur Ilmiah Terverifikasi'),
          ...result.literature.map(lit =>
            docPara(`${lit.authors} (${lit.year}). ${lit.title}. ${lit.journal}, ${lit.volumePages}. DOI: ${lit.doi}`)
          ),

          docHeading('7. Kode Reproduksibilitas Master Stata 17/18 (.do)'),
          new Paragraph({
            children: result.masterStataDoFile.split('\n').flatMap((ln, i, arr) => [
              new TextRun({ text: ln, font: 'Courier New', size: 15, color: '0F172A' }),
              ...(i < arr.length - 1 ? [new TextRun({ break: 1 })] : [])
            ]),
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' }
          })
        ]
      }
    ]
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}
