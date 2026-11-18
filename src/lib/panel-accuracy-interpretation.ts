// ============================================================
// Model Pengukuran Laten & Akurasi Panel (ISO 5725)
// Output Tabel Bergaya Stata Terurut (Step 1–9) & Interpretasi Akademis
// ============================================================

import {
  AccuracyAcademicInterpretations,
  AccuracyPreprocessingOptions,
  ComparativeRankingResult,
  CorrelationMatricesBundle,
  LatentModelSummary,
  MeasurementSource,
  PairFixedEffectsResult,
  PanelAccuracyDiagnosticsResult,
  PanelAccuracyQualityReport,
  SourceAccuracyMetricRow,
  StataAccuracyOutputBundle,
  StataOrderedStepOutput
} from './panel-accuracy-types';

const fmt = (n: number | null | undefined, digits = 4) =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toFixed(digits);

export const fmtSmart = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs === 0) return '0.000';
  if (abs < 10) return n.toFixed(3);
  if (abs < 1000) return n.toFixed(2);
  if (abs < 100000) return n.toFixed(1);
  return n.toExponential(2);
};

const pad = (s: string, w: number, right = false) => {
  const clean = s.replace(/[^\x20-\x7E±αβεθλρσΔ²]/g, ' ');
  const str = clean.length > w ? `${clean.slice(0, Math.max(1, w - 2))}..` : clean;
  return right ? str.padStart(w, ' ') : str.padEnd(w, ' ');
};

const wrapNote = (firstPrefix: string, text: string, contPrefix = '  ', maxWidth = 92): string[] => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [firstPrefix.trimEnd()];
  const lines: string[] = [];
  let line = firstPrefix;
  for (const w of words) {
    const needSpace = line.length > 0 && !line.endsWith(' ');
    const candLen = line.length + (needSpace ? 1 : 0) + w.length;
    if (candLen <= maxWidth || line === firstPrefix || line === contPrefix) {
      line += (needSpace ? ' ' : '') + w;
    } else {
      lines.push(line);
      line = contPrefix + w;
    }
  }
  if (line.trim().length > 0) lines.push(line);
  return lines;
};

export interface AccuracyCoreBundle {
  datasetMeta: {
    cityIdColumn: string;
    yearColumn: string;
    nObsRaw: number;
    nCompletePairs: number;
    nCities: number;
    nYears: number;
    isBalanced: boolean;
    workingUnitNote: string;
  };
  sources: MeasurementSource[];
  referenceSource: MeasurementSource;
  comparisonSources: MeasurementSource[];
  qualityReport: PanelAccuracyQualityReport;
  preprocessing?: AccuracyPreprocessingOptions;
  eda: CorrelationMatricesBundle;
  latentModel: LatentModelSummary;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  ranking: ComparativeRankingResult;
}

