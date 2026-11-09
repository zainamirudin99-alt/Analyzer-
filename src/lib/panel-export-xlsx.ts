// ============================================================
// Multi-Sheet Excel (.xlsx) Export Builder untuk Regresi Data Panel Stata
// Menghasilkan workbook Excel dengan auto-fit lebar kolom (ws['!cols']):
// - Sheet 1: Ringkasan_Struktur_Panel
// - Sheet 2: Perbandingan_CEM_FEM_REM
// - Sheet 3: Uji_Pemilihan_Model
// - Sheet 4: Model_Akhir_Robust
// - Sheet 5: Diagnostik_Asumsi_VIF
// - Sheet 6: Log_13_Langkah_Stata
// ============================================================

import * as XLSX from 'xlsx';
import { PanelFitResult } from './panel-types';
import { sanitizeCellValue } from './file-signature';

export interface PanelXlsxExportOptions {
  fitResult: PanelFitResult;
  datasetName?: string;
}

function roundNum(val: number | undefined | null, digits = 4): number | string {
  if (val === undefined || val === null || isNaN(val) || !isFinite(val)) return '-';
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

function createAutoSizedSheet(rows: any[][], minWch = 12, maxWch = 62): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths: number[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    row.forEach((cell, colIdx) => {
      const str = cell === null || cell === undefined ? '' : String(cell);
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

export function buildPanelXlsxBuffer(options: PanelXlsxExportOptions): Buffer {
  const { fitResult, datasetName = 'Dataset_Panel.xlsx' } = options;
  const { declaration, models, selection, finalModel, assumptions, easyInterpretation, consoleBlocks } = fitResult;
  const wb = XLSX.utils.book_new();

  const activeY = fitResult.activeYCol || 'Y';
  const finalX = fitResult.finalActiveXCols || fitResult.initialActiveXCols || [];

  // ----------------------------------------------------------
  // Sheet 1: Ringkasan_Struktur_Panel
  // ----------------------------------------------------------
  const summaryRows: any[][] = [
    ['LAPORAN EKSEKUTIF ANALISIS EKONOMETRIKA REGRESI DATA PANEL (STANDAR STATA 18)'],
    ['Dicetak Pada (UTC)', new Date().toISOString().replace('T', ' ').slice(0, 19)],
    ['Nama Berkas Dataset', sanitizeCellValue(datasetName)],
    ['Jumlah Entitas Cross-Section (N)', declaration.entityCount],
    ['Jumlah Periode Waktu (T)', declaration.timeCount],
    ['Rentang Periode Waktu', `${declaration.timeSpan.min} s/d ${declaration.timeSpan.max}`],
    ['Total Observasi Panel (N × T)', declaration.totalObs],
    ['Status Keseimbangan Panel', declaration.isBalanced ? 'Strongly Balanced' : 'Unbalanced Panel'],
    ['Variabel Dependen Aktif (Y)', sanitizeCellValue(activeY)],
    ['Variabel Independen Aktif (X)', sanitizeCellValue(finalX.join(', '))],
    ['Model Ekonometrika Terpilih', selection.selectedModel],
    ['Alasan Pemilihan Model', sanitizeCellValue(selection.selectionReason)],
    ['Koreksi Standar Error (VCE)', 'Cluster-Robust Standard Errors (Arellano, 1987) — vce(robust)']
  ];
  XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(summaryRows), 'Ringkasan_Panel');

  // ----------------------------------------------------------
  // Sheet 2: Perbandingan_CEM_FEM_REM
  // ----------------------------------------------------------
  if (models?.cem && models?.fem && models?.rem) {
    const allVars = Array.from(
      new Set([
        ...Object.keys(models.cem.coefficients),
        ...Object.keys(models.fem.coefficients),
        ...Object.keys(models.rem.coefficients)
      ])
    );

    const compRows: any[][] = [
      ['TABEL 2.1: PERBANDINGAN ESTIMASI TIGA MODEL PANEL (CEM vs FEM vs REM)'],
      [
        'Variabel',
        'CEM Coef (b)',
        'CEM Std.Err',
        'CEM p-value',
        'FEM Coef (b)',
        'FEM Std.Err',
        'FEM p-value',
        'REM Coef (b)',
        'REM Std.Err',
        'REM p-value'
      ]
    ];

    allVars.forEach(vName => {
      const cCem = models.cem.coefficients[vName];
      const cFem = models.fem.coefficients[vName];
      const cRem = models.rem.coefficients[vName];
      compRows.push([
        sanitizeCellValue(vName),
        cCem && !cCem.isOmitted ? roundNum(cCem.b, 6) : 'omitted',
        cCem && !cCem.isOmitted ? roundNum(cCem.stdError, 6) : '-',
        cCem && !cCem.isOmitted ? roundNum(cCem.sig, 4) : '-',
        cFem && !cFem.isOmitted ? roundNum(cFem.b, 6) : 'omitted',
        cFem && !cFem.isOmitted ? roundNum(cFem.stdError, 6) : '-',
        cFem && !cFem.isOmitted ? roundNum(cFem.sig, 4) : '-',
        cRem && !cRem.isOmitted ? roundNum(cRem.b, 6) : 'omitted',
        cRem && !cRem.isOmitted ? roundNum(cRem.stdError, 6) : '-',
        cRem && !cRem.isOmitted ? roundNum(cRem.sig, 4) : '-'
      ]);
    });

    compRows.push(
      [],
      ['Statistik Kebaikan Suai', 'CEM (Pooled OLS)', '', '', 'FEM (Within FE)', '', '', 'REM (GLS RE)', '', ''],
      ['R-Squared Within', roundNum(models.cem.r2.within, 4), '', '', roundNum(models.fem.r2.within, 4), '', '', roundNum(models.rem.r2.within, 4), '', ''],
      ['R-Squared Between', roundNum(models.cem.r2.between, 4), '', '', roundNum(models.fem.r2.between, 4), '', '', roundNum(models.rem.r2.between, 4), '', ''],
      ['R-Squared Overall', roundNum(models.cem.r2.overall, 4), '', '', roundNum(models.fem.r2.overall, 4), '', '', roundNum(models.rem.r2.overall, 4), '', ''],
      ['F-Stat / Wald Chi2', roundNum(models.cem.fStat, 4), '', '', roundNum(models.fem.fStat, 4), '', '', roundNum(models.rem.waldChi2, 4), '', ''],
      ['Prob > F / Chi2', roundNum(models.cem.fPValue, 4), '', '', roundNum(models.fem.fPValue, 4), '', '', roundNum(models.rem.waldPValue, 4), '', '']
    );

    XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(compRows), 'Perbandingan_3_Model');
  }

  // ----------------------------------------------------------
  // Sheet 3: Uji_Pemilihan_Model
  // ----------------------------------------------------------
  const selRows: any[][] = [
    ['TABEL 3.1: PENGUJIAN SPESIFIKASI & PEMILIHAN MODEL PANEL'],
    ['Pengujian Spesifikasi', 'Pasangan Model', 'Hipotesis Nol (H0)', 'Statistik Uji', 'Derajat Bebas (df)', 'p-value', 'Model Terpilih'],
    [
      'Uji Chow (F-Test / LSDV)',
      'CEM vs FEM',
      'H0: Common Effect Model valid',
      roundNum(selection.chow.stat, 4),
      `(${selection.chow.df1}, ${selection.chow.df2})`,
      roundNum(selection.chow.p, 4),
      selection.chow.preferred
    ],
    [
      'Uji Spesifikasi Hausman',
      'FEM vs REM',
      'H0: Random Effects Model konsisten',
      roundNum(selection.hausman.chi2, 4),
      selection.hausman.df,
      roundNum(selection.hausman.p, 4),
      selection.hausman.preferred
    ],
    [
      'Uji Breusch-Pagan LM (xttest0)',
      'CEM vs REM',
      'H0: Var(u_i) = 0 (CEM valid)',
      roundNum(selection.breuschPaganLM.chibar2, 4),
      selection.breuschPaganLM.df,
      roundNum(selection.breuschPaganLM.p, 4),
      selection.breuschPaganLM.preferred
    ],
    [],
    ['MODEL OPTIMAL TERPILIH', selection.selectedModel, sanitizeCellValue(selection.selectionReason)]
  ];
  XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(selRows), 'Uji_Pemilihan_Model');

  // ----------------------------------------------------------
  // Sheet 4: Model_Akhir_Robust
  // ----------------------------------------------------------
  const isREM = finalModel.modelType === 'REM';
  const finalRows: any[][] = [
    [`TABEL 4.1: ESTIMASI MODEL AKHIR TERPILIH (${finalModel.modelType} — CLUSTER ROBUST SE)`],
    [
      'Variabel',
      'Koefisien (b)',
      'Robust Std. Error',
      isREM ? 'z-Statistic' : 't-Statistic',
      isREM ? 'P > |z|' : 'P > |t|',
      '95% CI Lower',
      '95% CI Upper',
      'Signifikansi (α=0.05)'
    ]
  ];

  Object.entries(finalModel.coefficients).forEach(([vName, cRow]) => {
    finalRows.push([
      sanitizeCellValue(vName),
      cRow.isOmitted ? 'omitted' : roundNum(cRow.b, 6),
      cRow.isOmitted ? '-' : roundNum(cRow.stdError, 6),
      cRow.isOmitted ? '-' : roundNum(cRow.tOrZ, 4),
      cRow.isOmitted ? '-' : roundNum(cRow.sig, 4),
      cRow.isOmitted ? '-' : roundNum(cRow.ciLower, 6),
      cRow.isOmitted ? '-' : roundNum(cRow.ciUpper, 6),
      cRow.isOmitted ? 'Omitted' : vName === '_cons' ? 'Konstanta' : cRow.sig < 0.05 ? 'Signifikan (p < 0.05)' : 'Tidak Signifikan'
    ]);
  });

  finalRows.push(
    [],
    ['Metrik Model Akhir', 'Nilai Numerik'],
    ['R-Squared Within', roundNum(finalModel.r2.within, 4)],
    ['R-Squared Between', roundNum(finalModel.r2.between, 4)],
    ['R-Squared Overall', roundNum(finalModel.r2.overall, 4)],
    ['sigma_u', roundNum(finalModel.sigma_u, 6)],
    ['sigma_e', roundNum(finalModel.sigma_e, 6)],
    ['rho (Fraction of variance due to u_i)', roundNum(finalModel.rho, 6)],
    [isREM ? 'Wald Chi2' : 'F-Statistic', roundNum(isREM ? finalModel.waldChi2 : finalModel.fStat, 4)],
    ['Prob > F / Chi2', roundNum(isREM ? finalModel.waldPValue : finalModel.fPValue, 4)],
    ['Total Observasi (N)', finalModel.nObs],
    ['Jumlah Grup Entitas (n)', finalModel.nEntities]
  );

  if (easyInterpretation && easyInterpretation.predictorInterpretations.length > 0) {
    finalRows.push(
      [],
      ['TABEL 4.2: INTERPRETASI SUBSTANTIF VARIABEL PREDIKTOR'],
      ['Variabel', 'Koefisien (b)', 'p-value', 'Arah Pengaruh', 'Status Signifikansi', 'Makna & Interpretasi Substantif']
    );
    easyInterpretation.predictorInterpretations.forEach(eff => {
      finalRows.push([
        sanitizeCellValue(eff.variable),
        roundNum(eff.coef, 6),
        roundNum(eff.pValue, 4),
        eff.direction.toUpperCase(),
        eff.isSignificant ? 'Signifikan' : 'Tidak Signifikan',
        sanitizeCellValue(eff.easyMeaning)
      ]);
    });
  }

  XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(finalRows), 'Model_Akhir_Robust');

  // ----------------------------------------------------------
  // Sheet 5: Diagnostik_Asumsi_VIF
  // ----------------------------------------------------------
  const diagRows: any[][] = [
    ['TABEL 5.1: DIAGNOSTIK ASUMSI KLASIK DATA PANEL'],
    ['Pengujian Asumsi', 'Statistik Uji', 'p-value', 'Status Evaluasi', 'Keterangan & Penanganan'],
    [
      `Multikolinearitas (${assumptions.vif.approach === 'centered' ? 'Centered VIF' : 'Uncentered VIF'})`,
      roundNum(assumptions.vif.meanVif, 4),
      '-',
      assumptions.vif.meanVif < 10 ? 'LOLOS' : 'TERDETEKSI',
      assumptions.orthogReport?.triggered
        ? `Ditangani dengan orthog (${assumptions.orthogReport.stataCommand}), Mean VIF pasca-orthog = ${roundNum(assumptions.orthogReport.postOrthogVif.meanVif, 2)}`
        : 'Seluruh VIF < 10'
    ],
    [
      'Heteroskedastisitas Groupwise (Modified Wald — xttest3)',
      roundNum(assumptions.greeneHetero?.chi2, 4),
      roundNum(assumptions.greeneHetero?.p, 4),
      assumptions.greeneHetero?.hasHeteroskedasticity ? 'TERDETEKSI (ROBUST)' : 'HOMOSKEDASTIS',
      assumptions.greeneHetero?.hasHeteroskedasticity ? 'Dikoreksi dengan Cluster-Robust SE vce(robust)' : 'Varians homoskedastis'
    ],
    [
      'Autokorelasi Serial Wooldridge (xtserial)',
      assumptions.wooldridgeSerial?.skippedReason ? 'Dilewati' : roundNum(assumptions.wooldridgeSerial?.f, 4),
      assumptions.wooldridgeSerial?.skippedReason ? '-' : roundNum(assumptions.wooldridgeSerial?.p, 4),
      assumptions.wooldridgeSerial?.hasAutocorrelation ? 'TERDETEKSI (ROBUST)' : 'BEBAS AUTOKORELASI',
      assumptions.wooldridgeSerial?.skippedReason ||
        (assumptions.wooldridgeSerial?.hasAutocorrelation ? 'Dikoreksi dengan Cluster-Robust SE vce(robust)' : 'Bebas autokorelasi serial')
    ],
    [
      `Normalitas Residu (${assumptions.normality?.predictCommand || 'predict e, e'})`,
      roundNum(assumptions.normality?.swilk?.w ?? assumptions.normality?.statistic, 4),
      roundNum(assumptions.normality?.swilk?.probZ ?? assumptions.normality?.p, 4),
      assumptions.normality?.isNormal ? 'NORMAL' : 'NON-NORMAL',
      assumptions.normality?.reason || 'Evaluasi swilk, sktest, dan ksmirnov'
    ],
    [],
    ['TABEL 5.2: RINCIAN VIF & TOLERANCE PER VARIABEL'],
    ['Variabel Prediktor', 'VIF', '1/VIF (Tolerance)', 'Status Kolinearitas']
  ];

  Object.entries(assumptions.vif.variables || {}).forEach(([vName, vStat]) => {
    diagRows.push([
      sanitizeCellValue(vName),
      roundNum(vStat.vif, 4),
      roundNum(vStat.tolerance, 6),
      vStat.vif > 10 ? 'Tinggi (VIF > 10)' : 'Aman (VIF < 10)'
    ]);
  });
  diagRows.push(['Mean VIF', roundNum(assumptions.vif.meanVif, 4), '-', assumptions.vif.meanVif < 10 ? 'Lolos' : 'Waspada']);

  XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(diagRows), 'Diagnostik_Asumsi_VIF');

  // ----------------------------------------------------------
  // Sheet 6: Log_13_Langkah_Stata
  // ----------------------------------------------------------
  const logRows: any[][] = [
    ['RINCIAN 13 LANGKAH ALUR EKONOMETRIKA GAYA STATA'],
    ['Langkah', 'Judul Tahapan', 'Sintaks Perintah Stata (.do)', 'Fungsi Ekonometrika', 'Penjelasan & Interpretasi Ringkas']
  ];
  (consoleBlocks || []).forEach(b => {
    logRows.push([
      `Langkah ${b.stepIndex}`,
      sanitizeCellValue(b.stepTitle),
      sanitizeCellValue(b.stataCommand),
      sanitizeCellValue(b.stataFunction),
      sanitizeCellValue(b.babyLanguage)
    ]);
  });
  XLSX.utils.book_append_sheet(wb, createAutoSizedSheet(logRows), 'Log_13_Langkah_Stata');

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

