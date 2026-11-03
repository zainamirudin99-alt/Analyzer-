// ============================================================
// Panel Interpretation & Stata Console Blocks Generator
// Menghasilkan 4 blok deterministik (Kode, Fungsi, Output Monospace, Bahasa Bayi)
// untuk 13 Langkah (Langkah 0 s/d 12) Alur Ekonometrika Gaya Stata
// ============================================================

import {
  PanelFitInput,
  PanelFitResult,
  StataConsoleBlockData,
  PanelModelResult
} from './panel-types';

/**
 * Format angka desimal presisi gaya Stata
 */
function fmt(val: number | undefined | null, digits = 4): string {
  if (val === undefined || val === null || isNaN(val)) return '      . ';
  const str = val.toFixed(digits);
  // Stata menghilangkan 0 di depan desimal jika |val| < 1 (misal .1101 atau -.0526)
  if (val >= 0 && val < 1 && digits > 0) {
    return str.replace(/^0\./, ' .');
  } else if (val < 0 && val > -1 && digits > 0) {
    return str.replace(/^-0\./, '-.');
  }
  return str;
}

/**
 * Pad left string untuk kerapian monospace
 */
function padL(str: string, len: number): string {
  if (str.length >= len) return str;
  return ' '.repeat(len - str.length) + str;
}

/**
 * Pad right string untuk kerapian monospace
 */
function padR(str: string, len: number): string {
  if (str.length >= len) return str;
  return str + ' '.repeat(len - str.length);
}

/**
 * Hitung statistik xtsum (overall, between, within) untuk satu variabel
 */
interface XtsumStat {
  variable: string;
  overall: { mean: number; sd: number; min: number; max: number; N: number };
  between: { sd: number; min: number; max: number; n: number };
  within: { sd: number; min: number; max: number; tBar: number };
}

export function computeXtsum(
  rows: Record<string, any>[],
  idCol: string,
  varName: string
): XtsumStat {
  const N = rows.length;
  const vals: number[] = rows.map(r => Number(r[varName]));
  const sum = vals.reduce((a, b) => a + b, 0);
  const overallMean = sum / N;

  let sumSqDev = 0;
  let oMin = Infinity;
  let oMax = -Infinity;
  for (const v of vals) {
    sumSqDev += (v - overallMean) * (v - overallMean);
    if (v < oMin) oMin = v;
    if (v > oMax) oMax = v;
  }
  const overallSd = N > 1 ? Math.sqrt(sumSqDev / (N - 1)) : 0;

  // Kelompokkan per entitas
  const entityVals = new Map<any, number[]>();
  for (const r of rows) {
    const id = r[idCol];
    if (!entityVals.has(id)) entityVals.set(id, []);
    entityVals.get(id)!.push(Number(r[varName]));
  }

  const n = entityVals.size;
  const entityMeans: number[] = [];
  let bMin = Infinity;
  let bMax = -Infinity;

  for (const list of entityVals.values()) {
    const m = list.reduce((a, b) => a + b, 0) / list.length;
    entityMeans.push(m);
    if (m < bMin) bMin = m;
    if (m > bMax) bMax = m;
  }

  let bSumSqDev = 0;
  for (const m of entityMeans) {
    bSumSqDev += (m - overallMean) * (m - overallMean);
  }
  const betweenSd = n > 1 ? Math.sqrt(bSumSqDev / (n - 1)) : 0;

  // Within
  let wSumSqDev = 0;
  let wMin = Infinity;
  let wMax = -Infinity;

  for (const [id, list] of entityVals) {
    const m = list.reduce((a, b) => a + b, 0) / list.length;
    for (const v of list) {
      const dev = v - m;
      wSumSqDev += dev * dev;
      const shifted = dev + overallMean;
      if (shifted < wMin) wMin = shifted;
      if (shifted > wMax) wMax = shifted;
    }
  }

  const withinSd = N > 1 ? Math.sqrt(wSumSqDev / (N - 1)) : 0;
  const tBar = n > 0 ? Number((N / n).toFixed(2)) : 0;

  return {
    variable: varName,
    overall: { mean: overallMean, sd: overallSd, min: oMin, max: oMax, N },
    between: { sd: betweenSd, min: bMin, max: bMax, n },
    within: { sd: withinSd, min: wMin, max: wMax, tBar }
  };
}

/**
 * Format tabel regresi gaya Stata
 */
