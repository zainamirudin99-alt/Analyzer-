// ============================================================
// Panel Latent Variable Measurement Model — Stata-Style Tables
// & Dynamic Academic Indonesian Statistical Interpretation
// ============================================================

import { PanelLatentFitResultPlaceholder } from './panel-latent-mcmc';
import {
  AcademicInterpretations,
  MeasurementSourceKey,
  StataStyleOutputBundle
} from './panel-latent-types';

const fmt = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : 'NaN');
const pad = (s: string, w: number, right = false) => {
  const str = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return right ? str.padStart(w, ' ') : str.padEnd(w, ' ');
};

export function generateStataStyleBundle(res: PanelLatentFitResultPlaceholder): StataStyleOutputBundle {
  const ciPct = Math.round((res.spec.ciLevel || 0.95) * 100);

  const headerConsoleText = [
    `. * Bayesian Hierarchical Latent Variable Measurement Model`,
    `. * Catatan Mesin: ${res.engineAttribution}`,
    `. * Identifikasi : ${res.identificationAudit.scaleConstraint}; ${res.identificationAudit.locationConstraint}`,
    ``,
    `Bayesian panel measurement model          Number of obs     = ${pad(String(res.nObs), 8, true)}`,
    `Panel structure: ${res.mapping.cityCol} x ${res.mapping.yearCol}      Cities / Years    = ${res.nCities} / ${res.nYears}`,
    `Likelihood     : ${res.spec.likelihood === 'student_t' ? `Student-t(df=${res.spec.studentTDf})` : 'Gaussian (Normal)'}     Chains x Draws    = ${res.diagnostics.chains} x ${res.diagnostics.drawsPerChain}`,
    `MCMC Status    : ${res.diagnostics.convergenceStatusLabel}        Max Split R-hat   = ${fmt(res.diagnostics.maxRHat, 4)}`,
    `Identifikasi   : ${res.identificationAudit.status.toUpperCase()}       Min Bulk ESS      = ${pad(String(res.diagnostics.minEssBulk), 8, true)}`
  ].join('\n');

  const sepLine = '-'.repeat(92);
  const paramHeader =
    `${pad('Parameter', 30)} | ${pad('Mean', 10, true)} ${pad('SD', 9, true)} ${pad(`[${ciPct}% Cred. Interval]`, 21, true)} ${pad('R-hat', 7, true)} ${pad('ESS', 7, true)}`;

  const paramRows = res.parameters.map(p => {
    const ciStr = `${fmt(p.ciLower, 3)} .. ${fmt(p.ciUpper, 3)}`;
    return `${pad(p.label, 30)} | ${pad(fmt(p.mean, 3), 10, true)} ${pad(fmt(p.sd, 3), 9, true)} ${pad(ciStr, 21, true)} ${pad(fmt(p.rHat, 3), 7, true)} ${pad(String(p.essBulk), 7, true)}`;
  });

  const parameterTableText = [
    sepLine,
    paramHeader,
    sepLine,
    ...paramRows,
    sepLine,
    `MCSE/SD max: ${(res.diagnostics.maxMcseRatio * 100).toFixed(2)}% | WAIC: ${fmt(res.ppc.waic, 2)} | RMSE: ${fmt(res.ppc.rmseOverall, 3)}`
  ].join('\n');

  const relHeader =
    `${pad('Indicator', 22)} | ${pad('Self-Reporting (X1)', 21, true)} | ${pad('Satellite (X2)', 21, true)} | ${pad('Sensor (X3)', 21, true)}`;
  const [s1, s2, s3] = res.sourceComparison;
  const rowRel = (title: string, f: (s: typeof s1) => string) =>
    `${pad(title, 22)} | ${pad(f(s1), 21, true)} | ${pad(f(s2), 21, true)} | ${pad(f(s3), 21, true)}`;

  const reliabilityTableText = [
    sepLine,
    relHeader,
    sepLine,
    rowRel('Relative Bias (alpha)', s => (s.isAnchor ? '0.000 (Anchor)' : fmt(s.relativeBiasMean, 3))),
    rowRel('Loading (lambda)', s => (s.isAnchor ? '1.000 (Anchor)' : fmt(s.loadingMean, 3))),
    rowRel('Error Variance', s => fmt(s.errorVarianceMean, 3)),
    rowRel('Error SD (sigma_eps)', s => fmt(s.errorSdMean, 3)),
    rowRel('Reliability (0..1)', s => `${(s.reliability * 100).toFixed(2)}%`),
    rowRel('Noise/Signal Ratio', s => fmt(s.noiseToSignalRatio, 3)),
    sepLine,
    `Catatan: Tanpa ground truth independen, reliabilitas hanya bersifat relatif terhadap asumsi model.`
  ].join('\n');

  const latHeader =
    `${pad('City', 14)} ${pad('Year', 5, true)} | ${pad('X1', 9, true)} ${pad('X2', 9, true)} ${pad('X3', 9, true)} | ${pad('Est. Y*', 10, true)} ${pad(`[${ciPct}% Cred. Int.]`, 21, true)}`;
  const latRows = res.latentEstimates.slice(0, 25).map(r => {
    const ciStr = `${fmt(r.ciLower, 2)} .. ${fmt(r.ciUpper, 2)}`;
    return `${pad(r.city, 14)} ${pad(String(r.year), 5, true)} | ${pad(r.x1 === null ? 'NA' : fmt(r.x1, 1), 9, true)} ${pad(r.x2 === null ? 'NA' : fmt(r.x2, 1), 9, true)} ${pad(r.x3 === null ? 'NA' : fmt(r.x3, 1), 9, true)} | ${pad(fmt(r.latentMean, 2), 10, true)} ${pad(ciStr, 21, true)}`;
  });

  const latentTableText = [
    sepLine,
    latHeader,
    sepLine,
    ...latRows,
    ...(res.latentEstimates.length > 25 ? [`... (${res.latentEstimates.length - 25} baris tambahan tersedia di tabel penuh & ekspor Excel/CSV)`] : []),
    sepLine
  ].join('\n');

  const diagnosticsSummaryText = [
    `Chains: ${res.diagnostics.chains} | Warmup: ${res.diagnostics.warmup} | Post-Warmup Draws: ${res.diagnostics.totalPostWarmupDraws}`,
    `Split R-hat maks: ${fmt(res.diagnostics.maxRHat, 4)} (target <= 1.01, batas keras <= 1.05)`,
    `Bulk ESS min    : ${res.diagnostics.minEssBulk} (target >= 400, batas minimal >= 100)`,
    `Tail ESS min    : ${res.diagnostics.minEssTail}`,
    `PPC p-value Mean: ${fmt(res.ppc.bayesianPValueMean, 3)} | PPC p-value SD: ${fmt(res.ppc.bayesianPValueSd, 3)}`,
    `Korelasi Residu : r(e1,e2)=${fmt(res.identificationAudit.residualErrorCorrelations.r12, 3)}, r(e1,e3)=${fmt(res.identificationAudit.residualErrorCorrelations.r13, 3)}, r(e2,e3)=${fmt(res.identificationAudit.residualErrorCorrelations.r23, 3)}`
  ].join('\n');

  return {
    headerConsoleText,
    parameterTableText,
    reliabilityTableText,
    latentTableText,
    diagnosticsSummaryText
  };
}

