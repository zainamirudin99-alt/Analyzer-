// ============================================================
// Multi-Sheet Excel (.xlsx) Export Builder
// Menghasilkan workbook Excel lengkap untuk Analisis Regresi Statistik:
// - Auto-fit lebar kolom (ws['!cols']) di seluruh sheet agar tabel rapi & terbaca penuh
// - Format desimal presisi (4 desimal) dengan tipe numerik asli untuk rumus Excel
// - Sheet 1: Ringkasan_Model
// - Sheet 2: Statistik_Deskriptif
// - Sheet 3: Tabel_SPSS_Utama (Variables Entered, Model Summary, ANOVA, Coefficients, Collinearity Diagnostics, Residuals Stats)
// - Sheet 4: Diagnostik_Asumsi_Rekomendasi
// - Sheet 5: Perbandingan_Model (M0 vs M1..Mk)
// - Sheet 6: Residu_Prediksi_Data
// ============================================================

import * as XLSX from 'xlsx';
import { OLSFitResult } from './regression-engine';
import { ModelComparisonReport } from './regression-model-comparison';
import { RecommendationEngineOutput } from './regression-recommendation-engine';
import { sanitizeCellValue } from './file-signature';

export interface XlsxExportOptions {
  result: OLSFitResult;
  datasetName: string;
  sheetName: string;
  comparisonReport?: ModelComparisonReport;
  recommendationOutput?: RecommendationEngineOutput;
}

function roundNum(val: number | undefined | null, digits = 4): number | string {
  if (val === undefined || val === null || isNaN(val) || !isFinite(val)) return '-';
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

function createAutoSizedSheet(rows: any[][], minWch = 11, maxWch = 58): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths: number[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIdx) => {
      const str = cell === null || cell === undefined ? '' : String(cell);
      // Ambil baris terpanjang bila ada newline di dalam sel
      const longestLine = str
        .split(/\r?\n/)
        .reduce((max, line) => Math.max(max, line.length), 0);
      const currentMax = colWidths[colIdx] || minWch;
      colWidths[colIdx] = Math.min(maxWch, Math.max(currentMax, longestLine + 4));
    });
  }

  ws['!cols'] = colWidths.map(wch => ({ wch }));
  return ws;
}

/**
 * Membangun Buffer file Excel (.xlsx) multi-sheet
 */