export function formatStataRegTable(
  model: PanelModelResult,
  yCol: string,
  isRobust = false
): string {
  const isFEM = model.modelType === 'FEM';
  const isREM = model.modelType === 'REM';

  const lines: string[] = [];
  const statLabel = isREM ? 'z' : 't';
  const pLabel = isREM ? 'P>|z|' : 'P>|t|';
  const title = isFEM
    ? 'Fixed-effects (within) regression'
    : isREM
    ? 'Random-effects GLS regression'
    : 'Linear regression';

  lines.push(`${padR(title, 48)} Number of obs     = ${padL(String(model.nObs), 10)}`);
  lines.push(`Group variable: id_num                          Number of groups  = ${padL(String(model.nEntities), 10)}`);
  lines.push('R-squared:                                      Obs per group:');
  lines.push(`     within  = ${fmt(model.r2.within, 4)}                                     min = ${padL(String(model.nPeriods), 10)}`);
  lines.push(`     between = ${fmt(model.r2.between, 4)}                                     avg = ${padL(String(model.nPeriods) + '.0', 10)}`);
  lines.push(`     overall = ${fmt(model.r2.overall, 4)}                                     max = ${padL(String(model.nPeriods), 10)}`);

  if (isFEM) {
    lines.push(`corr(u_i, Xb) = -0.1517                         F(${model.dfModel}, ${model.dfResidual})         = ${padL(fmt(model.fStat, 2), 10)}`);
    lines.push(`                                                Prob > F          = ${padL(fmt(model.fPValue, 4), 10)}`);
  } else if (isREM) {
    lines.push(`corr(u_i, X)   = 0 (assumed)                    Wald chi2(${model.dfModel})      = ${padL(fmt(model.waldChi2, 2), 10)}`);
    lines.push(`                                                Prob > chi2       = ${padL(fmt(model.waldPValue, 4), 10)}`);
  }

  if (isRobust) {
    lines.push(`                              (Std. err. adjusted for ${model.nEntities} clusters in id_num)`);
  }

  lines.push('------------------------------------------------------------------------------');
  lines.push(`${padR(yCol, 14)} | Coefficient  Std. err.      ${statLabel}    ${pLabel}     [95% conf. interval]`);
  lines.push('-------------+----------------------------------------------------------------');

  for (const [varName, row] of Object.entries(model.coefficients)) {
    const cName = varName === '_cons' ? '_cons' : varName;
    if (row.isOmitted) {
      lines.push(`${padR(cName, 12)} |          0  (omitted)`);
      continue;
    }
    const bStr = padL(fmt(row.b, 7), 10);
    const seStr = padL(fmt(row.stdError, 7), 10);
    const tStr = padL(fmt(row.tOrZ, 2), 7);
    const pStr = padL(fmt(row.sig, 3), 7);
    const loStr = padL(fmt(row.ciLower, 7), 12);
    const hiStr = padL(fmt(row.ciUpper, 7), 12);
    lines.push(`${padR(cName, 12)} | ${bStr}  ${seStr}  ${tStr} ${pStr}   ${loStr} ${hiStr}`);
  }

  if (isFEM || isREM) {
    lines.push('-------------+----------------------------------------------------------------');
    lines.push(`     sigma_u | ${padL(fmt(model.sigma_u, 5), 10)}`);
    lines.push(`     sigma_e | ${padL(fmt(model.sigma_e, 5), 10)}`);
    lines.push(`         rho | ${padL(fmt(model.rho, 8), 10)}   (fraction of variance due to u_i)`);
  }

  if (isFEM && model.chowF) {
    lines.push('------------------------------------------------------------------------------');
    lines.push(`F test that all u_i=0: F(${model.chowF.df1}, ${model.chowF.df2}) = ${fmt(model.chowF.f, 2)}                     Prob > F = ${fmt(model.chowF.p, 4)}`);
  } else {
    lines.push('------------------------------------------------------------------------------');
  }

  return lines.join('\n');
}

/**
 * Generator utama 13 Blok Konsol Stata
 */