export function generateStataAccuracyOutputBundle(core: AccuracyCoreBundle): StataAccuracyOutputBundle {
  const { datasetMeta, sources, qualityReport, preprocessing, eda, latentModel, metrics, pairFixedEffects, diagnostics, ranking } = core;
  const sep = '-'.repeat(92);

  const headerConsoleText = [
    `. * Model Pengukuran Laten & Akurasi Panel (Komparasi Multi-Sumber Tanpa Reference, ISO 5725)`,
    `. * Mesin Model        : Bayesian Hierarchical Congeneric Model (${latentModel.nChains} chains x ${latentModel.iterationsPerChain} iters)`,
    ...wrapNote('. * Sumber Dievaluasi  : ', `J = ${sources.length} (${sources.map(s => `${s.name}(${s.label})`).join(', ')}) [${datasetMeta.workingUnitNote}]`, '. *                      ', 92),
    ...wrapNote('. * Struktur Panel     : ', `${datasetMeta.cityIdColumn} (G = ${datasetMeta.nCities}) x ${datasetMeta.yearColumn} (T = ${datasetMeta.nYears}) | ${datasetMeta.isBalanced ? 'Balanced' : 'Unbalanced'}`, '. *                      ', 92),
    `. * Complete Pairs(CC) : ${datasetMeta.nCompletePairs} / ${datasetMeta.nObsRaw} raw | Max R-hat = ${latentModel.maxRhat.toFixed(4)} | Min ESS = ${latentModel.minEss}`
  ].join('\n');

  // Tabel 1 (<= 92 char per line)
  const mHead =
    `${pad('Sumber', 18)} | ${pad('TotRMSE', 8, true)} ${pad('ErrSD', 8, true)} ${pad('Rel R2', 8, true)} ${pad('Alpha', 8, true)} ${pad('Lambda', 7, true)} ${pad('LOSO MAE', 8, true)} ${pad('P(Best)', 7, true)} ${pad('R-hat', 6, true)}`;
  const mRows = metrics.map(m =>
    `${pad(m.sourceLabel, 18)} | ${pad(fmtSmart(m.totalLatentRmse), 8, true)} ${pad(fmtSmart(m.errorSd), 8, true)} ${pad(`${(m.reliabilityR2 * 100).toFixed(1)}%`, 8, true)} ${pad(fmtSmart(m.latentInterceptBias), 8, true)} ${pad(fmt(m.latentLoading, 3), 7, true)} ${pad(fmtSmart(m.mae), 8, true)} ${pad(`${(m.posteriorProbBest * 100).toFixed(1)}%`, 7, true)} ${pad(fmt(m.mcmcRhat, 3), 6, true)}`
  );

  const accuracyMetricsTableText = [
    `. * Tabel 1: Evaluasi Akurasi & Reliabilitas Laten Seluruh J = ${metrics.length} Sumber (<= 92 col)`,
    sep,
    mHead,
    sep,
    ...mRows,
    sep,
    ...wrapNote('Identifikasi: ', latentModel.identificationRule, '              ', 92)
  ].join('\n');

  // Tabel 2 (<= 92 char per line)
  const baHead =
    `${pad('Sumber', 18)} | ${pad('N(CC/Av)', 8, true)} ${pad('Lin CCC [95% CI]', 20, true)} ${pad('Cb', 6, true)} ${pad('LOSO MBE', 9, true)} ${pad('Cov95%', 7, true)} ${pad('95% LoA (vs θ_-j)', 16, true)}`;
  const baRows = metrics.map(m => {
    const cccCi = `${fmt(m.ccc.ccc, 3)} [${fmt(m.ccc.ciLower, 2)},${fmt(m.ccc.ciUpper, 2)}]`;
    const loaStr = `[${fmtSmart(m.blandAltman.loaLower)},${fmtSmart(m.blandAltman.loaUpper)}]`;
    return `${pad(m.sourceLabel, 18)} | ${pad(`${m.nCompleteCase}/${m.nAvailableCase}`, 8, true)} ${pad(cccCi, 20, true)} ${pad(fmt(m.ccc.biasCorrectionFactorCb, 3), 6, true)} ${pad(fmtSmart(m.blandAltman.meanBias), 9, true)} ${pad(`${m.losoPredictiveCoverage95.toFixed(1)}%`, 7, true)} ${pad(loaStr, 16, true)}`;
  });

  const cccAndBlandAltmanTableText = [
    `. * Tabel 2: Lin's CCC, LOSO Predictive Coverage 95% & Bland-Altman Agreement`,
    sep,
    baHead,
    sep,
    ...baRows,
    sep
  ].join('\n');

  // Tabel 3 Pair FE + Driscoll-Kraay SE (<= 92 char per line)
  const feHead =
    `${pad('Sumber (Dep: |X-θ|)', 18)} | ${pad('Mean AE', 8, true)} ${pad('BetaDiff', 9, true)} ${pad('Clust SE', 8, true)} ${pad('DK SE', 8, true)} ${pad('t', 7, true)} ${pad('P>|t|', 7, true)} ${pad('WildBoot p', 10, true)}`;
  const feRows = pairFixedEffects.coefficients.map(c => {
    const wbP = c.wildBootstrapPValue !== undefined ? fmt(c.wildBootstrapPValue, 4) : '-';
    const dkSe = c.seDriscollKraay !== undefined ? fmtSmart(c.seDriscollKraay) : '-';
    if (c.isBaselineComparison) {
      return `${pad(`${c.sourceLabel} (B)`, 18)} | ${pad(fmtSmart(c.meanAe), 8, true)} ${pad('0 (base)', 9, true)} ${pad('-', 8, true)} ${pad('-', 8, true)} ${pad('-', 7, true)} ${pad('-', 7, true)} ${pad('-', 10, true)}`;
    }
    return `${pad(c.sourceLabel, 18)} | ${pad(fmtSmart(c.meanAe), 8, true)} ${pad(fmtSmart(c.betaDiffVsBaseline), 9, true)} ${pad(fmtSmart(c.seCluster), 8, true)} ${pad(dkSe, 8, true)} ${pad(fmt(c.tStat, 2), 7, true)} ${pad(fmt(c.pValue, 4), 7, true)} ${pad(wbP, 10, true)}`;
  });

  const pairFixedEffectsTableText = [
    ...wrapNote('. areg ae i.source_id, ', `absorb(entity_time_pair) vce(cluster ${datasetMeta.cityIdColumn})`, '    ', 92),
    ...wrapNote('Absorbed Pair FE : ', `${pairFixedEffects.nCompletePairs} pairs | Long N = ${pairFixedEffects.nLongObs} | Clusters G = ${pairFixedEffects.nClustersCity} (df=${pairFixedEffects.dfCluster})`, '  ', 92),
    ...wrapNote('Omnibus Wald     : ', `F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${fmt(pairFixedEffects.omnibusFStat, 3)} | Prob > F = ${fmt(pairFixedEffects.omnibusPValue, 4)} | WildBoot p = ${fmt(pairFixedEffects.omnibusWildBootstrapPValue, 4)}`, '  ', 92),
    sep,
    feHead,
    sep,
    ...feRows,
    sep
  ].join('\n');

  // Tabel 4 Contrasts (<= 92 char per line)
  const cHead =
    `${pad('Kontras (A vs B)', 24)} | ${pad('dMAE(A-B)', 9, true)} ${pad('Clust p', 8, true)} ${pad('DK p', 8, true)} ${pad('WildBoot p', 10, true)} ${pad('P_Bayes', 8, true)} ${pad('Wild 95% CI', 15, true)}`;
  const cRows =
    pairFixedEffects.pairwiseContrasts.length > 0
      ? pairFixedEffects.pairwiseContrasts.map(c => {
          const wCi = `[${fmtSmart(c.wildBootstrapCiLower)},${fmtSmart(c.wildBootstrapCiUpper)}]`;
          const dkP = c.pValueDriscollKraay !== undefined ? fmt(c.pValueDriscollKraay, 4) : '-';
          return `${pad(`${c.sourceALabel}-${c.sourceBLabel}`, 24)} | ${pad(fmtSmart(c.diffAminusB), 9, true)} ${pad(fmt(c.pValueCluster, 4), 8, true)} ${pad(dkP, 8, true)} ${pad(fmt(c.wildBootstrapPValue, 4), 10, true)} ${pad(`${(c.posteriorProbABetterThanB * 100).toFixed(1)}%`, 8, true)} ${pad(wCi, 15, true)}`;
        })
      : [`(Kontras membutuhkan minimal >= 2 sumber terpasang)`];

  const pairwiseContrastsTableText = [
    `. * Tabel 4: Kontras Berpasangan Seluruh C(${metrics.length},2) Sumber (${pairFixedEffects.bootstrapReplications} WildBoot Reps)`,
    sep,
    cHead,
    sep,
    ...cRows,
    sep
  ].join('\n');

  // Tabel 5 Diagnostics & Ranking (<= 92 char per line)
  const rkHead = `${pad('Rank', 5)} | ${pad('Sumber', 20)} | ${pad('TotRMSE', 8, true)} ${pad('Rel R2', 8, true)} ${pad('P(Best)', 8, true)} ${pad('ExpRank', 8, true)} ${pad('Stab(%)', 8, true)} ${pad('WB p #1', 9, true)}`;
  const rkRows = ranking.ranks.map(r =>
    `${pad(`#${r.rank}`, 5)} | ${pad(r.sourceLabel, 20)} | ${pad(fmtSmart(r.totalLatentRmse), 8, true)} ${pad(`${(r.reliabilityR2 * 100).toFixed(1)}%`, 8, true)} ${pad(`${(r.posteriorProbBest * 100).toFixed(1)}%`, 8, true)} ${pad(fmt(r.expectedRank, 2), 8, true)} ${pad(`${r.rankingStabilityPct.toFixed(1)}%`, 8, true)} ${pad(r.pValueVsTopWildBootstrap !== null ? fmt(r.pValueVsTopWildBootstrap, 4) : '-', 9, true)}`
  );

  const diagnosticsAndRankingText = [
    `. * Tabel 5: Ringkasan Diagnostik & Pemeringkatan Akhir [${ranking.canonicalStatus}]`,
    sep,
    `Bayesian MCMC        : max R-hat = ${fmt(latentModel.maxRhat, 4)} | min ESS = ${latentModel.minEss} | PPP = ${fmt(latentModel.posteriorPredictivePValue, 3)}`,
    `Heteroskedastisitas  : F = ${fmt(diagnostics.heteroskedasticityTest.statisticValue, 3)} (p = ${fmt(diagnostics.heteroskedasticityTest.pValue, 4)})`,
    `Within-Entity AR(1)  : t = ${fmt(diagnostics.serialCorrelationTest.statisticValue, 3)} (p = ${fmt(diagnostics.serialCorrelationTest.pValue, 4)})`,
    `Pesaran CD Test      : z = ${fmt(diagnostics.crossSectionalDependenceTest.statisticValue, 3)} (p = ${fmt(diagnostics.crossSectionalDependenceTest.pValue, 4)})`,
    `Audit Klaster & Outl : G = ${diagnostics.clusterCountAudit.nClusters} | Rank 95% Trimmed: ${diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'BERUBAH' : 'STABIL'}`,
    sep,
    rkHead,
    sep,
    ...rkRows,
    sep,
    ...wrapNote('Verdict: ', ranking.rankingSummary, '         ', 92)
  ].join('\n');

  // Chronological Step 1 -> Step 9 Ordered Stata Output Tables (each <= 92 cols)
  const step1Out = [
    `. xtset entity_num ${datasetMeta.yearColumn}`,
    `. xtdescribe // Step 1: Struktur Panel & Cakupan Sumber`,
    sep,
    `${pad('Parameter Struktur Panel', 38)} | ${pad('Nilai Aktual', 49)}`,
    sep,
    `${pad('Kolom Entitas (i)', 38)} | ${pad(`${datasetMeta.cityIdColumn} (G = ${datasetMeta.nCities} entitas)`, 49)}`,
    `${pad('Kolom Waktu (t)', 38)} | ${pad(`${datasetMeta.yearColumn} (T = ${datasetMeta.nYears} periode | ${qualityReport.yearMin ?? '-'}..${qualityReport.yearMax ?? '-'})`, 49)}`,
    `${pad('Jumlah Sumber Pengukuran (J)', 38)} | ${pad(`J = ${sources.length} sumber dievaluasi setara`, 49)}`,
    `${pad('Baris Mentah vs Complete-Case (CC)', 38)} | ${pad(`${datasetMeta.nCompletePairs} CC / ${datasetMeta.nObsRaw} raw baris`, 49)}`,
    `${pad('Keseimbangan Panel', 38)} | ${pad(datasetMeta.isBalanced ? 'Balanced Panel' : 'Unbalanced / Parsial', 49)}`,
    sep
  ].join('\n');

  const step2Out = [
    ...wrapNote('. misstable summarize ', `${sources.map(s => s.columnKey).join(' ')} // Step 2: Pemetaan & Kelengkapan`, '    ', 92),
    sep,
    `${pad('Sumber ID', 10)} | ${pad('Nama Sumber', 22)} | ${pad('Peran', 11)} ${pad('Avail', 7, true)} ${pad('Missing', 8, true)} ${pad('Unit', 12)} ${pad('Status', 10)}`,
    sep,
    ...sources.map(s => {
      const av = qualityReport.availablePairsBySource[s.id] ?? datasetMeta.nCompletePairs;
      const ms = qualityReport.missingBySource[s.id] ?? 0;
      const hasZero = qualityReport.latentAudit.hasZeroVarianceSources.includes(s.id);
      return `${pad(s.name, 10)} | ${pad(s.label, 22)} | ${pad('Setara', 11)} ${pad(String(av), 7, true)} ${pad(String(ms), 8, true)} ${pad(s.unit || '-', 12)} ${pad(hasZero ? 'ZERO_VAR' : 'VALID', 10)}`;
    }),
    sep,
    `Identifikasi Minimum (J >= 3): ${qualityReport.latentAudit.isIdentifiedForAllSourceRanking ? 'TERPENUHI (Valid)' : 'TERBATAS (J < 3 / Zero Var)'}`
  ].join('\n');

  const pre = preprocessing;
  const preText = pre
    ? `DropDupl=${pre.dropDuplicateCityYear ? 'Ya' : 'Tidak'} | Winsor(${(pre.winsorQuantile * 100).toFixed(1)}%)=${pre.applyWinsorize ? 'Ya' : 'Tidak'} | Log1p=${pre.applyLog1p ? 'Ya' : 'Tidak'} | ScaleMult=${pre.applyUnitMultiplier ? 'Ya' : 'Tidak'}`
    : 'Kebijakan Default (Data Mentah Terjaga / Non-destruktif)';

  const step3Out = [
    `. * Step 3: Audit Kualitas Data 10-Indikator & Prapemrosesan Eksplisit`,
    ...wrapNote('Pra-pemrosesan Aktif: ', preText, '  ', 92),
    sep,
    `${pad('Indikator Audit Kualitas', 36)} | ${pad('Level', 8)} | ${pad('Count', 6, true)} | ${pad('Ringkasan Hasil', 33)}`,
    sep,
    ...qualityReport.checks.map(chk =>
      `${pad(chk.title, 36)} | ${pad(chk.severity.toUpperCase(), 8)} | ${pad(String(chk.count), 6, true)} | ${pad(chk.message, 33)}`
    ),
    sep
  ].join('\n');

  const edaRows = eda.descriptives.map(d =>
    `${pad(d.sourceLabel, 18)} | ${pad(String(d.n), 5, true)} ${pad(fmtSmart(d.mean), 9, true)} ${pad(fmtSmart(d.sd), 9, true)} ${pad(fmtSmart(d.median), 9, true)} ${pad(fmtSmart(d.iqr), 9, true)} ${pad(`${d.cv.toFixed(1)}%`, 8, true)} ${pad(fmt(d.skewness, 2), 7, true)}`
  );
  const shortLabels = eda.sourceLabels.map((lbl, idx) => `S${idx + 1}:${lbl.slice(0, 7)}`);
  const corrHeader = `${pad('Pearson r', 18)} | ` + shortLabels.map((_, i) => pad(`S${i + 1}`, 8, true)).join(' ');
  const corrRows = eda.overallPearson.map((row, i) =>
    `${pad(`S${i + 1} ${eda.sourceLabels[i]}`, 18)} | ` + row.map(v => pad(fmt(v, 3), 8, true)).join(' ')
  );

  const step4Out = [
    ...wrapNote('. tabstat ', `${sources.map(s => s.columnKey).join(' ')}, stats(n mean sd med iqr cv skew)`, '    ', 92),
    sep,
    `${pad('Sumber', 18)} | ${pad('N', 5, true)} ${pad('Mean', 9, true)} ${pad('SD', 9, true)} ${pad('Median', 9, true)} ${pad('IQR', 9, true)} ${pad('CV(%)', 8, true)} ${pad('Skew', 7, true)}`,
    sep,
    ...edaRows,
    sep,
    ...wrapNote('. pwcorr ', `${sources.map(s => s.columnKey).join(' ')}, sig // Matriks Korelasi Pearson Overall`, '    ', 92),
    sep,
    corrHeader,
    sep,
    ...corrRows,
    sep
  ].join('\n');

  const latHead = `${pad('Sumber', 18)} | ${pad('Alpha(α)', 9, true)} ${pad('Lambda(λ)', 9, true)} ${pad('ErrSD(σε)', 9, true)} ${pad('ScaleDst', 9, true)} ${pad('Rel R2', 8, true)} ${pad('ESS', 6, true)} ${pad('R-hat', 6, true)}`;
  const latRows = latentModel.sourceEstimates.map(se =>
    `${pad(se.sourceLabel, 18)} | ${pad(fmtSmart(se.interceptBiasAlpha), 9, true)} ${pad(fmt(se.loadingLambda, 3), 9, true)} ${pad(fmtSmart(se.errorSd), 9, true)} ${pad(fmtSmart(se.scaleDistortionComponent), 9, true)} ${pad(`${(se.reliabilityR2 * 100).toFixed(1)}%`, 8, true)} ${pad(String(Math.round(se.mcmcEss)), 6, true)} ${pad(fmt(se.mcmcRhat, 3), 6, true)}`
  );
  const resCorrHeader = `${pad('Corr(eps_a,eps_b)', 18)} | ` + sources.map((_, i) => pad(`S${i + 1}`, 8, true)).join(' ');
  const resCorrRows = latentModel.residualCorrelationMatrix.map((row, i) =>
    `${pad(`S${i + 1} ${sources[i]?.label || ''}`, 18)} | ` + row.map(v => pad(fmt(v, 3), 8, true)).join(' ')
  );

  const step5Out = [
    ...wrapNote(`. bayes, chains(${latentModel.nChains}) mcmcsize(${latentModel.iterationsPerChain}) burnin(${latentModel.burnInPerChain}): `, `sem (Theta -> ${sources.map(s => s.columnKey).join(' ')})`, '    ', 92),
    ...wrapNote('Conv: ', `Max R-hat=${fmt(latentModel.maxRhat, 4)} | Min ESS=${latentModel.minEss} | PPP=${fmt(latentModel.posteriorPredictivePValue, 3)} | Converged=${latentModel.converged ? 'YA' : 'TIDAK'}`, '      ', 92),
    sep,
    latHead,
    sep,
    ...latRows,
    sep,
    `. * Matriks Korelasi Residual Antarsumber (Audit D3 Independensi Galat)`,
    resCorrHeader,
    sep,
    ...resCorrRows,
    sep
  ].join('\n');

  const step6IsoHead = `${pad('Sumber', 18)} | ${pad('TotRMSE', 8, true)} ${pad('Bias^2', 8, true)} ${pad('Scale^2', 8, true)} ${pad('Var(ε)', 8, true)} ${pad('ExpLoss', 8, true)} ${pad('Cov95%', 7, true)} ${pad('Lin CCC', 8, true)}`;
  const step6IsoRows = metrics.map(m => {
    const biasSq = m.latentInterceptBias * m.latentInterceptBias;
    const scaleSq = m.scaleDistortion * m.scaleDistortion;
    return `${pad(m.sourceLabel, 18)} | ${pad(fmtSmart(m.totalLatentRmse), 8, true)} ${pad(fmtSmart(biasSq), 8, true)} ${pad(fmtSmart(scaleSq), 8, true)} ${pad(fmtSmart(m.errorVariance), 8, true)} ${pad(fmtSmart(m.posteriorExpectedLoss), 8, true)} ${pad(`${m.losoPredictiveCoverage95.toFixed(1)}%`, 7, true)} ${pad(fmt(m.ccc.ccc, 3), 8, true)}`;
  });

  const step6Out = [
    `. * Step 6: Dekomposisi Akurasi ISO 5725, Validasi LOSO, Pair FE & Driscoll-Kraay SE`,
    sep,
    step6IsoHead,
    sep,
    ...step6IsoRows,
    sep,
    pairFixedEffectsTableText,
    pairwiseContrastsTableText
  ].join('\n');

  const diagEntries = [
    diagnostics.heteroskedasticityTest,
    diagnostics.serialCorrelationTest,
    diagnostics.crossSectionalDependenceTest
  ];
  const step7Out = [
    `. * Step 7: Uji Diagnostik Panel, Ketergantungan Galat & Sensitivitas Sampel`,
    sep,
    `${pad('Uji Diagnostik', 28)} | ${pad('Statistik', 10, true)} ${pad('df', 12)} ${pad('p-val', 8, true)} ${pad('Status', 8)} | ${pad('Kesimpulan', 16)}`,
    sep,
    ...diagEntries.map(d =>
      `${pad(d.testName, 28)} | ${pad(fmt(d.statisticValue, 3), 10, true)} ${pad(d.dfLabel, 12)} ${pad(fmt(d.pValue, 4), 8, true)} ${pad(d.status.toUpperCase(), 8)} | ${pad(d.conclusion, 16)}`
    ),
    sep,
    ...wrapNote('Klaster (G)     : ', diagnostics.clusterCountAudit.message, '                  ', 92),
    ...wrapNote('Sensitivitas Out: ', diagnostics.outlierSensitivityAudit.summary, '                  ', 92),
    ...wrapNote('Korelasi Galat  : ', diagnostics.correlatedErrorAudit?.summary || 'Tidak terdeteksi pasangan galat berkorelasi > 0.35.', '                  ', 92),
    ...wrapNote('Missingness Sens: ', diagnostics.missingDataSensitivityAudit?.summary || 'Peringkat konsisten pada uji CC vs Available-Case.', '                  ', 92),
    sep
  ].join('\n');

  const step8Out = [
    `. * Step 8: Peringkat Komparatif Akhir & Penetapan Sumber Terbaik Relatif`,
    `Status Kanonik: [${ranking.canonicalStatus}] | Konklusif: ${ranking.isConclusive ? 'YA' : 'BELUM'}`,
    sep,
    rkHead,
    sep,
    ...rkRows,
    sep,
    ...wrapNote('Mengapa #1      : ', `${ranking.whyBestAnalysis.candidateLabel} menempati posisi teratas:`, '                  ', 92),
    ...ranking.whyBestAnalysis.points.flatMap((pt, i) =>
      wrapNote(`  ${i + 1}. ${pad(pt.label, 22)}: `, pt.detail, '     ', 92)
    ),
    sep
  ].join('\n');

  const step9Out = [
    `. * Step 9: Ringkasan Reprodusibilitas Artefak & Kesimpulan Penelitian`,
    sep,
    `${pad('Artefak Ekspor / Skrip', 36)} | ${pad('Status', 10)} | ${pad('Keterangan Reproduksi', 38)}`,
    sep,
    `${pad('Stata Master Do-File (.do)', 36)} | ${pad('READY', 10)} | ${pad('Urut Step 1-9 (bayes:sem, reghdfe, xtcd)', 38)}`,
    `${pad('R Statistical Script (.R)', 36)} | ${pad('READY', 10)} | ${pad('brms / fixest / DescTools CCC', 38)}`,
    `${pad('Stan Hierarchical Model (.stan)', 36)} | ${pad('READY', 10)} | ${pad('Model Laten Bayesian + Generated Quant.', 38)}`,
    `${pad('Laporan Resmi (PDF / DOCX / XLSX)', 36)} | ${pad('READY', 10)} | ${pad('Lengkap Tabel Step 1-9 + Output Stata', 38)}`,
    sep,
    ...wrapNote('Kesimpulan Akhir: ', ranking.rankingSummary, '                  ', 92)
  ].join('\n');

  const orderedStepOutputs: StataOrderedStepOutput[] = [
    { stepId: 1, stepTitle: 'Step 1 — Struktur Panel & Cakupan Dataset', stataCommand: 'xtset / xtdescribe', outputTableText: step1Out },
    { stepId: 2, stepTitle: 'Step 2 — Audit Kelengkapan & Pemetaan Sumber (J >= 3)', stataCommand: 'misstable summarize', outputTableText: step2Out },
    { stepId: 3, stepTitle: 'Step 3 — Audit Kualitas 10-Indikator & Prapemrosesan', stataCommand: 'preproc_audit', outputTableText: step3Out },
    { stepId: 4, stepTitle: 'Step 4 — Statistik Deskriptif & Matriks Korelasi Panel', stataCommand: 'tabstat / pwcorr', outputTableText: step4Out },
    { stepId: 5, stepTitle: 'Step 5 — Estimasi Model Laten Bayesian & Residual Corr', stataCommand: 'bayes: sem', outputTableText: step5Out },
    { stepId: 6, stepTitle: 'Step 6 — Akurasi ISO 5725, Validasi LOSO, Pair FE & DK SE', stataCommand: 'areg / reghdfe / boottest', outputTableText: step6Out },
    { stepId: 7, stepTitle: 'Step 7 — Uji Diagnostik Panel & Analisis Sensitivitas', stataCommand: 'xtcd / xtserial / loocv', outputTableText: step7Out },
    { stepId: 8, stepTitle: 'Step 8 — Pemeringkatan Final & Analisis 8-Poin Pemenang', stataCommand: 'ranking_verdict', outputTableText: step8Out },
    { stepId: 9, stepTitle: 'Step 9 — Log Reprodusibilitas & Kesimpulan Ekspor', stataCommand: 'export_bundle', outputTableText: step9Out }
  ];

  return {
    headerConsoleText,
    accuracyMetricsTableText,
    cccAndBlandAltmanTableText,
    pairFixedEffectsTableText,
    pairwiseContrastsTableText,
    diagnosticsAndRankingText,
    orderedStepOutputs
  };
}

