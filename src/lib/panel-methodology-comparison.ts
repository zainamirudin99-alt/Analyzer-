// ============================================================
// SECTION 8: Comparative Methodology Evaluation Engine (Option 2 vs Option 3)
// Executes Option 2 (100% Untouched) & Option 3 (Independent) on Identical Raw Data
// Explains Concordance/Divergence Empirically Without Claiming Absolute Ground Truth
// ============================================================

import { executePanelAccuracyPipeline } from './panel-accuracy-orchestrator';
import { PanelAccuracyFitResult, PanelDataset } from './panel-accuracy-types';
import { executeAdvancedPanelAccuracyPipeline } from './panel-adv-orchestrator';
import {
  AdvManualOverrides,
  AdvPanelFitResult,
  ComparativeAspectRow,
  ComparativeConclusionCategory,
  ComparativeMethodologyEvaluationResult,
  ComparativeSourceRankRow
} from './panel-adv-types';

function cloneDatasetImmutable(dataset: PanelDataset): PanelDataset {
  return {
    cityIdColumn: dataset.cityIdColumn,
    yearColumn: dataset.yearColumn,
    sources: dataset.sources.map(s => ({ ...s, metadata: s.metadata ? { ...s.metadata } : undefined })),
    observations: dataset.observations.map(row => ({ ...row }))
  };
}

function spearmanFromRanks(r2: number[], r3: number[]): number {
  const n = Math.min(r2.length, r3.length);
  if (n < 2) return 1;
  const mean2 = r2.reduce((a, b) => a + b, 0) / n;
  const mean3 = r3.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den2 = 0;
  let den3 = 0;
  for (let i = 0; i < n; i++) {
    const d2 = r2[i] - mean2;
    const d3 = r3[i] - mean3;
    num += d2 * d3;
    den2 += d2 * d2;
    den3 += d3 * d3;
  }
  if (den2 <= 1e-12 || den3 <= 1e-12) return 1;
  return Number((num / Math.sqrt(den2 * den3)).toFixed(4));
}