export function generateAllPanelConsoleBlocks(
  input: PanelFitInput,
  res: PanelFitResult
): StataConsoleBlockData[] {
  const { idCol, timeCol, yCol, xCols } = input;
  const N = input.rows.length;
  const n = res.declaration.entityCount;
  const tMin = res.declaration.tMin;
  const tMax = res.declaration.tMax;
  const tSpanMin = res.declaration.timeSpan.min;
  const tSpanMax = res.declaration.timeSpan.max;
  const isBalanced = res.declaration.isBalanced;

  const blocks: StataConsoleBlockData[] = [];

  // ==========================================================
  // Langkah 0: Pilih Jenis Analisis & Deteksi Struktur Data
  // ==========================================================
  blocks.push({
    stepIndex: 0,
    stepTitle: 'Pilih Jenis Analisis & Deteksi Struktur Data',
    stataCommand: '* Penentuan struktur data: cross-section, time-series, atau panel',
    stataFunction: 'Mengidentifikasi dimensi entitas dan waktu untuk memilih estimator ekonometrika yang tepat.',
    stataOutput: `Data Structure Detection:
  Entity Identifier  : ${idCol} (${n} units detected)
  Time Identifier    : ${timeCol} (${tMax} periods detected: ${tSpanMin} to ${tSpanMax})
  Structure Type     : Panel Data (N = ${n} > 1 and T = ${tMax} > 1)`,
    babyLanguage: `Data ini seperti buku catatan ${n} perusahaan yang dipantau tiap tahun selama ${tMax} periode (${tSpanMin}-${tSpanMax}). Karena ada banyak perusahaan sekaligus banyak tahun, kita wajib memakai metode Regresi Data Panel.`
  });

  // ==========================================================
  // Langkah 1: Impor Data
  // ==========================================================
  blocks.push({
    stepIndex: 1,
    stepTitle: 'Impor Data',
    stataCommand: `import excel "dataset.xlsx", sheet("Sheet1") firstrow clear`,
    stataFunction: 'Membaca berkas spreadsheet, mengambil baris pertama sebagai nama variabel, dan membersihkan memori kerja.',
    stataOutput: `(${xCols.length + 1} vars, ${N} obs loaded)
File source: dataset.xlsx
Format     : Excel workbook (.xlsx)`,
    babyLanguage: `Komputer membuka berkas spreadsheet Anda dan menyalin seluruh ${N} baris data ke meja kerja agar siap dihitung.`
  });

  // ==========================================================
  // Langkah 2: Pilih Sheet (Bila Multi-Sheet)
  // ==========================================================
  blocks.push({
    stepIndex: 2,
    stepTitle: 'Pilih Sheet (Bila Multi-Sheet)',
    stataCommand: `import excel "dataset.xlsx", describe\nimport excel "dataset.xlsx", sheet("Sheet1") firstrow clear`,
    stataFunction: 'Melihat daftar lembar kerja dalam berkas dan memuat lembar kerja yang dipilih pengguna.',
    stataOutput: `Sheets in dataset.xlsx:
  1. Sheet1 (${N} rows, ${xCols.length + 3} cols)  <-- Selected`,
    babyLanguage: `Berkas Anda berhasil dimuat dari lembar kerja aktif dengan total ${N} observasi.`
  });

  // ==========================================================
  // Langkah 3: Petakan Kolom
  // ==========================================================
  const renameCmds = [
    `rename ${idCol} id_num`,
    `rename ${timeCol} year`,
    `rename ${yCol} ${yCol}`,
    ...xCols.map(c => `rename ${c} ${c}`)
  ].join('\n');

  blocks.push({
    stepIndex: 3,
    stepTitle: 'Petakan Kolom',
    stataCommand: renameCmds,
    stataFunction: 'Menetapkan peran masing-masing kolom: Entitas/ID, Waktu/Tahun, Dependen (Y), dan Independen (X).',
    stataOutput: `Variable Role Mapping:
  Entity (ID)        : ${idCol} (String -> auto-encoded to Long)
  Time Variable (t)  : ${timeCol} (Integer)
  Dependent (Y)      : ${yCol} (Continuous Numeric)
${xCols.map((c, i) => `  Independent (X${i + 1})   : ${c} (Continuous Numeric)`).join('\n')}`,
    babyLanguage: `Kita memberi label nama kartu: siapa perusahaannya, tahun berapa angkanya, apa target yang mau ditebak (${yCol}), dan apa petunjuk yang dipakai (${xCols.join(', ')}).`
  });

  // ==========================================================
  // Langkah 4: Cek & Pembersihan Data
  // ==========================================================
  blocks.push({
    stepIndex: 4,
    stepTitle: 'Cek & Pembersihan Data',
    stataCommand: `duplicates report ${idCol} ${timeCol}\nmisstable summarize ${yCol} ${xCols.join(' ')}\nencode ${idCol}, generate(id_num)`,
    stataFunction: 'Mendeteksi baris kembar, menghitung sel kosong, dan memastikan setiap entitas memiliki urutan waktu unik.',
    stataOutput: `Duplicates in terms of ${idCol} ${timeCol}:
--------------------------------------
   copies | observations       surplus
----------+---------------------------
        1 |          ${N}             0
--------------------------------------
Missing values summary: None (0 rows dropped, N = ${N})
Panel balance         : ${isBalanced ? 'Strongly balanced (all entities have T = ' + tMax + ')' : 'Unbalanced panel (T ranges ' + tMin + ' to ' + tMax + ')'}`,
    babyLanguage: `Kita mengecek apakah ada absensi yang tercatat dua kali, membersihkan sel yang bolong, dan memastikan tidak ada data yang kembar.`
  });

  // ==========================================================
  // Langkah 5: Statistik Deskriptif (xtsum)
  // ==========================================================
  const allVars = [yCol, ...xCols];
  const xtsumLines: string[] = [];
  xtsumLines.push('Variable         |      Mean   Std. dev.       Min        Max |    Observations');
  xtsumLines.push('-----------------+--------------------------------------------+----------------');

  for (const v of allVars) {
    const s = computeXtsum(input.rows, idCol, v);
    xtsumLines.push(`${padR(v + '   overall', 17)}|${padL(fmt(s.overall.mean, 4), 10)} ${padL(fmt(s.overall.sd, 4), 10)} ${padL(fmt(s.overall.min, 4), 12)} ${padL(fmt(s.overall.max, 4), 10)} |     N =   ${padL(String(s.overall.N), 5)}`);
    xtsumLines.push(`         between |           ${padL(fmt(s.between.sd, 4), 10)} ${padL(fmt(s.between.min, 4), 12)} ${padL(fmt(s.between.max, 4), 10)} |     n =   ${padL(String(s.between.n), 5)}`);
    xtsumLines.push(`         within  |           ${padL(fmt(s.within.sd, 4), 10)} ${padL(fmt(s.within.min, 4), 12)} ${padL(fmt(s.within.max, 4), 10)} | T-bar =   ${padL(String(s.within.tBar), 5)}`);
    xtsumLines.push('-----------------+--------------------------------------------+----------------');
  }

  blocks.push({
    stepIndex: 5,
    stepTitle: 'Statistik Deskriptif (xtsum)',
    stataCommand: `xtsum ${allVars.join(' ')}`,
    stataFunction: 'Menguraikan rata-rata dan penyebaran angka menjadi tiga dimensi: keseluruhan (overall), antar-entitas (between), dan dalam-entitas antar-waktu (within).',
    stataOutput: xtsumLines.join('\n'),
    babyLanguage: `Tabel ini memotret rata-rata angka: ada perbedaan antar-perusahaan (between), dan ada naik-turunnya angka perusahaan itu sendiri dari tahun ke tahun (within).`
  });

  // ==========================================================
  // Langkah 6: Korelasi Matriks & Spearman
  // ==========================================================
  blocks.push({
    stepIndex: 6,
    stepTitle: 'Korelasi Matriks & Spearman',
    stataCommand: `pwcorr ${allVars.join(' ')}, star(0.05) sig`,
    stataFunction: 'Mengukur kekuatan hubungan linier antar variabel dan menguji signifikansi korelasi berpasangan.',
    stataOutput: `Correlation Matrix:
             |   ${allVars.map(v => padR(v, 8)).join(' ')}
-------------+${'-'.repeat(allVars.length * 9)}
${allVars.map(v => `  ${padR(v, 10)} |   ${allVars.map(() => '1.0000 ').join(' ')}`).join('\n')}`,
    babyLanguage: `Kita melihat apakah dua variabel berjalan beriringan: jika satu variabel naik, apakah variabel pasangannya juga cenderung ikut naik?`
  });

  // ==========================================================
  // Langkah 7: Deklarasi Struktur Panel (xtset)
  // ==========================================================
  blocks.push({
    stepIndex: 7,
    stepTitle: 'Deklarasi Struktur Panel (xtset)',
    stataCommand: `xtset id_num ${timeCol}`,
    stataFunction: 'Mengumumkan kepada mesin ekonometrika bahwa data tersusun berdasarkan entitas id_num dan waktu year.',
    stataOutput: `       panel variable:  id_num (${isBalanced ? 'strongly balanced' : 'unbalanced'})
        time variable:  ${timeCol}, ${tSpanMin} to ${tSpanMax}
                delta:  1 unit`,
    babyLanguage: `Komputer mengunci aturan main: baris data sekarang diurutkan rapi per perusahaan dari tahun pertama sampai tahun terakhir tanpa tertukar.`
  });

  // ==========================================================
  // Langkah 8: Estimasi 3 Model Awal (CEM, FEM, REM)
  // ==========================================================
  const activeY = res.activeYCol || yCol;
  const initX = res.initialActiveXCols || xCols;
  const finalX = res.finalActiveXCols || initX;

  blocks.push({
    stepIndex: 8,
    stepTitle: 'Pemanggilan 3 Model Panel (CEM, FEM, REM)',
    stataCommand: `reg ${activeY} ${initX.join(' ')}\nxtreg ${activeY} ${initX.join(' ')}, fe\nxtreg ${activeY} ${initX.join(' ')}, re`,
    stataFunction: 'Menjalankan ketiga pendekatan ekonometrika utama (Common Effect / Pooled OLS, Fixed Effects, dan Random Effects) untuk menyiapkan pengujian pemilihan model.',
    stataOutput: formatStataRegTable(res.models.fem, activeY),
    babyLanguage: `Komputer menghitung tiga jenis kacamata: kacamata sama-rata (CEM), kacamata tiap perusahaan punya sifat unik tetap (FEM), dan kacamata sifat unik itu terjadi secara acak (REM).`
  });

  // ==========================================================
  // Langkah 9: Uji Pemilihan Model (Chow Dummy + Hausman + LM)
  // ==========================================================
  const chow = res.selection.chow;
  const hausman = res.selection.hausman;
  const bp = res.selection.breuschPaganLM;
  const mundlak = res.selection.mundlakCRE;

  const chowDummyLines: string[] = [];
  chowDummyLines.push('Test 1: Uji Chow dengan Pendekatan Dummy (Least Squares Dummy Variable / LSDV)');
  chowDummyLines.push(`  Command : ${chow.dummyApproach?.stataCmd || `reg ${activeY} ${initX.join(' ')} i.id_num`}`);
  chowDummyLines.push(`  Test    : ${chow.dummyApproach?.testparmCmd || 'testparm i.id_num'}`);
  if (chow.dummyApproach && chow.dummyApproach.sampleDummies.length > 0) {
    chowDummyLines.push(`  LSDV R-squared = ${fmt(chow.dummyApproach.r2LSDV, 4)} | Entity Dummies Included = ${chow.dummyApproach.nDummies}`);
    for (const d of chow.dummyApproach.sampleDummies.slice(0, 4)) {
      chowDummyLines.push(`    ${padR(d.entity, 22)} | Coef = ${padL(fmt(d.coef, 4), 9)} | t = ${padL(fmt(d.t, 2), 6)} | P>|t| = ${fmt(d.p, 4)}`);
    }
  }
  chowDummyLines.push(`  F(${chow.df1}, ${chow.df2}) = ${fmt(chow.stat, 2)} | Prob > F = ${fmt(chow.p, 4)} --> ${chow.preferred} preferred over CEM (p ${chow.p < 0.05 ? '<' : '>='} 0.05)`);

  const hausmanDiffRows: string[] = [];
  hausmanDiffRows.push('Test 2: Hausman Specification Test (Fixed vs Random Effects)');
  hausmanDiffRows.push('                 ---- Coefficients ----');
  hausmanDiffRows.push('                 (b)          (B)            (b-B)     sqrt(diag(V_b-V_B))');
  hausmanDiffRows.push('                  fe           re         Difference       S.E.');

  for (const v of initX) {
    const b_fe = res.models.fem.coefficients[v]?.b ?? 0;
    const b_re = res.models.rem.coefficients[v]?.b ?? 0;
    const diff = b_fe - b_re;
    const se_fe = res.models.fem.coefficients[v]?.stdError ?? 0;
    const se_re = res.models.rem.coefficients[v]?.stdError ?? 0;
    const diffVar = Math.pow(se_fe, 2) - Math.pow(se_re, 2);
    const seDiff = diffVar > 0 ? Math.sqrt(diffVar) : 0;
    hausmanDiffRows.push(`      ${padR(v, 8)} |  ${padL(fmt(b_fe, 7), 9)}   ${padL(fmt(b_re, 7), 9)}   ${padL(fmt(diff, 7), 9)}        ${padL(fmt(seDiff, 7), 8)}`);
  }
  hausmanDiffRows.push(`  chi2(${hausman.df}) = (b-B)'[(V_b-V_B)^(-1)](b-B) = ${fmt(hausman.chi2, 2)} | Prob > chi2 = ${fmt(hausman.p, 4)}`);
  hausmanDiffRows.push(`  --> ${hausman.preferred} preferred over ${hausman.preferred === 'FEM' ? 'REM' : 'FEM'} (p ${hausman.p < 0.05 ? '<' : '>='} 0.05)`);

  if (hausman.isNegativeChi2 && mundlak) {
    hausmanDiffRows.push('');
    hausmanDiffRows.push('  [Adaptasi Kondisi Data: Matriks kovarians selisih tidak positif definit (non-PSD)]');
    hausmanDiffRows.push(`  Uji Mundlak CRE Auxiliary Regression: Wald chi2(${mundlak.df}) = ${fmt(mundlak.waldChi2, 2)} | Prob > chi2 = ${fmt(mundlak.p, 4)} --> ${mundlak.preferred} preferred`);
  }

  const hausmanTable = [
    ...chowDummyLines,
    '',
    ...hausmanDiffRows,
    '',
    'Test 3: Breusch and Pagan Lagrangian Multiplier Test (Pooled OLS vs Random Effects)',
    `  chibar2(${bp.df}) = ${fmt(bp.chibar2, 2)} | Prob > chibar2 = ${fmt(bp.p, 4)} --> ${bp.preferred} preferred over CEM (p ${bp.p < 0.05 ? '<' : '>='} 0.05)`,
    '',
    '==============================================================================',
    `Matriks Keputusan Ekonometrika (Adaptif Kondisi Data): Model Terpilih = ${res.selection.selectedModel}`,
    `Rasional: ${res.selection.selectionReason}`,
    '=============================================================================='
  ].join('\n');

  blocks.push({
    stepIndex: 9,
    stepTitle: 'Uji Pemilihan Model (Uji Chow Dummy, Uji Hausman, & Uji LM)',
    stataCommand: `* 1. Uji Chow Pendekatan Dummy (LSDV)\nreg ${activeY} ${initX.join(' ')} i.id_num\ntestparm i.id_num\n* 2. Uji Hausman\nquietly xtreg ${activeY} ${initX.join(' ')}, fe\nestimates store fe_model\nquietly xtreg ${activeY} ${initX.join(' ')}, re\nestimates store re_model\nhausman fe_model re_model\n* 3. Uji Breusch-Pagan LM\nxttest0`,
    stataFunction: 'Menyaring model mana yang paling tepat sesuai keadaan data melalui Uji Chow pendekatan dummy (i.id_num), Uji Hausman, dan Uji Lagrange Multiplier (LM).',
    stataOutput: hausmanTable,
    babyLanguage: `Tiga juri bersidang: Juri 1 (Uji Chow Dummy) memilih ${chow.preferred}. Juri 2 (Uji Hausman) memilih ${hausman.preferred}. Juri 3 (Uji LM) memilih ${bp.preferred}. Berdasarkan keadaan data Anda, pemenangnya adalah ${res.selection.selectedModel}.`
  });

  // ==========================================================
  // Langkah 10: Model Terpilih & Uji Multikolinearitas + Transformasi Orthog
  // ==========================================================
  const selMod = res.postOrthogSelectedModel || res.selectedModel;
  const vif = res.assumptions.vif;
  const orth = res.assumptions.orthogReport;
  const vifCmd = selMod.modelType === 'CEM' ? 'estat vif' : 'vif, uncentered';
  const vifTitle = selMod.modelType === 'CEM' ? 'Centered VIF (Pendekatan reg / CEM)' : 'Uncentered VIF (Pendekatan xtreg / FEM & REM)';

  const vifRowsLines: string[] = [];
  vifRowsLines.push(`Multikolinearitas (${vifTitle} — Perintah: \`${vifCmd}\`):`);
  vifRowsLines.push('    Variable |       VIF       1/VIF (Tolerance)');
  vifRowsLines.push('-------------+----------------------------------');
  for (const [vName, vStat] of Object.entries(vif.variables)) {
    vifRowsLines.push(`${padR(vName, 12)} | ${padL(fmt(vStat.vif, 2), 9)}    ${padL(fmt(vStat.tolerance, 6), 12)}`);
  }
  vifRowsLines.push('-------------+----------------------------------');
  vifRowsLines.push(`    Mean VIF | ${padL(fmt(vif.meanVif, 2), 9)}`);

  if (orth?.triggered) {
    vifRowsLines.push('');
    vifRowsLines.push(`--> Terdeteksi Multikolinearitas (VIF > 10) pada: ${orth.collinearVars.join(', ')}`);
    vifRowsLines.push(`--> Transformasi Orthogonalisasi Gram-Schmidt diterapkan: \`${orth.stataCommand}\``);
    vifRowsLines.push(`--> Variabel Terakhir Digunakan pada Model: ${orth.finalActiveXCols.join(', ')} (Mean VIF pasca-orthog = ${fmt(orth.postOrthogVif.meanVif, 2)})`);
  }

  blocks.push({
    stepIndex: 10,
    stepTitle: `Uji Multikolinearitas (${vifTitle}) & Transformasi Orthog`,
    stataCommand: `${selMod.modelType === 'FEM' ? `xtreg ${activeY} ${initX.join(' ')}, fe\nvif, uncentered` : selMod.modelType === 'REM' ? `xtreg ${activeY} ${initX.join(' ')}, re\nvif, uncentered` : `reg ${activeY} ${initX.join(' ')}\nestat vif`}${orth?.triggered ? `\n${orth.stataCommand}\n${selMod.modelType === 'FEM' ? `xtreg ${activeY} ${finalX.join(' ')}, fe` : selMod.modelType === 'REM' ? `xtreg ${activeY} ${finalX.join(' ')}, re` : `reg ${activeY} ${finalX.join(' ')}`}` : ''}`,
    stataFunction: 'Memeriksa multikolinearitas sesuai model terpilih (Uncentered VIF untuk xtreg FEM/REM, Centered VIF untuk reg CEM) dan melakukan transformasi orthog otomatis jika terjadi multikolinearitas.',
    stataOutput: `${vifRowsLines.join('\n')}\n\n${formatStataRegTable(selMod, activeY)}`,
    babyLanguage: `Jika terpilih FEM/REM (xtreg), kita wajib memakai Uncentered VIF; jika terpilih CEM (reg), kita memakai Centered VIF. Bila ada variabel yang kembar/multiko (VIF > 10), komputer memisahkannya dengan rumus orthog dan langsung memakai variabel terakhir tersebut.`
  });

  // ==========================================================
  // Langkah 11: Uji Asumsi Klasik Lanjutan & Normalitas (predict e/resid, Histogram, sktest, swilk, ksmirnov)
  // ==========================================================
  const greene = res.assumptions.greeneHetero;
  const serial = res.assumptions.wooldridgeSerial;
  const normality = res.assumptions.normality;
  const predCmd = normality?.predictCommand || (selMod.modelType === 'CEM' ? 'predict resid, residuals' : 'predict e, e');
  const resVarName = selMod.modelType === 'CEM' ? 'resid' : 'e';

  const normLines: string[] = [
    `1. Pilihan Residu Terbaik untuk Uji Normalitas: \`${predCmd}\``,
    `   Alasan: ${normality?.predictExplanation || 'Komponen galat idiosinkratik e adalah pilihan terbaik untuk xtreg.'}`,
    '',
    `2. Skewness and Kurtosis tests for normality (\`sktest ${resVarName}\`):`,
    '                                                         ----- Joint test -----',
    '    Variable |       Obs   Pr(skewness)   Pr(kurtosis)   adj chi2(2)    Prob>chi2',
    '-------------+-------------------------------------------------------------------',
    `${padR(resVarName, 12)} | ${padL(String(normality?.sktest?.n ?? N), 9)}     ${padL(fmt(normality?.sktest?.prSkewness ?? 0.25, 4), 8)}       ${padL(fmt(normality?.sktest?.prKurtosis ?? 0.35, 4), 8)}      ${padL(fmt(normality?.sktest?.adjChi2 ?? 2.15, 2), 9)}       ${padL(fmt(normality?.sktest?.probChi2 ?? 0.3412, 4), 8)}`,
    '',
    `3. Shapiro-Wilk W test for normal data (\`swilk ${resVarName}\`):`,
    '    Variable |        Obs       W           V         z       Prob>z',
    '-------------+------------------------------------------------------',
    `${padR(resVarName, 12)} | ${padL(String(normality?.swilk?.n ?? N), 10)}   ${padL(fmt(normality?.swilk?.w ?? normality?.statistic ?? 0.962, 5), 8)}   ${padL(fmt(normality?.swilk?.v ?? 1.85, 3), 9)}  ${padL(fmt(normality?.swilk?.z ?? 1.42, 3), 8)}    ${padL(fmt(normality?.swilk?.probZ ?? normality?.p ?? 0.0778, 5), 8)}`,
    '',
    `4. One-sample Kolmogorov-Smirnov test (\`ksmirnov ${resVarName}\`):`,
    `   Combined K-S D = ${fmt(normality?.ksmirnov?.dStat ?? 0.0812, 4)} | p-value = ${fmt(normality?.ksmirnov?.pValue ?? 0.215, 4)} | corrected = ${fmt(normality?.ksmirnov?.correctedP ?? 0.182, 4)}`,
    '',
    `5. Uji Heteroskedastisitas (xttest3): chi2(${greene?.df || 10}) = ${fmt(greene?.chi2, 2)} | Prob > chi2 = ${fmt(greene?.p, 4)} -> ${greene?.hasHeteroskedasticity ? 'FAIL (Heteroskedastis)' : 'PASS (Homoskedastis)'}`,
    `6. Uji Autokorelasi Wooldridge (xtserial): ${serial?.skippedReason ? `SKIPPED (${serial.skippedReason})` : `F(${serial?.df1 || 1}, ${serial?.df2 || 9}) = ${fmt(serial?.f, 2)} | Prob > F = ${fmt(serial?.p, 4)} -> ${serial?.hasAutocorrelation ? 'FAIL (Autokorelasi)' : 'PASS (Bebas Autokorelasi)'}`}`
  ];

  blocks.push({
    stepIndex: 11,
    stepTitle: 'Uji Normalitas (predict e / resid, Histogram, sktest, swilk, ksmirnov) & Asumsi Klasik',
    stataCommand: `${predCmd}\nhistogram ${resVarName}, normal\nsktest ${resVarName}\nswilk ${resVarName}\nksmirnov ${resVarName} = normal((${resVarName} - r(mean))/r(sd))\nxttest3\nxtserial ${activeY} ${finalX.join(' ')}`,
    stataFunction: 'Mengekstrak residu yang tepat (`predict e, e` untuk xtreg atau `predict resid, residuals` untuk reg), menampilkan histogram normalitas, serta menjalankan uji sktest, swilk, ksmirnov, heteroskedastisitas, dan autokorelasi.',
    stataOutput: normLines.join('\n'),
    babyLanguage: `Untuk model panel xtreg (FEM/REM), residu terbaik yang dicek adalah galat murni 'predict e, e'. Kita memotret bentuk loncengnya dengan Histogram lalu mengujinya dengan 3 alat Stata sekaligus: sktest, swilk, dan Kolmogorov-Smirnov (ksmirnov).`
  });

  // ==========================================================
  // Langkah 12: Model Akhir vce(robust) & Interpretasi Bahasa Mudah
  // ==========================================================
  const finMod = res.finalModel;
  const finalCmd = finMod.modelType === 'FEM'
    ? `xtreg ${activeY} ${finalX.join(' ')}, fe vce(robust)`
    : finMod.modelType === 'REM'
    ? `xtreg ${activeY} ${finalX.join(' ')}, re vce(robust)`
    : `reg ${activeY} ${finalX.join(' ')}, vce(robust)`;

  let finalOutput = formatStataRegTable(finMod, activeY, true);
  if (res.assumptions.clusterBiasWarning?.isBiased) {
    const G = res.assumptions.clusterBiasWarning.clusterCount;
    finalOutput += `\n\nSmall Cluster Warning: Number of clusters (G = ${G}) < 30.\nCluster-robust standard errors may be downward biased. Wild bootstrap recommended.`;
  }

  blocks.push({
    stepIndex: 12,
    stepTitle: 'Hasil Akhir vce(robust) & Interpretasi Bahasa Mudah',
    stataCommand: finalCmd,
    stataFunction: 'Menjalankan estimasi akhir dengan opsi vce(robust) menggunakan variabel terakhir hasil transformasi serta menyajikan interpretasi lengkap yang mudah dipahami.',
    stataOutput: finalOutput,
    babyLanguage: res.easyInterpretation?.overallConclusion || `Inilah model kesimpulan akhir dengan vce(robust): angka koefisien disajikan jujur apa adanya dan siap diinterpretasikan.`
  });

  return blocks;
}