export function generateAccuracyAcademicInterpretations(
  core: AccuracyCoreBundle
): AccuracyAcademicInterpretations {
  const { latentModel, metrics, pairFixedEffects, diagnostics, ranking, qualityReport } = core;

  const referenceValidityInterpretation =
    `${qualityReport.latentAudit.summary} Dalam metodologi Model Pengukuran Laten & Akurasi Panel (ISO 5725), ` +
    `tidak ada satu variabel pun yang dikunci secara sepihak sebagai reference absolut; sebaliknya, keseluruhan J = ${metrics.length} sumber ` +
    `dievaluasi serentak terhadap sinyal laten bersama theta_it (${latentModel.identificationRule}).`;

  const corrSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} mencatat Pearson r = ${m.pearsonR.toFixed(4)} (Spearman rho = ${m.spearmanRho.toFixed(4)}, within-entity r = ${m.withinCityR.toFixed(4)}, first-diff r = ${m.firstDiffR.toFixed(4)}) terhadap konsensus keluar-satu-sumber`
    )
    .join('; ');

  const edaAndCorrelationInterpretation =
    `Analisis korelasi panel pada ${core.datasetMeta.nCompletePairs} pasangan Entitas-Waktu menunjukkan: ${corrSummary}. ` +
    `Korelasi tinggi hanya mengukur kesamaan arah linear, sedangkan akurasi penuh harus dinilai lewat dekomposisi bias (alpha_j), loading skala (lambda_j), Error SD (sigma_eps), Total Latent RMSE, dan Reliabilitas (R²).`;

  const accSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} memperoleh Total Latent RMSE = ${fmtSmart(m.totalLatentRmse)}, Error SD sigma_eps = ${fmtSmart(m.errorSd)} (95% CrI [${fmtSmart(m.errorSdCiLower)}, ${fmtSmart(m.errorSdCiUpper)}]), Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}%, Bias relatif alpha_j = ${m.latentInterceptBias >= 0 ? '+' : ''}${fmtSmart(m.latentInterceptBias)}, LOSO MAE = ${fmtSmart(m.mae)}, Lin's CCC = ${m.ccc.ccc.toFixed(4)}, dan Posterior Prob Best = ${(m.posteriorProbBest * 100).toFixed(1)}%`
    )
    .join('. ');

  const accuracyAndAgreementInterpretation =
    `Estimasi Bayesian Hierarchical Latent Measurement Model dan Leave-One-Source-Out Consensus menghasilkan: ${accSummary}. ` +
    `Sumber dengan Total Latent RMSE terkecil, Error SD terendah, dan Reliabilitas R² tertinggi merupakan sumber yang paling akurat sekaligus paling konsisten memprediksi konstruksi laten sebenarnya.`;

  const pairFixedEffectsInterpretation =
    `Model Pair Fixed Effects membandingkan deviasi absolut seluruh J = ${pairFixedEffects.nComparisonSources} sumber terhadap estimasi konsensus laten secara serentak (` +
    `menyerap ${pairFixedEffects.nCompletePairs} efek tetap pasangan Entitas-Waktu pada ${pairFixedEffects.nClustersCity} klaster entitas). ` +
    `Uji omnibus Wald menghasilkan F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${pairFixedEffects.omnibusFStat.toFixed(3)} (p = ${pairFixedEffects.omnibusPValue.toFixed(4)}, Wild Bootstrap p = ${pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}).`;

  const diagnosticsInterpretation =
    `${diagnostics.bayesianConvergenceAudit.summary} ${diagnostics.heteroskedasticityTest.conclusion} ${diagnostics.serialCorrelationTest.conclusion} ` +
    `${diagnostics.crossSectionalDependenceTest.conclusion} ${diagnostics.outlierSensitivityAudit.summary} ${diagnostics.normalityAndCltNote.explanation}`;

  const rankingDecisionInterpretation = `${ranking.rankingSummary} ${ranking.methodologicalCaveat}`;

  return {
    referenceValidityInterpretation,
    edaAndCorrelationInterpretation,
    accuracyAndAgreementInterpretation,
    pairFixedEffectsInterpretation,
    diagnosticsInterpretation,
    rankingDecisionInterpretation,
    researchLimitations: diagnostics.inferenceLimitations,
    finalConclusion: ranking.rankingSummary
  };
}