export function generateRegressionXLSX(options: XlsxExportOptions): Buffer {
  const { result, datasetName, sheetName, comparisonReport, recommendationOutput } = options;
  const wb = XLSX.utils.book_new();

  // ----------------------------------------------------------
  // Sheet 1: Ringkasan_Model
  // ----------------------------------------------------------
  const summaryRows: any[][] = [
    ['LAPORAN EKSEKUTIF ANALISIS REGRESI LINIER (STANDAR SPSS)'],
    ['Dicetak Pada (UTC)', new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['Versi Mesin Statistik', result.engineVersion],
    ['Nama Berkas Dataset', sanitizeCellValue(datasetName)],
    ['Nama Sheet Aktif', sanitizeCellValue(sheetName)],
    ['Tipe Model Regresi', result.modelType === 'SLR' ? 'Simple Linear Regression (SLR)' : 'Multiple Linear Regression (MLR)'],
    ['Metode Masuk Variabel', result.variables.enteredMethod || 'Enter'],
    ['Variabel Dependen (Y)', sanitizeCellValue(result.variables.yCol)],
    ['Variabel Independen (X)', sanitizeCellValue(result.variables.xCols.join(', '))],
    ['Jumlah Prediktor (k)', result.kPredictors],
    ['Sampel Awal (N Initial)', result.sampleSize.nInitial],
    ['Sampel Valid Digunakan (N Used)', result.sampleSize.nUsed],
    ['Baris Dihapus (Listwise)', result.sampleSize.rowsDropped],
    ['Jalur Deret Waktu (Time Series)', result.timeSeriesSummary?.isTimeSeries ? `Ya (${result.timeSeriesSummary.timeCol || '-'})` : 'Tidak (Cross-Sectional)'],
    ['Skor Kesesuaian Benchmark SPSS (S3)', `${result.scores.s3Consistency}% (${result.scores.checksPassed}/${result.scores.totalChecks})`],
    [],
    ['RINGKASAN KEBAIKAN SUAI (MODEL FIT SUMMARY)'],
    ['Metrik Statistik', 'Nilai Numerik', 'Keterangan Interpretasi'],
    ['Multiple R (Koefisien Korelasi Berganda)', roundNum(result.modelSummary.r, 4), 'Kekuatan hubungan linier gabungan antara X dan Y'],
    ['R Square (Koefisien Determinasi)', roundNum(result.modelSummary.rSquared, 4), `${(result.modelSummary.rSquared * 100).toFixed(2)}% variasi ${result.variables.yCol} dijelaskan oleh model`],
    ['Adjusted R Square', roundNum(result.modelSummary.adjRSquared, 4), 'R² terkoreksi derajat bebas (jumlah prediktor)'],
    ['Std. Error of the Estimate', roundNum(result.modelSummary.stdErrorEstimate, 4), 'Simpangan baku galat prediksi model'],
    ['F-Statistic (Uji Simultan ANOVA)', roundNum(result.anova.regression.f, 4), `df = (${result.anova.regression.df}, ${result.anova.residual.df})`],
    ['Prob > F (Signifikansi Simultan)', roundNum(result.anova.regression.sig, 6), result.anova.regression.sig < 0.05 ? 'Signifikan secara simultan (p < 0.05)' : 'Tidak signifikan secara simultan (p >= 0.05)'],
    ['Durbin-Watson Statistic', roundNum(result.modelSummary.durbinWatson, 4), 'Statistik uji autokorelasi residual orde pertama']
  ];
  const wsSummary = createAutoSizedSheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan_Model');

  // ----------------------------------------------------------
  // Sheet 2: Statistik_Deskriptif
  // ----------------------------------------------------------
  const descRows: any[][] = [
    ['TABEL 3.0: DESCRIPTIVE STATISTICS (STANDAR SPSS)'],
    [`Dependent Variable: ${sanitizeCellValue(result.variables.yCol)}`],
    [],
    ['Nama Variabel', 'Peran Variabel', 'N Valid', 'Mean (Rata-rata)', 'Std. Deviation', 'Minimum', 'Maximum']
  ];
  if (result.descriptiveStatistics && result.descriptiveStatistics.length > 0) {
    result.descriptiveStatistics.forEach((d, idx) => {
      descRows.push([
        sanitizeCellValue(d.variable),
        idx === 0 ? 'Dependen (Y)' : `Independen (X${idx})`,
        d.n,
        roundNum(d.mean, 4),
        roundNum(d.stdDev, 4),
        roundNum(d.min, 4),
        roundNum(d.max, 4)
      ]);
    });
  }
  const wsDesc = createAutoSizedSheet(descRows);
  XLSX.utils.book_append_sheet(wb, wsDesc, 'Statistik_Deskriptif');

  // ----------------------------------------------------------
  // Sheet 3: Tabel_SPSS_Utama
  // ----------------------------------------------------------
  const spssRows: any[][] = [
    ['TABEL 3.1: VARIABLES ENTERED / REMOVED'],
    ['Model', 'Variables Entered', 'Variables Removed', 'Method', 'Dependent Variable'],
    [1, sanitizeCellValue(result.variables.xCols.join(', ')), '.', result.variables.enteredMethod || 'Enter', sanitizeCellValue(result.variables.yCol)],
    [],
    ['TABEL 3.2: MODEL SUMMARY'],
    ['Model', 'R', 'R Square', 'Adjusted R Square', 'Std. Error of the Estimate', 'Durbin-Watson'],
    [
      result.modelSummary.model,
      roundNum(result.modelSummary.r, 4),
      roundNum(result.modelSummary.rSquared, 4),
      roundNum(result.modelSummary.adjRSquared, 4),
      roundNum(result.modelSummary.stdErrorEstimate, 4),
      roundNum(result.modelSummary.durbinWatson, 4)
    ],
    [],
    ['TABEL 3.3: ANOVA (ANALYSIS OF VARIANCE)'],
    ['Source of Variation', 'Sum of Squares', 'df', 'Mean Square', 'F', 'Sig. (p-value)'],
    [
      'Regression',
      roundNum(result.anova.regression.ss, 4),
      result.anova.regression.df,
      roundNum(result.anova.regression.ms, 4),
      roundNum(result.anova.regression.f, 4),
      roundNum(result.anova.regression.sig, 6)
    ],
    ['Residual', roundNum(result.anova.residual.ss, 4), result.anova.residual.df, roundNum(result.anova.residual.ms, 4), '', ''],
    ['Total', roundNum(result.anova.total.ss, 4), result.anova.total.df, '', '', ''],
    [],
    ['TABEL 3.4: COEFFICIENTS & COLLINEARITY STATISTICS'],
    [
      'Variabel',
      'Unstandardized B',
      'Std. Error',
      'Standardized Beta',
      't-Statistic',
      'Sig. (p-value)',
      '95% CI Lower',
      '95% CI Upper',
      'Zero-Order r',
      'Partial r',
      'Part r',
      'Tolerance',
      'VIF',
      'Kesimpulan (α=0.05)'
    ]
  ];

  result.coefficients.forEach(c => {
    const isConst = c.variable === '(Constant)';
    spssRows.push([
      sanitizeCellValue(c.variable),
      roundNum(c.b, 4),
      roundNum(c.stdError, 4),
      isConst ? '' : roundNum(c.beta, 4),
      roundNum(c.t, 4),
      roundNum(c.sig, 6),
      roundNum(c.ciLower, 4),
      roundNum(c.ciUpper, 4),
      isConst ? '' : roundNum(c.correlations.zeroOrder, 4),
      isConst ? '' : roundNum(c.correlations.partial, 4),
      isConst ? '' : roundNum(c.correlations.part, 4),
      isConst ? '' : roundNum(c.collinearity.tolerance, 4),
      isConst ? '' : roundNum(c.collinearity.vif, 4),
      isConst ? 'Intersep / Konstanta' : c.sig < 0.05 ? 'Signifikan (p < 0.05)' : 'Tidak Signifikan'
    ]);
  });

  if (result.collinearityDiagnostics && result.collinearityDiagnostics.length > 0) {
    const vpKeys = Object.keys(result.collinearityDiagnostics[0].varianceProportions || {});
    spssRows.push(
      [],
      ['TABEL 3.5: COLLINEARITY DIAGNOSTICS (BELSLEY-KUH-WELSCH)'],
      ['Dimension', 'Eigenvalue', 'Condition Index', ...vpKeys.map(k => `VP: ${sanitizeCellValue(k)}`)]
    );
    result.collinearityDiagnostics.forEach(cd => {
      spssRows.push([
        cd.dimension,
        roundNum(cd.eigenvalue, 4),
        roundNum(cd.conditionIndex, 4),
        ...vpKeys.map(k => roundNum(cd.varianceProportions[k], 4))
      ]);
    });
  }

  if (result.residualsStatistics && result.residualsStatistics.length > 0) {
    spssRows.push(
      [],
      ['TABEL 3.6: RESIDUALS STATISTICS'],
      ['Metric', 'Minimum', 'Maximum', 'Mean', 'Std. Deviation', 'N']
    );
    result.residualsStatistics.forEach(rs => {
      spssRows.push([
        rs.metric,
        roundNum(rs.min, 4),
        roundNum(rs.max, 4),
        roundNum(rs.mean, 4),
        roundNum(rs.stdDev, 4),
        rs.n
      ]);
    });
  }

  const wsSpss = createAutoSizedSheet(spssRows);
  XLSX.utils.book_append_sheet(wb, wsSpss, 'Tabel_SPSS_Utama');

  // ----------------------------------------------------------
  // Sheet 4: Diagnostik_Asumsi
  // ----------------------------------------------------------
  const diagRows: any[][] = [
    ['TABEL 4.1: REKAPITULASI PENGUJIAN ASUMSI KLASIK REGRESI OLS'],
    ['Nama Uji Asumsi', 'Statistik Uji', 'Sig. / p-value', 'Derajat Bebas (df)', 'Kriteria Pengujian', 'Status Kelulusan', 'Penjelasan Diagnostik']
  ];
  result.assumptions.forEach(a => {
    diagRows.push([
      sanitizeCellValue(a.name),
      roundNum(a.statistic, 4),
      a.pValue !== undefined ? roundNum(a.pValue, 6) : '-',
      a.df !== undefined ? String(a.df) : '-',
      sanitizeCellValue(a.criteria),
      a.status.toUpperCase(),
      sanitizeCellValue(a.reason)
    ]);
  });

  if (recommendationOutput && recommendationOutput.cards.length > 0) {
    diagRows.push([]);
    diagRows.push(['TABEL 4.2: REKOMENDASI TINDAK LANJUT & PENANGANAN STATISTIK']);
    diagRows.push([
      'Nama Pengujian Asumsi',
      'Status Evaluasi',
      'Statistik Uji',
      'Nilai p-value',
      'Keputusan H0',
      'Interpretasi Statistik',
      'Dampak terhadap Model',
      'Rekomendasi Utama',
      'Langkah Selanjutnya'
    ]);
    recommendationOutput.cards.forEach(card => {
      diagRows.push([
        sanitizeCellValue(card.testName),
        sanitizeCellValue(card.status),
        `${sanitizeCellValue(card.statisticName)} = ${roundNum(card.statistic, 4)}`,
        card.pValue !== undefined ? roundNum(card.pValue, 6) : '-',
        sanitizeCellValue(card.h0Decision),
        sanitizeCellValue(card.interpretation),
        sanitizeCellValue(card.modelImpact),
        sanitizeCellValue(card.primaryRecommendation),
        sanitizeCellValue(`${card.availableActions.actionLabel} — ${card.availableActions.explanationText}`)
      ]);
    });
  }
  const wsDiag = createAutoSizedSheet(diagRows);
  XLSX.utils.book_append_sheet(wb, wsDiag, 'Diagnostik_Asumsi');

  // ----------------------------------------------------------
  // Sheet 5: Rekomendasi_Remedial (Detail Alternatif & Konsekuensi)
  // ----------------------------------------------------------
  const recRows: any[][] = [
    ['TABEL 5.0: DETAIL REKOMENDASI REMEDIAL & KONSEKUENSI METODOLOGIS'],
    [
      'ID Uji',
      'Nama Pengujian',
      'Status',
      'Rekomendasi Utama',
      'Alternatif Metode',
      'Perubahan Koefisien',
      'Perubahan SE',
      'Perubahan p-value',
      'Perubahan Ukuran Sampel'
    ]
  ];
  if (recommendationOutput && recommendationOutput.cards.length > 0) {
    recommendationOutput.cards.forEach(c => {
      const altNames = c.alternativeMethods.map(a => a.name).join(' | ') || '-';
      recRows.push([
        c.id,
        sanitizeCellValue(c.testName),
        c.status,
        sanitizeCellValue(c.primaryRecommendation),
        sanitizeCellValue(altNames),
        sanitizeCellValue(c.methodologicalConsequences.coefficientsDetail),
        sanitizeCellValue(c.methodologicalConsequences.standardErrorDetail),
        sanitizeCellValue(c.methodologicalConsequences.pValueDetail),
        sanitizeCellValue(c.methodologicalConsequences.sampleSizeDetail)
      ]);
    });
  } else {
    recRows.push(['-', 'Tidak ada kartu rekomendasi tambahan', '-', '-', '-', '-', '-', '-', '-']);
  }
  const wsRec = createAutoSizedSheet(recRows);
  XLSX.utils.book_append_sheet(wb, wsRec, 'Rekomendasi_Remedial');

  // ----------------------------------------------------------
  // Sheet 6: Perbandingan_Model
  // ----------------------------------------------------------
  const compRows: any[][] = [
    ['TABEL 6.1: MATRIKS PERBANDINGAN SPESIFIKASI MODEL (M0 vs REMEDIAL)']
  ];
  if (comparisonReport && comparisonReport.models.length > 0) {
    compRows.push(
      ['Model Inferensial Terbaik', `${comparisonReport.bestInferentialModel.modelId}: ${sanitizeCellValue(comparisonReport.bestInferentialModel.title)}`, sanitizeCellValue(comparisonReport.bestInferentialModel.justification)],
      ['Model Prediktif Terbaik', `${comparisonReport.bestPredictiveModel.modelId}: ${sanitizeCellValue(comparisonReport.bestPredictiveModel.title)}`, sanitizeCellValue(comparisonReport.bestPredictiveModel.justification)],
      [],
      [
        'Model ID',
        'Nama Spesifikasi',
        'Klasifikasi',
        'N Valid',
        'R Square',
        'Adjusted R Square',
        'F-Statistic',
        'Prob > F',
        'Std. Error',
        'RMSE',
        'MAE',
        'AIC',
        'BIC',
        'Asumsi Lulus',
        'Direkomendasikan'
      ]
    );
    comparisonReport.models.forEach(m => {
      const isRec = m.modelId === comparisonReport.bestInferentialModel.modelId;
      compRows.push([
        m.modelId,
        sanitizeCellValue(m.title),
        m.label,
        m.sampleSize,
        roundNum(m.rSquared, 4),
        roundNum(m.adjRSquared, 4),
        roundNum(m.fStat, 4),
        roundNum(m.fSig, 6),
        roundNum(m.stdErrorEstimate, 4),
        roundNum(m.rmse, 4),
        roundNum(m.mae, 4),
        roundNum(m.aic, 3),
        roundNum(m.bic, 3),
        m.allAssumptionsPassed ? 'LULUS SEMUA' : 'PERLU EVALUASI',
        isRec ? 'YA (Terbaik)' : 'Tidak'
      ]);
    });
  } else {
    compRows.push(['Hanya terdapat model utama M0 (belum ada model perbandingan remedial).']);
  }
  const wsComp = createAutoSizedSheet(compRows);
  XLSX.utils.book_append_sheet(wb, wsComp, 'Perbandingan_Model');

  // ----------------------------------------------------------
  // Sheet 7: Matriks_Keputusan_Kriteria
  // ----------------------------------------------------------
  const critRows: any[][] = [
    ['TABEL 7.1: MATRIKS KEPUTUSAN LINTAS INDIKATOR (AIC, BIC, RMSE, DIAGNOSTIK)'],
    ['Indikator Evaluasi', 'Kategori Metrik', 'Model Terbaik', 'Rincian Nilai Antar Model']
  ];
  if (comparisonReport && comparisonReport.comparisonMatrix.length > 0) {
    comparisonReport.comparisonMatrix.forEach(row => {
      const valSummary = Object.entries(row.values)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
      critRows.push([
        sanitizeCellValue(row.indicator),
        row.category,
        row.bestModelId || '-',
        sanitizeCellValue(valSummary)
      ]);
    });
  } else {
    critRows.push(['R Square', 'goodness_of_fit', 'M0', `M0: ${roundNum(result.modelSummary.rSquared, 4)}`]);
  }
  const wsCrit = createAutoSizedSheet(critRows);
  XLSX.utils.book_append_sheet(wb, wsCrit, 'Matriks_Kriteria');

  // ----------------------------------------------------------
  // Sheet 8: Residu_Prediksi
  // ----------------------------------------------------------
  const resRows: any[][] = [
    ['DATA OBSERVASI: NILAI PREDIKSI (FITTED), RESIDUAL, & STANDARDIZED RESIDUAL'],
    ['No. Observasi', 'Predicted Value (Ŷ)', 'Unstandardized Residual (e)', 'Standardized Residual (ZRESID)', 'Status Outlier (|Z| > 3)']
  ];
  const stdErr = result.modelSummary.stdErrorEstimate || 1;
  result.plots.resVsFit.forEach((p, idx) => {
    const zResid = p.residual / stdErr;
    resRows.push([
      idx + 1,
      roundNum(p.fitted, 5),
      roundNum(p.residual, 5),
      roundNum(zResid, 4),
      Math.abs(zResid) > 3 ? 'Outlier Ekstrem (|Z| > 3)' : 'Normal'
    ]);
  });
  const wsRes = createAutoSizedSheet(resRows);
  XLSX.utils.book_append_sheet(wb, wsRes, 'Residu_Prediksi');

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

export const buildRegressionXlsxBuffer = generateRegressionXLSX;