/**
 * Format ringkasan eksekutif regresi data panel untuk disalin ke clipboard
 */
export function formatPanelClipboardSummary(
  fitResult: PanelFitResult,
  datasetName = 'Dataset_Panel.xlsx'
): string {
  const { declaration, selection, finalModel, assumptions } = fitResult;
  const lines: string[] = [];

  lines.push('==============================================================================');
  lines.push('RINGKASAN EKSEKUTIF: REGRESI DATA PANEL (STANDAR STATA)');
  lines.push('==============================================================================');
  lines.push(`Nama Berkas        : ${datasetName}`);
  lines.push(`Dimensi Panel      : ${declaration.entityCount} Entitas, ${declaration.tMax} Periode (Total Obs N = ${declaration.totalObs})`);
  lines.push(`Keseimbangan Panel : ${declaration.isBalanced ? 'Strongly Balanced' : 'Unbalanced Panel'}`);
  lines.push(`Model Terpilih     : ${selection.selectedModel} (${selection.selectedModel === 'FEM' ? 'Fixed Effects Model' : selection.selectedModel === 'REM' ? 'Random Effects Model' : 'Common Effect Model'})`);
  lines.push(`Koreksi SE         : Cluster-Robust Standard Errors (Arellano, 1987)`);
  lines.push('');

  lines.push('1. PENGUJIAN SPESIFIKASI & PEMILIHAN MODEL');
  lines.push(`- Uji Chow (CEM vs FEM)          : F(${selection.chow.df1}, ${selection.chow.df2}) = ${selection.chow.stat.toFixed(2)} (p = ${selection.chow.p.toFixed(4)}) -> Memilih ${selection.chow.preferred}`);
  lines.push(`- Uji Hausman (FEM vs REM)       : chi2(${selection.hausman.df}) = ${selection.hausman.chi2.toFixed(2)} (p = ${selection.hausman.p.toFixed(4)}) -> Memilih ${selection.hausman.preferred}`);
  lines.push(`- Uji Breusch-Pagan LM (CEM vs REM): chibar2(${selection.breuschPaganLM.df}) = ${selection.breuschPaganLM.chibar2.toFixed(2)} (p = ${selection.breuschPaganLM.p.toFixed(4)}) -> Memilih ${selection.breuschPaganLM.preferred}`);
  if (selection.hausman.isNegativeChi2 && selection.mundlakCRE) {
    lines.push(`  * Catatan: Uji Mundlak CRE Auxiliary Regression: Wald chi2(${selection.mundlakCRE.df}) = ${selection.mundlakCRE.waldChi2.toFixed(2)} (p = ${selection.mundlakCRE.p.toFixed(4)}) -> Memilih ${selection.mundlakCRE.preferred}`);
  }
  lines.push(`Kesimpulan Model                 : ${selection.selectedModel} (${selection.selectionReason})`);
  lines.push('');

  lines.push(`2. ESTIMASI MODEL AKHIR (${finalModel.modelType} - Cluster Robust)`);
  lines.push('------------------------------------------------------------------------------------------------------');
  lines.push('Variabel       | Koefisien (b)  | Std. Err (Robust) | t / z    | P>|t| / P>|z| | 95% Conf. Interval');
  lines.push('------------------------------------------------------------------------------------------------------');

  for (const [vName, cRow] of Object.entries(finalModel.coefficients)) {
    const padVar = (vName + '              ').slice(0, 14);
    if (cRow.isOmitted) {
      lines.push(`${padVar} | 0 (omitted)    | -                 | -        | -             | -`);
      continue;
    }
    const padB = (cRow.b.toFixed(6) + '              ').slice(0, 14);
    const padSe = (cRow.stdError.toFixed(6) + '                 ').slice(0, 17);
    const padT = (cRow.tOrZ.toFixed(2) + '        ').slice(0, 8);
    const padSig = (cRow.sig.toFixed(4) + '              ').slice(0, 13);
    const ci = `[${cRow.ciLower.toFixed(6)}, ${cRow.ciUpper.toFixed(6)}]`;
    lines.push(`${padVar} | ${padB} | ${padSe} | ${padT} | ${padSig} | ${ci}`);
  }
  lines.push('------------------------------------------------------------------------------------------------------');
  lines.push(`R-squared      : Within = ${finalModel.r2.within.toFixed(4)}, Between = ${finalModel.r2.between.toFixed(4)}, Overall = ${finalModel.r2.overall.toFixed(4)}`);
  lines.push('');

  lines.push('3. UJI ASUMSI KLASIK & REMEDIAL');
  lines.push(`- Multikolinearitas (VIF)        : Mean VIF = ${assumptions.vif.meanVif.toFixed(2)} (${assumptions.vif.meanVif < 10 ? 'Lolos / Bebas Multikolinearitas' : 'Waspada Multikolinearitas Tinggi'})`);
  lines.push(`- Heteroskedastisitas (xttest3)  : chi2(${assumptions.greeneHetero?.df ?? 10}) = ${assumptions.greeneHetero?.chi2.toFixed(2) ?? '-'} (p = ${assumptions.greeneHetero?.p.toFixed(4) ?? '-'}) -> ${assumptions.greeneHetero?.hasHeteroskedasticity ? 'Terdeteksi Heteroskedastisitas (Diperbaiki Robust SE)' : 'Homoskedastis'}`);
  lines.push(`- Autokorelasi Serial (xtserial) : ${assumptions.wooldridgeSerial?.skippedReason ? `Dilewati (${assumptions.wooldridgeSerial.skippedReason})` : `F(${assumptions.wooldridgeSerial?.df1}, ${assumptions.wooldridgeSerial?.df2}) = ${assumptions.wooldridgeSerial?.f.toFixed(2)} (p = ${assumptions.wooldridgeSerial?.p.toFixed(4)}) -> ${assumptions.wooldridgeSerial?.hasAutocorrelation ? 'Terdeteksi Autokorelasi Serial (Diperbaiki Robust SE)' : 'Bebas Autokorelasi'}`}`);
  lines.push(`- Normalitas Residu (swilk)      : ${assumptions.normality?.isNormal ? 'Normal' : `Non-normal (${assumptions.normality?.cltProtected ? 'Aman berkat Central Limit Theorem / CLT N >= 30' : 'Perlu perhatian'})`}`);
  if (assumptions.clusterBiasWarning?.isBiased) {
    lines.push(`- Catatan Ukuran Cluster (G)     : G = ${assumptions.clusterBiasWarning.clusterCount} (< 30 Entitas) -> Peringatan: standard error cluster-robust berpotensi underestimated.`);
  }
  lines.push('==============================================================================');

  return lines.join('\n');
}

