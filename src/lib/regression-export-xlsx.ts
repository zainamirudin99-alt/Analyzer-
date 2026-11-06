// ============================================================
// Multi-Tab Excel Workbook Exporter for Regression Analysis
// Produces 8 comprehensive sheets matching IBM SPSS Statistics
// and academic report requirements.
// ============================================================

import * as XLSX from 'xlsx';
import { OLSFitResult } from './regression-engine';
import { ModelComparisonReport } from './regression-model-comparison';
import { RecommendationEngineOutput } from './regression-recommendation-engine';

export interface ExcelExportPayload {
  result: OLSFitResult;
  datasetName: string;
  sheetName?: string;
  comparisonReport?: ModelComparisonReport;
  recommendationOutput?: RecommendationEngineOutput;
}

export function generateRegressionXLSX(payload: ExcelExportPayload): Buffer {
  const { result, datasetName, sheetName = 'Sheet1', comparisonReport, recommendationOutput } = payload;
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // Sheet 1: Metadata & Executive Summary
  // -------------------------------------------------------------
  const summaryRows = [
    ['ANALISIS REGRESI STATISTIK (SPSS-COMPATIBLE ENGINE)'],
    ['Laporan Hasil Estimasi Ordinary Least Squares (OLS)'],
    [],
    ['Parameter', 'Keterangan / Nilai'],
    ['Nama Berkas Dataset', datasetName],
    ['Lembar Kerja Aktif', sheetName],
    ['Tipe Model Regresi', result.modelType === 'SLR' ? 'Simple Linear Regression (SLR)' : 'Multiple Linear Regression (MLR)'],
    ['Variabel Dependen (Y)', result.variables.yCol],
    ['Variabel Independen (X)', result.variables.xCols.join(', ')],
    ['Metode Seleksi Variabel', result.variables.enteredMethod || 'Enter'],
    ['Ukuran Sampel Awal (N Initial)', result.sampleSize.nInitial],
    ['Ukuran Sampel Terpakai (N Used)', result.sampleSize.nUsed],
    ['Data Dihapus (Listwise Deletion)', result.sampleSize.rowsDropped],
    ['Deret Waktu (Time Series)', result.timeSeriesSummary?.isTimeSeries ? 'Ya' : 'Bukan'],
    [],
    ['Ringkasan Goodness of Fit'],
    ['Koefisien Korelasi Ganda (R)', result.modelSummary.r],
    ['Koefisien Determinasi (R Square)', result.modelSummary.rSquared],
    ['Adjusted R Square', result.modelSummary.adjRSquared],
    ['Std. Error of the Estimate', result.modelSummary.stdErrorEstimate],
    ['F-Statistic', result.anova.regression.f],
    ['Signifikansi F (p-value)', result.anova.regression.sig],
    ['Durbin-Watson', result.modelSummary.durbinWatson]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Eksekutif');

  // -------------------------------------------------------------
  // Sheet 2: Descriptive Statistics
  // -------------------------------------------------------------
  const descRows = [
    ['Tabel 1: Descriptive Statistics (Listwise Deletion)'],
    ['Variabel', 'N Valid', 'Mean', 'Std. Deviation', 'Minimum', 'Maximum']
  ];
  if (result.descriptiveStatistics) {
    for (const d of result.descriptiveStatistics) {
      descRows.push([d.variable, d.n as any, d.mean as any, d.stdDev as any, d.min as any, d.max as any]);
    }
  }
  const wsDesc = XLSX.utils.aoa_to_sheet(descRows);
  XLSX.utils.book_append_sheet(wb, wsDesc, 'Descriptives');

  // -------------------------------------------------------------
  // Sheet 3: Model Summary & ANOVA
  // -------------------------------------------------------------
  const anovaRows = [
    ['Tabel 2: Model Summary'],
    ['Model', 'R', 'R Square', 'Adjusted R Square', 'Std. Error of the Estimate', 'Durbin-Watson'],
    [
      result.modelSummary.model,
      result.modelSummary.r,
      result.modelSummary.rSquared,
      result.modelSummary.adjRSquared,
      result.modelSummary.stdErrorEstimate,
      result.modelSummary.durbinWatson
    ],
    [],
    ['Tabel 3: ANOVA (Analysis of Variance)'],
    ['Model', 'Sum of Squares', 'df', 'Mean Square', 'F', 'Sig.'],
    [
      'Regression',
      result.anova.regression.ss,
      result.anova.regression.df,
      result.anova.regression.ms,
      result.anova.regression.f,
      result.anova.regression.sig
    ],
    [
      'Residual',
      result.anova.residual.ss,
      result.anova.residual.df,
      result.anova.residual.ms,
      '',
      ''
    ],
    [
      'Total',
      result.anova.total.ss,
      result.anova.total.df,
      '',
      '',
      ''
    ]
  ];
  const wsAnova = XLSX.utils.aoa_to_sheet(anovaRows);
  XLSX.utils.book_append_sheet(wb, wsAnova, 'Model Summary & ANOVA');

  // -------------------------------------------------------------
  // Sheet 4: Coefficients & Collinearity
  // -------------------------------------------------------------
  const coefRows = [
    ['Tabel 4: Coefficients (Parameter Estimates & Collinearity Statistics)'],
    [
      'Model',
      'Unstandardized B',
      'Std. Error',
      'Standardized Beta',
      't',
      'Sig.',
      '95% CI Lower',
      '95% CI Upper',
      'Tolerance',
      'VIF'
    ]
  ];
  for (const c of result.coefficients) {
    coefRows.push([
      c.variable,
      c.b as any,
      c.stdError as any,
      c.variable === '(Constant)' ? '' : (c.beta as any),
      c.t as any,
      c.sig as any,
      c.ciLower as any,
      c.ciUpper as any,
      c.variable === '(Constant)' ? '' : (c.collinearity?.tolerance as any),
      c.variable === '(Constant)' ? '' : (c.collinearity?.vif as any)
    ]);
  }
  const wsCoef = XLSX.utils.aoa_to_sheet(coefRows);
  XLSX.utils.book_append_sheet(wb, wsCoef, 'Coefficients');

  // -------------------------------------------------------------
  // Sheet 5: Classical Assumptions & Diagnostics
  // -------------------------------------------------------------
  const assumpRows = [
    ['Tabel 5: Classical Assumption Tests & Diagnostic Results'],
    ['Nama Pengujian', 'Statistik Uji', 'p-value / Sig.', 'df', 'Kriteria Kelulusan', 'Status', 'Keterangan Diagnostik']
  ];
  for (const a of result.assumptions) {
    assumpRows.push([
      a.name,
      a.statistic as any,
      a.pValue !== undefined && a.pValue !== null ? (a.pValue as any) : '-',
      a.df !== undefined && a.df !== null ? (a.df as any) : '-',
      a.criteria,
      a.status.toUpperCase(),
      a.reason
    ]);
  }
  const wsAssump = XLSX.utils.aoa_to_sheet(assumpRows);
  XLSX.utils.book_append_sheet(wb, wsAssump, 'Classical Assumptions');

  // -------------------------------------------------------------
  // Sheet 6: Statistical Recommendations (Tahap 3)
  // -------------------------------------------------------------
  if (recommendationOutput) {
    const recRows = [
      ['Tabel 6: Statistical Recommendation Cards (Rule-Based Engine)'],
      [
        'Kategori',
        'Nama Uji',
        'Status',
        'Statistik',
        'Sig.',
        'Keputusan H0',
        'Rekomendasi Utama',
        'Alternatif Metode Sah',
        'Dampak Terhadap Model'
      ]
    ];
    for (const card of recommendationOutput.cards) {
      recRows.push([
        card.category.toUpperCase(),
        card.testName,
        card.status,
        card.statistic as any,
        card.pValue !== undefined ? (card.pValue as any) : '-',
        card.h0Decision,
        card.primaryRecommendation,
        card.alternativeMethods.map((m) => m.name).join('; '),
        card.modelImpact
      ]);
    }
    const wsRec = XLSX.utils.aoa_to_sheet(recRows);
    XLSX.utils.book_append_sheet(wb, wsRec, 'Recommendations');
  }

  // -------------------------------------------------------------
  // Sheet 7: Model Comparison Matrix (Tahap 3)
  // -------------------------------------------------------------
  if (comparisonReport) {
    const compHeaders = ['Indikator Ekonometrika', ...comparisonReport.models.map((m) => `${m.title} (${m.modelId})`)];
    const compRows = [
      ['Tabel 7: Model Comparison Matrix (AIC, BIC, RMSE, MAE, R²)'],
      compHeaders
    ];
    for (const row of comparisonReport.comparisonMatrix) {
      const line = [row.indicator];
      for (const m of comparisonReport.models) {
        line.push(String(row.values[m.modelId] ?? '-'));
      }
      compRows.push(line);
    }
    const wsComp = XLSX.utils.aoa_to_sheet(compRows);
    XLSX.utils.book_append_sheet(wb, wsComp, 'Model Comparison');
  }

  // -------------------------------------------------------------
  // Sheet 8: Residual Statistics & Casewise Diagnostics
  // -------------------------------------------------------------
  const resRows = [
    ['Tabel 8: Residuals Statistics & Casewise Diagnostics'],
    ['Case Number', 'Y Actual', 'Y Predicted', 'Residual', 'Std. Residual']
  ];
  if (result.casewiseDiagnostics && result.casewiseDiagnostics.length > 0) {
    for (const c of result.casewiseDiagnostics) {
      resRows.push([c.caseNumber as any, c.yValue as any, c.predictedValue as any, c.residual as any, c.stdResidual as any]);
    }
  } else {
    resRows.push(['Tidak ada pencilan ekstrem yang melampaui |Std. Residual| >= 3.0', '', '', '', '']);
  }
  const wsRes = XLSX.utils.aoa_to_sheet(resRows);
  XLSX.utils.book_append_sheet(wb, wsRes, 'Residuals & Outliers');

  // Convert workbook to Buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