export function generateDynamicInterpretations(res: PanelLatentFitResultPlaceholder): AcademicInterpretations {
  const ciPct = Math.round((res.spec.ciLevel || 0.95) * 100);
  const nameOf = (k: MeasurementSourceKey) =>
    res.sourceComparison.find(s => s.sourceKey === k)?.sourceLabel || k;

  const anchorRow = res.sourceComparison.find(s => s.isAnchor);
  const nonAnchors = res.sourceComparison.filter(s => !s.isAnchor);

  const biasNotes = nonAnchors.map(s => {
    const sig = s.relativeBiasCI[0] > 0 || s.relativeBiasCI[1] < 0;
    const dir = s.relativeBiasMean > 0 ? 'lebih tinggi (over-estimate relatif)' : 'lebih rendah (under-estimate relatif)';
    return `${s.sourceLabel} memiliki bias relatif α = ${fmt(s.relativeBiasMean, 3)} (SD = ${fmt(s.relativeBiasSd, 3)}, ${ciPct}% CI [${fmt(s.relativeBiasCI[0], 3)}, ${fmt(s.relativeBiasCI[1], 3)}]), yang ${sig ? `berbeda nyata secara statistik (${dir})` : 'tidak berbeda signifikan dari nol terhadap jangkar'}`;
  });

  const loadingNotes = nonAnchors.map(
    s =>
      `${s.sourceLabel} menunjukkan sensitivitas (loading) λ = ${fmt(s.loadingMean, 3)} (${ciPct}% CI [${fmt(s.loadingCI[0], 3)}, ${fmt(s.loadingCI[1], 3)}])`
  );

  const parameterInterpretation = [
    `Estimasi model Bayesian hierarkis (${res.spec.likelihood === 'student_t' ? 'Student-t likelihood tahan outlier' : 'Gaussian likelihood'}) menggunakan strategi identifikasi ${
      res.spec.identification === 'anchor'
        ? `jangkar pada ${anchorRow?.sourceLabel || res.spec.anchorSource} (α = 0, λ = 1)`
        : 'faktor laten terstandarisasi (μ = 0, SD(Y*) = 1)'
    }.`,
    ...biasNotes.map(n => `${n}.`),
    ...loadingNotes.map(n => `${n}.`),
    `Standar deviasi posterior (SD) menggambarkan lebar ketidakpastian parameter sesudah mengamati ${res.nObs} observasi kota-tahun, sedangkan ${ciPct}% Credible Interval menunjukkan rentang nilai parameter yang memuat probabilitas posterior sebesar ${ciPct}%.`
  ].join(' ');

  const bestRel = res.sourceComparison.find(s => s.sourceKey === res.sourceEvaluation.highestReliabilitySource)!;
  const lowErr = res.sourceComparison.find(s => s.sourceKey === res.sourceEvaluation.lowestErrorVarianceSource)!;
  const highUnc = res.sourceComparison.find(s => s.sourceKey === res.sourceEvaluation.highestUncertaintySource)!;

  const reliabilityInterpretation = [
    `Reliabilitas masing-masing sumber didefinisikan secara matematis sebagai proporsi varians sinyal laten terhadap total varians pengukuran: Reliability_j = (λ_j² · Var(Y*)) / (λ_j² · Var(Y*) + σ²_ε,j).`,
    `Berdasarkan metrik ini, ${bestRel.sourceLabel} mencapai reliabilitas relatif tertinggi sebesar ${(bestRel.reliability * 100).toFixed(2)}% (λ = ${fmt(bestRel.loadingMean, 3)}, Error SD = ${fmt(bestRel.errorSdMean, 3)}).`,
    `Sumber dengan varians error pengukuran terkecil adalah ${lowErr.sourceLabel} (σ²_ε = ${fmt(lowErr.errorVarianceMean, 3)}), sedangkan sumber dengan ketidakpastian pengukuran tertinggi adalah ${highUnc.sourceLabel} (σ_ε = ${fmt(highUnc.uncertaintySd, 3)}, rasio noise-to-signal = ${fmt(highUnc.noiseToSignalRatio, 3)}).`,
    res.sourceEvaluation.biasedSources.length > 0
      ? `Indikasi bias relatif aditif terdeteksi pada: ${res.sourceEvaluation.biasedSources.map(nameOf).join(', ')} (CI ${ciPct}% tidak mencakup 0).`
      : 'Tidak terdapat sumber non-jangkar yang menunjukkan bias aditif signifikan terhadap jangkar (seluruh CI bias mencakup 0).',
    `PENTING: Nilai loading (λ) yang besar tidak otomatis menandakan akurasi tinggi apabila disertai varians error (σ²_ε) yang besar, dan seluruh peringkat reliabilitas bersifat relatif tanpa data ground truth eksternal.`
  ].join(' ');

  const latMeans = res.latentEstimates.map(e => e.latentMean);
  const maxLat = res.latentEstimates.reduce((a, b) => (b.latentMean > a.latentMean ? b : a), res.latentEstimates[0]);
  const minLat = res.latentEstimates.reduce((a, b) => (b.latentMean < a.latentMean ? b : a), res.latentEstimates[0]);
  const avgLat = latMeans.reduce((a, b) => a + b, 0) / Math.max(1, latMeans.length);
  const avgWidth =
    res.latentEstimates.reduce((a, b) => a + (b.ciUpper - b.ciLower), 0) / Math.max(1, res.latentEstimates.length);

  const latentEmissionInterpretation = [
    `Model menghasilkan estimasi tunggal emisi CO₂ laten (Y*_it) untuk setiap ${res.nObs} pasangan kota-tahun (${res.nCities} kota × ${res.nYears} periode) pada satuan ${res.scaleContext.workingUnitNote}.`,
    `Rata-rata estimasi Y* keseluruhan adalah ${fmt(avgLat, 2)} dengan lebar rata-rata ${ciPct}% Credible Interval sebesar ${fmt(avgWidth, 2)}.`,
    maxLat && minLat
      ? `Emisi laten tertinggi tercatat pada ${maxLat.city} (${maxLat.year}) sebesar ${fmt(maxLat.latentMean, 2)} (95% CI [${fmt(maxLat.ciLower, 2)}, ${fmt(maxLat.ciUpper, 2)}]), sedangkan terendah pada ${minLat.city} (${minLat.year}) sebesar ${fmt(minLat.latentMean, 2)} (95% CI [${fmt(minLat.ciLower, 2)}, ${fmt(minLat.ciUpper, 2)}]).`
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  const diagnosticsInterpretation = [
    `Status konvergensi MCMC: ${res.diagnostics.convergenceStatusLabel}. Nilai Split R-hat maksimum seluruh parameter bebas adalah ${fmt(res.diagnostics.maxRHat, 4)} (standar baik ≤ 1.01; batas gagal > 1.05) dan Effective Sample Size (Bulk ESS) minimum sebesar ${res.diagnostics.minEssBulk} dari total ${res.diagnostics.totalPostWarmupDraws} sampel pasca-warmup.`,
    res.diagnostics.isConverged
      ? 'Nilai R-hat mendekati 1.0 dan ESS yang memadai menandakan keempat rantai MCMC telah menyatu pada distribusi posterior stasioner yang sama.'
      : 'PERINGATAN KRITIS: Konvergensi MCMC belum tercapai sepenuhnya. Hasil estimasi tidak boleh disimpulkan valid sebelum jumlah iterasi/warmup ditingkatkan atau spesifikasi model disederhanakan.',
    `Posterior Predictive Check menghasilkan Bayesian p-value rata-rata = ${fmt(res.ppc.bayesianPValueMean, 3)} dan SD = ${fmt(res.ppc.bayesianPValueSd, 3)} (nilai antara 0.10–0.90 menandakan kecocokan distribusi data simulasi posterior dengan data observasi).`
  ].join(' ');

  const maxShift = Math.max(...res.sensitivity.map(s => s.maxRelativeShiftPct), 0);
  const bestWaic = [...res.modelComparison].sort((a, b) => a.waic - b.waic)[0];
  const sensitivityInterpretation = [
    `Analisis sensitivitas prior membandingkan tiga rezim (Weakly Informative, Skeptical Tight, Diffuse Wide) dan menunjukkan pergeseran maksimum parameter loading sebesar ${maxShift.toFixed(2)}% (${maxShift < 10 ? 'estimasi relatif stabil terhadap perubahan prior' : 'estimasi sensitif terhadap pilihan prior; data mungkin terbatas'}).`,
    bestWaic
      ? `Dalam perbandingan spesifikasi model menggunakan WAIC, model dengan kecocokan prediktif terbaik (WAIC terendah) adalah "${bestWaic.specLabel}" (WAIC = ${fmt(bestWaic.waic, 2)}, RMSE = ${fmt(bestWaic.rmseOverall, 3)}).`
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  const methodologyAndIdentificationNote = [
    res.identificationAudit.explanation,
    `Pada model berjalan, status identifikasi adalah "${res.identificationAudit.status.toUpperCase()}" (${res.identificationAudit.scaleConstraint}; ${res.identificationAudit.locationConstraint}).`,
    res.identificationAudit.conditionalIndependenceFlag
      ? `Ditemukan korelasi residu antar sumber di atas 0.35 (r12=${fmt(res.identificationAudit.residualErrorCorrelations.r12, 3)}, r13=${fmt(res.identificationAudit.residualErrorCorrelations.r13, 3)}, r23=${fmt(res.identificationAudit.residualErrorCorrelations.r23, 3)}), mengindikasikan kemungkinan error antar dua sumber saling berkorelasi.`
      : `Korelasi residu antar sumber tergolong rendah (maks |r| = ${fmt(Math.max(Math.abs(res.identificationAudit.residualErrorCorrelations.r12), Math.abs(res.identificationAudit.residualErrorCorrelations.r13), Math.abs(res.identificationAudit.residualErrorCorrelations.r23)), 3)}), mendukung asumsi independensi kondisional.`
  ].join(' ');

  const researchLimitations = [
    'Tidak tersedianya data referensi ground truth absolut membuat bias relatif (α) dan reliabilitas hanya valid relatif terhadap jangkar/asumsi identifikasi model.',
    'Model mengasumsikan conditional independence antar measurement error sumber (Cov(ε_j, ε_k | Y*) = 0); jika dua sumber memakai metodologi serupa (mis. inventarisasi dan faktor emisi sama), reliabilitas semu bisa sedikit meningkat.',
    res.isBalanced
      ? 'Ukuran sampel panel dan jumlah periode memengaruhi presisi efek acak kota (u_i), efek waktu (γ_t), serta parameter AR(1) ρ.'
      : 'Struktur panel tidak seimbang (unbalanced) dan kemungkinan nilai sumber hilang berimplikasi pada ketidakpastian (lebar CI) lebih besar pada kombinasi kota-tahun dengan jumlah sumber teramati < 3.',
    `Komputasi dieksekusi oleh ${res.engineAttribution}; skrip Stan dan R yang dihasilkan disediakan untuk replikasi lokal di CmdStan/brms.`
  ];

  const finalConclusion =
    !res.diagnostics.isConverged || !res.identificationAudit.isIdentified
      ? `Estimasi belum konvergen atau identifikasi lemah (status: ${res.diagnostics.convergenceStatusLabel}, identifikasi: ${res.identificationAudit.status}). Perbaiki spesifikasi model atau tambah jumlah iterasi sebelum menarik kesimpulan substantif.`
      : `Dengan konvergensi MCMC tercapai (R-hat maks = ${fmt(res.diagnostics.maxRHat, 3)}, Min ESS = ${res.diagnostics.minEssBulk}), model Bayesian Hierarchical Measurement Model berhasil mengintegrasikan ketiga sumber (X1, X2, X3) menjadi estimasi emisi CO₂ laten tunggal pada skala ${res.scaleContext.workingUnitNote}. Sumber dengan reliabilitas relatif tertinggi adalah ${bestRel.sourceLabel} (${(bestRel.reliability * 100).toFixed(1)}%), sedangkan ${highUnc.sourceLabel} memiliki ketidakpastian terbesar (σ_ε = ${fmt(highUnc.uncertaintySd, 3)}). Temuan ini merefleksikan konsistensi relatif antar sumber di bawah asumsi identifikasi model, bukan klaim akurasi absolut tanpa referensi independen.`;

  return {
    parameterInterpretation,
    reliabilityInterpretation,
    latentEmissionInterpretation,
    diagnosticsInterpretation,
    sensitivityInterpretation,
    methodologyAndIdentificationNote,
    researchLimitations,
    finalConclusion
  };
}