export function evaluateOption2VsOption3Methodology(params: {
  dataset: PanelDataset;
  datasetName?: string;
  option2Result?: PanelAccuracyFitResult;
  option3Result?: AdvPanelFitResult;
  option3Overrides?: AdvManualOverrides;
  highPrecision?: boolean;
}): {
  option2: PanelAccuracyFitResult;
  option3: AdvPanelFitResult;
  comparison: ComparativeMethodologyEvaluationResult;
} {
  const datasetName = params.datasetName || 'Shared_Panel_Dataset.xlsx';

  // Run Option 2 on an isolated deep clone (zero mutation, baseline behavior preserved)
  const option2 =
    params.option2Result ??
    executePanelAccuracyPipeline({
      dataset: cloneDatasetImmutable(params.dataset),
      preprocessing: { dropDuplicateCityYear: true },
      bootstrapReplications: params.highPrecision ? 1999 : 999,
      mcmcIterations: params.highPrecision ? 800 : 450,
      executionSource: params.highPrecision ? 'server_verified' : 'client_live'
    });

  // Run Option 3 independently on an isolated deep clone of the exact same raw dataset
  const option3 =
    params.option3Result ??
    executeAdvancedPanelAccuracyPipeline({
      dataset: cloneDatasetImmutable(params.dataset),
      datasetName,
      overrides: params.option3Overrides,
      highPrecisionMode: params.highPrecision,
      executionMode: params.highPrecision ? 'server_high_precision' : 'client_reactive'
    });

  const opt2PrepDesc = `Satuan ${option2.preprocessing.applyLog1p ? 'log(1+x)' : 'Fisik Asli'}, Winsor=${option2.preprocessing.applyWinsorize ? 'Ya (2.5%)' : 'Tidak'}, DropDup=${option2.preprocessing.dropDuplicateCityYear ? 'Ya' : 'Tidak'} (N_CC=${option2.datasetMeta.nCompletePairs})`;
  const opt3PrepDesc = `Transformasi=${option3.autoDecision.activeConfig.transformation}, Outlier=${option3.autoDecision.activeConfig.outlierStrategy}, DropDup=${option3.autoDecision.activeConfig.dropDuplicatePairs ? 'Ya' : 'Tidak'} (N_CC=${option3.datasetSummary.nCompletePairs})`;
  const sameWorkingScale =
    (!option2.preprocessing.applyLog1p &&
      (option3.autoDecision.activeConfig.transformation === 'none' ||
        option3.autoDecision.activeConfig.transformation === 'robust_student_t')) ||
    (option2.preprocessing.applyLog1p && option3.autoDecision.activeConfig.transformation === 'log1p');

  const preprocessingDiffImpact = sameWorkingScale
    ? 'Kedua metodologi bekerja pada skala pengukuran yang setara sehingga estimasi bias lokasi dan varians galat dapat dibandingkan secara langsung.'
    : `PERBEDAAN SKALA KERJA: Opsi 2 mengevaluasi pada (${opt2PrepDesc}), sedangkan Opsi 3 memilih otomatis (${opt3PrepDesc}). Perbedaan transformasi mengubah estimand dari galat absolut ke galat relatif/terstandardisasi.`;

  // Build Side-by-Side Ranking Comparison across all J sources
  const rows: ComparativeSourceRankRow[] = params.dataset.sources.map(src => {
    const r2Entry = option2.ranking.ranks.find(r => r.sourceId === src.id);
    const r3Entry = option3.ranking.rows.find(r => r.sourceId === src.id);
    const opt2Rank = r2Entry?.rank ?? params.dataset.sources.length;
    const opt3Rank = r3Entry?.rank ?? params.dataset.sources.length;
    return {
      sourceId: src.id,
      sourceLabel: src.label,
      option2Rank: opt2Rank,
      option3Rank: opt3Rank,
      rankShift: opt2Rank - opt3Rank, // positive means Option 3 ranked higher (smaller rank number)
      option2MetricValue: Number((r2Entry?.totalLatentRmse ?? 0).toFixed(4)),
      option3TotalRmse: Number((r3Entry?.anchorTotalRmse ?? 0).toFixed(4)),
      option3NoiseRatio: Number((r3Entry?.scaleAdjustedNoiseRatio ?? 0).toFixed(4)),
      option2ProbBestPct: Number(((r2Entry?.posteriorProbBest ?? 0) * 100).toFixed(1)),
      option3ProbRank1Pct: Number(((r3Entry?.probRank1 ?? 0) * 100).toFixed(1)),
      option2StatusNote: r2Entry?.isStatisticallyIndistinguishableFromTop ? 'Seri dgn #1 (Opsi 2)' : 'Terpisah',
      option3AnchorMaxShift: r3Entry?.maxAnchorRankShift ?? 0
    };
  });
  rows.sort((a, b) => a.option3Rank - b.option3Rank);

  const spearmanRankConcordance = spearmanFromRanks(
    rows.map(r => r.option2Rank),
    rows.map(r => r.option3Rank)
  );

  const opt2TopId =
    option2.ranking.bestSourceId ||
    option2.ranking.bestCandidateId ||
    rows.find(r => r.option2Rank === 1)?.sourceId ||
    null;
  const opt3TopId =
    option3.ranking.leaderSourceId ||
    rows.find(r => r.option3Rank === 1)?.sourceId ||
    null;
  const opt2TopLabel =
    rows.find(r => r.sourceId === opt2TopId)?.sourceLabel ||
    option2.ranking.bestSourceLabel ||
    option2.ranking.bestCandidateLabel ||
    null;
  const opt3TopLabel =
    rows.find(r => r.sourceId === opt3TopId)?.sourceLabel ||
    option3.ranking.leaderSourceLabel ||
    null;
  const sameTopRankedSource = Boolean(opt2TopId && opt3TopId && opt2TopId === opt3TopId);

  // Diagnose exact methodological causes of concordance or divergence
  const divergenceFactors: string[] = [];
  if (!sameWorkingScale) {
    divergenceFactors.push(
      `perbedaan transformasi skala kerja (${option2.preprocessing.applyLog1p ? 'log1p' : 'none'} vs ${option3.autoDecision.activeConfig.transformation})`
    );
  }
  if (option3.estimation.anchorSensitivity.topSourceFlipAcrossAnchors) {
    divergenceFactors.push(
      `sensitivitas titik nol lokasi anchor (Kendall's W Total RMSE = ${option3.estimation.anchorSensitivity.kendallWTotalRmse.toFixed(3)})`
    );
  }
  if (option3.estimation.flaggedResidualPairs.length > 0) {
    divergenceFactors.push(
      `adanya ${option3.estimation.flaggedResidualPairs.length} pasangan korelasi galat residual yang dideteksi pada seleksi ketergantungan ${option3.estimation.activeDependencyModel}`
    );
  }
  if (option3.ranking.tiedWithLeaderLabels.length > 0 || option2.ranking.tiedTopSourceLabels.length > 0) {
    divergenceFactors.push('tumpang-tindih interval kredibel 95% pada kandidat peringkat atas (indistinguishable tie)');
  }

  const divergenceExplanation = sameTopRankedSource
    ? `KONSISTENSI PERINGKAT PUNCAK: Baik Opsi 2 maupun Opsi 3 menempatkan "${opt3TopLabel}" pada peringkat #1 (korelasi peringkat Spearman ρ = ${spearmanRankConcordance.toFixed(3)})${divergenceFactors.length > 0 ? `, dengan catatan diagnostik pada: ${divergenceFactors.join('; ')}.` : ' dan urutan lintas sumber yang selaras.'}`
    : `DIVERGENSI PERINGKAT TERJELASKAN: Opsi 2 menempatkan "${opt2TopLabel}" di #1 sedangkan Opsi 3 menempatkan "${opt3TopLabel}" di #1 (Spearman ρ = ${spearmanRankConcordance.toFixed(3)}). Perbedaan ini bersumber dari ${divergenceFactors.length > 0 ? divergenceFactors.join(', ') : 'perbedaan struktur prior Half-t terintegrasi Woodbury dan koreksi perbandingan berganda Holm pada Opsi 3'}.`;

  // All 19 Required Comparison Aspects (Section 8.2)
  const aspectComparisonTable: ComparativeAspectRow[] = [
    {
      aspect: 'Model specification',
      option2Value: 'Congeneric 1-faktor panel Y_itj = α_j + λ_j θ_it + ε_itj (ISO 5725 trueness + precision)',
      option3Value: `Hierarchical Panel Latent (${option3.estimation.activeLatentStructure}) dengan dekomposisi θ_it = μ + u_i + v_t + w_it`,
      methodologicalImplication: 'Opsi 3 memisahkan varians sinyal antar-entitas, antar-periode, dan persistensi dinamis secara eksplisit.'
    },
    {
      aspect: 'Identifiability',
      option2Value: `Audit syarat J ≥ 3 (${option2.qualityReport.latentAudit.isIdentifiedForAllSourceRanking ? 'Teridentifikasi' : 'Terbatas'})`,
      option3Value: `Audit aljabar df_cov = J(J+1)/2 − 2J per kandidat model (${option3.autoDecision.overallIdentifiabilityStatus})`,
      methodologicalImplication: 'Opsi 3 memblokir model kovarians galat yang melampaui derajat bebas kovarians empiris.'
    },
    {
      aspect: 'Latent estimation',
      option2Value: `3-Chain Conditional Gibbs MCMC (${option2.latentModel.iterationsPerChain} iterasi/rantai) + Grubbs check`,
      option3Value: `${option3.estimation.mcmcDiagnostics.nChains}-Chain Marginalized Woodbury MCMC (${option3.estimation.mcmcDiagnostics.totalPostWarmupDraws} post-warmup draws)`,
      methodologicalImplication: 'Integrasi analitik Woodbury atas θ_it pada Opsi 3 mengurangi autokorelasi rantai pada sampel panel padat.'
    },
    {
      aspect: 'Source bias',
      option2Value: 'Intercept α_j dengan konstrain Σ α_j = 0 (rataan aritmetika sama dengan nol)',
      option3Value: `Intercept α_j pada anchor utama (${option3.estimation.activeAnchorStrategy}) + audit lintas J+2 anchor`,
      methodologicalImplication: 'Median-ratio consensus anchor pada Opsi 3 tidak mudah tertarik oleh satu sumber ekstrem yang bias besar.'
    },
    {
      aspect: 'Error variance',
      option2Value: 'Prior skala konjugat / Cauchy lemah + pemeriksa varians Grubbs terpotong positif',
      option3Value: `Prior Half-t skala lemah (Gelman, 2006: ${option3.estimation.activePriorStrategy}) + uji sensitivitas 3 keluarga prior`,
      methodologicalImplication: 'Opsi 3 mengaudit seberapa sensitif σ_j terhadap perubahan spesifikasi prior pada sampel terbatas.'
    },
    {
      aspect: 'Error dependency',
      option2Value: `Audit korelasi residual pasca-estimasi + penalti diskon peringkat (${option2.diagnostics.correlatedErrorAudit?.pairs.length ?? 0} pasangan)`,
      option3Value: `Seleksi formal M1–M4 (Independent, AR(1), Entity-Source RE, Sparse Correlated) via Marginal WAIC & PSIS-LOO (${option3.estimation.activeDependencyModel})`,
      methodologicalImplication: 'Opsi 3 memilih struktur ketergantungan galat berdasarkan kriteria prediktif teridentifikasi, bukan sekadar penalti heuristik.'
    },
    {
      aspect: 'Anchor sensitivity',
      option2Value: 'Satu rezim konstrain tetap (GeoMean λ = 1, Σ α = 0)',
      option3Value: `Evaluasi penuh di seluruh ${option3.estimation.anchorSensitivity.evaluatedAnchors.length} rezim anchor (Kendall's W = ${option3.estimation.anchorSensitivity.kendallWTotalRmse.toFixed(3)})`,
      methodologicalImplication: 'Opsi 3 membuktikan secara empiris apakah peringkat berubah bila masing-masing sumber dijadikan marker anchor.'
    },
    {
      aspect: 'Source ranking',
      option2Value: 'Metrik utama tunggal: Total Latent RMSE + tie-break matriks keputusan',
      option3Value: 'Dual-estimand transparan: Anchor-Conditioned Total RMSE berdampingan dengan Scale-Invariant R_j = σ_j/|λ_j|',
      methodologicalImplication: 'Memungkinkan peneliti membedakan sumber yang presisi namun bergeser konstan (R_j kecil, α_j besar) vs sumber bebas bias relatif.'
    },
    {
      aspect: 'Ranking uncertainty',
      option2Value: `P(Best) puncak = ${rows[0]?.option2ProbBestPct ?? 0}% & Expected Rank`,
      option3Value: `Distribusi penuh P(R_j ≤ k | Y), Expected Rank, Rank SD, dan Entropi Peringkat Ternormalisasi`,
      methodologicalImplication: 'Opsi 3 menampilkan kurva peluang kumulatif seluruh peringkat k = 1..J beserta dispersi entropinya.'
    },
    {
      aspect: 'Common mode bias',
      option2Value: 'Peringatan kualitatif pada batasan penelitian dan caveat epistemologis',
      option3Value: '10 skenario simulasi Common-Mode Bias kuantitatif (aditif bersama, proporsional, drift waktu, koalisi bias)',
      methodologicalImplication: 'Mendemonstrasikan secara konkret kondisi ketika konsensus tanpa Ground Truth tersesat oleh bias kolektif.'
    },
    {
      aspect: 'Missing data',
      option2Value: `Complete-case utama + metrik ringkas available-case (N_CC = ${option2.datasetMeta.nCompletePairs})`,
      option3Value: `Strategi ${option3.autoDecision.activeConfig.missingStrategy} + simulasi sensitivitas MCAR/MAR/MNAR di Keluarga G`,
      methodologicalImplication: 'Keduanya jujur tidak mengklaim bukti mutlak MCAR; Opsi 3 mengkuantifikasi risiko distorsi MNAR lewat simulasi.'
    },
    {
      aspect: 'Transformation',
      option2Value: ' Evaluasi 4 skenario (Raw, Winsor 2.5%, log1p, log1p + Winsor)',
      option3Value: `Evaluasi 10 kandidat termasuk Box-Cox, Yeo-Johnson (Raymaekers & Rousseeuw, 2021), dan Student-t (${option3.preprocessing.chosenTransformation})`,
      methodologicalImplication: 'Opsi 3 melampirkan label pelestarian estimand pada setiap kandidat transformasi agar interpretasi tidak bercampur.'
    },
    {
      aspect: 'LOSO',
      option2Value: 'Prediksi Leave-One-Source-Out terhadap konsensus J − 1 sumber lainnya',
      option3Value: 'LOSO + Audit Identitas Kovarians 2·λ_j·Cov(ε_j, θ̂_-j) & estimasi Debiased Implied Error SD',
      methodologicalImplication: 'Opsi 3 mencegah pengurangan varians benchmark secara naif saat galat antarsumber berkorelasi.'
    },
    {
      aspect: 'Pair FE',
      option2Value: 'Pair Fixed Effects + Cluster SE / Driscoll-Kraay + Rademacher Wild Bootstrap (tanpa koreksi FWER eksplisit)',
      option3Value: `Pair FE + SE adaptif (${option3.validation.selectedSeMethod}) + ${option3.validation.selectedBootstrapMethod} + Koreksi Sekuensial Holm (1979)`,
      methodologicalImplication: 'Opsi 3 mengendalikan inflasi galat Tipe I lintas m = J(J−1)/2 pasangan kontras dengan prosedur Holm.'
    },
    {
      aspect: 'Agreement analysis',
      option2Value: 'Lin’s CCC & Bland-Altman Limits of Agreement pooled standar',
      option3Value: 'Repeated-Measures Mixed-Effects Bland-Altman LoA (Bland & Altman, 2007; Parker et al., 2020) + Within-Entity r + CCC',
      methodologicalImplication: 'Batas LoA Opsi 3 memisahkan varians antar-entitas dan dalam-entitas sehingga tidak semu-sempit akibat pengulangan panel.'
    },
    {
      aspect: 'Robustness',
      option2Value: 'Jackknife Leave-One-City-Out & sensitivitas 95% outlier trim',
      option3Value: 'Stabilitas lintas-entitas, lintas-periode waktu, 3 keluarga prior, J+2 anchor, dan 10 skenario common-mode bias',
      methodologicalImplication: 'Cakupan pengujian ketahanan Opsi 3 mencakup ketidakpastian struktural model maupun dimensi panel.'
    },
    {
      aspect: 'Computational cost',
      option2Value: `${option2.executionMeta?.elapsedMs ?? 0} ms (ringan, tanpa loop simulasi Monte Carlo internal)`,
      option3Value: `${option3.elapsedMs} ms (memuat multi-anchor, prior sensitivity, dan ${option3.monteCarlo.totalReplicationsRun} run Monte Carlo)`,
      methodologicalImplication: 'Opsi 2 lebih cepat untuk eksplorasi instan; Opsi 3 menukar waktu komputasi moderat demi validasi berlapis.'
    },
    {
      aspect: 'Model diagnostics',
      option2Value: `Gelman-Rubin klasik Max R-hat = ${option2.latentModel.maxRhat.toFixed(4)}, Min ESS = ${option2.latentModel.minEss}, PPP = ${option2.latentModel.posteriorPredictivePValue.toFixed(3)}`,
      option3Value: `Vehtari (2021) Split R-hat = ${option3.estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)}, Folded R-hat = ${option3.estimation.mcmcDiagnostics.maxFoldedRhat.toFixed(4)}, Bulk/Tail ESS = ${option3.estimation.mcmcDiagnostics.minBulkEss}/${option3.estimation.mcmcDiagnostics.minTailEss}`,
      methodologicalImplication: 'Split & Folded R-hat mendeteksi non-stasioneritas dalam-rantai serta kegagalan konvergensi varians ekor yang luput dari R-hat klasik.'
    },
    {
      aspect: 'Stata implementation',
      option2Value: 'Skrip Stata `sem` + `xtreg, fe` + tabel output konsol per step',
      option3Value: 'Panduan Stata 17/18 (`gsem`, `bayes: gsem`, `mixed`, `mtest(holm)`, `boottest`) + pengungkapan transparan gap native Stata vs R/Stan',
      methodologicalImplication: 'Opsi 3 membedakan dengan tegas prosedur yang 100% native di Stata vs prosedur yang didekati atau memerlukan Stan/R.'
    }
  ];

  // Section 8.4: 10 Diagnostic Comparisons
  const diagnosticComparison = [
    {
      criterion: '1. Model fit',
      option2Summary: `Posterior Predictive p = ${option2.latentModel.posteriorPredictivePValue.toFixed(3)}`,
      option3Summary: `PPP = ${option3.estimation.mcmcDiagnostics.posteriorPredictivePValue.toFixed(3)}, Marginal WAIC = ${option3.estimation.mcmcDiagnostics.marginalWaic.toFixed(2)}, PSIS-LOO ELPD = ${option3.estimation.mcmcDiagnostics.psisLooElpd.toFixed(2)}`,
      assessment: 'Opsi 3 menambahkan kriteria prediktif lintas-validasi marginal (Merkle et al., 2019; Vehtari et al., 2017).'
    },
    {
      criterion: '2. Convergence',
      option2Summary: `Max Gelman-Rubin R-hat = ${option2.latentModel.maxRhat.toFixed(4)} (${option2.latentModel.converged ? 'Konvergen' : 'Perlu Iterasi'})`,
      option3Summary: `Max Split R-hat = ${option3.estimation.mcmcDiagnostics.maxRankNormalizedRhat.toFixed(4)}, Folded R-hat = ${option3.estimation.mcmcDiagnostics.maxFoldedRhat.toFixed(4)} (${option3.estimation.mcmcDiagnostics.converged ? 'Konvergen' : 'Peringatan'})`,
      assessment: option2.latentModel.converged && option3.estimation.mcmcDiagnostics.converged
        ? 'Kedua sampler mencapai konvergensi stabil.'
        : 'Periksa rantai dengan R-hat > 1.08 sebelum menarik kesimpulan.'
    },
    {
      criterion: '3. Residual structure',
      option2Summary: `Max |Corr residual| = ${(option2.diagnostics.correlatedErrorAudit?.maxAbsResidualCorr ?? 0).toFixed(3)}`,
      option3Summary: `Pasangan berkorelasi terdeteksi = ${option3.estimation.flaggedResidualPairs.length}, Model terpilih = ${option3.estimation.activeDependencyModel}`,
      assessment: option3.estimation.flaggedResidualPairs.length > 0
        ? 'Ketergantungan galat antarsumber aktif — seleksi M1–M4 pada Opsi 3 lebih aman terhadap bias sumber kembar.'
        : 'Asumsi independensi galat bersyarat tampak memadai pada kedua opsi.'
    },
    {
      criterion: '4. Anchor stability',
      option2Summary: 'Tidak dievaluasi lintas marker anchor di dalam Opsi 2',
      option3Summary: `Kendall's W (Total RMSE) = ${option3.estimation.anchorSensitivity.kendallWTotalRmse.toFixed(3)}, Kendall's W (R_j) = ${option3.estimation.anchorSensitivity.kendallWNoiseRatio.toFixed(3)}`,
      assessment: option3.estimation.anchorSensitivity.topSourceFlipAcrossAnchors
        ? 'PENTING: Opsi 3 mengungkap bahwa peringkat Total RMSE bergeser saat anchor diubah!'
        : 'Opsi 3 memverifikasi bahwa kandidat #1 tahan terhadap perubahan rezim anchor.'
    },
    {
      criterion: '5. Ranking stability',
      option2Summary: `Stabilitas posterior #1 = ${(option2.ranking.ranks[0]?.rankingStabilityPct ?? 0).toFixed(1)}%`,
      option3Summary: `P(R=1) = ${((option3.ranking.rows[0]?.probRank1 ?? 0) * 100).toFixed(1)}%, Stabilitas Entitas = ${(option3.ranking.rows[0]?.entityStabilityPct ?? 0).toFixed(1)}%, Waktu = ${(option3.ranking.rows[0]?.temporalStabilityPct ?? 0).toFixed(1)}%`,
      assessment: 'Opsi 3 membedah stabilitas peringkat di dimensi posterior, lintas-entitas, dan lintas-waktu.'
    },
    {
      criterion: '6. Outlier sensitivity',
      option2Summary: `Pergeseran 95% trim merubah urutan? ${option2.diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'YA' : 'TIDAK'}`,
      option3Summary: `Panel Within-Entity MAD outliers = ${option3.preprocessing.totalPanelMadOutliers} sel (Strategi: ${option3.autoDecision.activeConfig.outlierStrategy})`,
      assessment: 'Deteksi dalam-entitas pada Opsi 3 mencegah penandaan palsu pada kota/entitas berpopulasi besar.'
    },
    {
      criterion: '7. Missingness sensitivity',
      option2Summary: option2.diagnostics.missingDataSensitivityAudit?.summary || 'Konsisten antara complete-case dan available-case',
      option3Summary: `${option3.preprocessing.missingnessPatternNote} + Audit simulasi Keluarga G (MCAR/MAR/MNAR)`,
      assessment: 'Keduanya transparan terhadap sel hilang; Opsi 3 memperagakan konsekuensi MNAR secara eksplisit.'
    },
    {
      criterion: '8. Bootstrap stability',
      option2Summary: `Rademacher Wild Cluster Bootstrap (${option2.executionMeta?.bootstrapReplications ?? 999} reps), p omnibus = ${option2.pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}`,
      option3Summary: `${option3.validation.selectedBootstrapMethod} (${option3.autoDecision.activeConfig.bootstrapReplications} reps) + Holm FWER, p omnibus = ${option3.validation.pairFeOmnibusWildP.toFixed(4)}`,
      assessment: option3.datasetSummary.nEntities < 15
        ? 'Distribusi 6-titik Webb pada Opsi 3 lebih akurat untuk jumlah klaster G < 15 (MacKinnon et al., 2023).'
        : 'Inferensi bootstrap klaster konsisten di kedua metode.'
    },
    {
      criterion: '9. LOSO consistency',
      option2Summary: `LOSO Coverage 95% sumber #1 = ${(option2.ranking.ranks[0]?.losoPredictiveCoverage95 ?? 0).toFixed(1)}%`,
      option3Summary: `Perubahan urutan peer saat LOSO = ${option3.validation.losoEntries.filter(e => e.rankChangedAmongPeers).length} sub-model; kovarians diaudit eksplisit`,
      assessment: 'Audit suku kovarians LOSO pada Opsi 3 menjaga validitas dekomposisi varians prediktif.'
    },
    {
      criterion: '10. Computational cost',
      option2Summary: `${option2.executionMeta?.elapsedMs ?? 0} ms`,
      option3Summary: `${option3.elapsedMs} ms`,
      assessment: 'Opsi 2 lebih hemat komputasi; Opsi 3 memberikan jaminan diagnostik dan simulasi Monte Carlo menyeluruh.'
    }
  ];

  // Section 8.5: 6 Evidence-Based Conclusion Categories (No bias toward complexity!)
  let category: ComparativeConclusionCategory;
  let categoryLabel: string;
  let evidenceSummary: string;
  let methodologicalRecommendation: string;

  const bothUnderidentified =
    !option2.qualityReport.latentAudit.isIdentifiedForAllSourceRanking ||
    !option3.estimation.identified;

  const bothInconclusiveTie =
    !option2.ranking.isConclusive &&
    (option3.ranking.verdictStatus === 'INDISTINGUISHABLE_TIE' ||
      option3.ranking.verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY');

  const hasSeverePanelViolationsHandledByOpt3 =
    option3.estimation.anchorSensitivity.topSourceFlipAcrossAnchors ||
    option3.estimation.flaggedResidualPairs.length > 0 ||
    option3.datasetSummary.nEntities < 12 ||
    option3.validation.pairwiseHolmContrasts.some(
      c => c.pWildBootstrap < 0.05 && !c.significantFamilywise05
    );

  if (bothUnderidentified) {
    category = 'BOTH_IDENTIFICATION_LIMITED';
    categoryLabel = 'Kedua Metode Dibatasi oleh Syarat Identifikasi Data (J < 3 atau Sampel Minim)';
    evidenceSummary =
      `Pada J = ${params.dataset.sources.length} sumber dan N_CC = ${option3.datasetSummary.nCompletePairs}, matriks kovarians antarsumber tidak memiliki cukup derajat bebas untuk memisahkan varians galat spesifik sumber secara unik baik pada Opsi 2 maupun Opsi 3.`;
    methodologicalRecommendation =
      'Jangan menetapkan peringkat pemenang dari salah satu metode. Tambahkan minimal sumber pengukuran independen ke-3 atau kalibrasi sub-sampel eksternal terlebih dahulu.';
  } else if (!sameTopRankedSource) {
    category = 'DIVERGENT_RANKINGS_EXPLAINED';
    categoryLabel = 'Kedua Metode Menghasilkan Peringkat Berbeda karena Perbedaan Asumsi & Skala yang Teridentifikasi';
    evidenceSummary = divergenceExplanation;
    methodologicalRecommendation =
      'Laporkan hasil kedua metode secara berdampingan sebagai analisis sensitivitas metodologis: periksa apakah estimand penelitian Anda menuntut satuan fisik asli tanpa penalti anchor atau rasio presisi bebas-skala R_j = σ_j/|λ_j|.';
  } else if (bothInconclusiveTie) {
    category = 'INSUFFICIENT_EVIDENCE_TO_PREFER';
    categoryLabel = 'Bukti Empiris Belum Cukup Kuat untuk Memisahkan Sumber Teratas maupun Mengunggulkan Satu Spesifikasi';
    evidenceSummary =
      `Meskipun kandidat numerik teratas serupa (${opt3TopLabel || '-'}), baik Opsi 2 maupun Opsi 3 menunjukkan tumpang-tindih interval kredibel 95% dan nilai-p terkoreksi Holm yang belum signifikan pada α = 0.05.`;
    methodologicalRecommendation =
      'Nyatakan kandidat teratas sebagai setara secara statistik (seri) dan perluas rentang periode T atau jumlah entitas G sebelum mengeliminasi salah satu instrumen.';
  } else if (sameTopRankedSource && spearmanRankConcordance >= 0.9 && !hasSeverePanelViolationsHandledByOpt3) {
    // Check if simple balanced clean panel makes Option 2 already sufficient & parsimonious, or both concordant
    if (
      option3.estimation.activeDependencyModel === 'M1_INDEPENDENT' &&
      option3.datasetSummary.isBalanced &&
      option3.preprocessing.totalPanelMadOutliers === 0 &&
      option3.datasetSummary.nCompletePairs < 25
    ) {
      category = 'OPTION_2_MORE_DEFENSIBLE';
      categoryLabel = 'Opsi 2 Lebih Parsimonius & Memadai untuk Dataset Panel Kecil yang Bersih';
      evidenceSummary =
        `Kedua metode sepakat penuh pada "${opt3TopLabel}" (Spearman ρ = ${spearmanRankConcordance.toFixed(3)}), tidak ada pelanggaran korelasi galat maupun sensitivitas anchor, dan ukuran sampel kecil membuat spesifikasi parsimonius Opsi 2 sudah memadai tanpa beban parameter tambahan.`;
      methodologicalRecommendation =
        'Gunakan Opsi 2 sebagai spesifikasi utama yang ringkas dan lampirkan konfirmasi sensitivitas multi-anchor Opsi 3 sebagai bukti ketahanan.';
    } else {
      category = 'BOTH_CONSISTENT_CONCORDANT';
      categoryLabel = 'Kedua Metode Konsisten & Konkordan Mendukung Kesimpulan Keandalan Relatif yang Sama';
      evidenceSummary =
        `Opsi 2 dan Opsi 3 menghasilkan urutan keandalan relatif yang selaras (Peringkat #1: "${opt3TopLabel}", Spearman ρ = ${spearmanRankConcordance.toFixed(3)}) dengan konvergensi MCMC yang sehat di kedua mesin.`;
      methodologicalRecommendation =
        'Kesimpulan keandalan relatif memiliki ketahanan lintas-metodologi yang tinggi. Sajikan Opsi 2 sebagai baseline dan Opsi 3 sebagai bukti ketahanan terhadap pemilihan anchor, koreksi Holm, serta Mixed-Effects LoA.';
    }
  } else {
    category = 'OPTION_3_MORE_DEFENSIBLE';
    categoryLabel = 'Opsi 3 Lebih Dapat Dipertahankan secara Metodologis pada Karakteristik Dataset Ini';
    evidenceSummary =
      `Dataset ini menunjukkan kondisi yang memerlukan pengaman metodologis Opsi 3 (${divergenceFactors.length > 0 ? divergenceFactors.join('; ') : `jumlah klaster G = ${option3.datasetSummary.nEntities} dengan pengujian berganda m = ${option3.validation.holmFamilySize} pasangan dan struktur pengukuran berulang`}), yang ditangani secara eksplisit melalui audit multi-anchor, koreksi Holm (1979), Webb Wild Bootstrap, dan Mixed-Effects Bland-Altman LoA.`;
    methodologicalRecommendation =
      'Jadikan Opsi 3 sebagai rujukan inferensi utama untuk pelaporan ketidakpastian dan batas kesepakatan panel, sambil tetap melaporkan hasil Opsi 2 sebagai pembanding baseline yang transparan.';
  }

  return {
    option2,
    option3,
    comparison: {
      evaluatedAt: new Date().toISOString(),
      datasetMeta: {
        entityColumn: params.dataset.cityIdColumn,
        timeColumn: params.dataset.yearColumn,
        nRawRows: params.dataset.observations.length,
        nSources: params.dataset.sources.length,
        sourceLabels: params.dataset.sources.map(s => `${s.name} (${s.label})`),
        option2PreprocessingSummary: opt2PrepDesc,
        option3PreprocessingSummary: opt3PrepDesc,
        preprocessingDiffImpact
      },
      aspectComparisonTable,
      rankingComparison: {
        sameTopRankedSource,
        option2TopLabel: opt2TopLabel,
        option3TopLabel: opt3TopLabel,
        spearmanRankConcordance,
        rows,
        divergenceExplanation
      },
      diagnosticComparison,
      conclusion: {
        category,
        categoryLabel,
        evidenceSummary,
        methodologicalRecommendation,
        noGroundTruthDisclaimer:
          'Peringatan Metodologis: Kesesuaian antara Opsi 2 dan Opsi 3 memperkuat ketahanan inferensi RELATIF lintas spesifikasi model, namun tetap TIDAK membuktikan ketiadaan common-mode bias bersama tanpa Ground Truth eksternal.'
      }
    }
  };
}
