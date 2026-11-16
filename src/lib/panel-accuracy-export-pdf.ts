// ============================================================
// Comparative Measurement Accuracy Assessment — Pure TS PDF 1.4 Generator
// Multi-Page Academic Report without External Native Dependencies
// ============================================================

import { PanelAccuracyFitResult } from './panel-accuracy-types';

function escapePdf(text: string): string {
  const ascii = text
    .replace(/CO₂/g, 'CO2')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[ρ]/g, 'rho')
    .replace(/[Δ]/g, 'Delta ')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[±]/g, '+/-')
    .replace(/[×]/g, 'x')
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface PdfLine {
  text: string;
  font: 'F1' | 'F2' | 'F3';
  size: number;
  leading: number;
}

export function generatePanelAccuracyPDF(
  result: PanelAccuracyFitResult,
  datasetName = 'Dataset_Panel_Accuracy.xlsx'
): Buffer {
  const items: PdfLine[] = [];
  const addTitle = (t: string) => {
    items.push({ text: '', font: 'F1', size: 8, leading: 10 });
    wrapLines(t, 82).forEach(l => items.push({ text: l, font: 'F2', size: 11, leading: 15 }));
  };
  const addBody = (t: string) => {
    wrapLines(t, 92).forEach(l => items.push({ text: l, font: 'F1', size: 9.5, leading: 13 }));
  };
  const addMono = (block: string) => {
    block.split('\n').forEach(l =>
      items.push({ text: l.slice(0, 102), font: 'F3', size: 7.5, leading: 10.5 })
    );
  };

  const refTag = `${result.referenceSource.name} (${result.referenceSource.label})`;

  items.push({
    text: 'LAPORAN COMPARATIVE MEASUREMENT ACCURACY ASSESSMENT (PANEL DATA APPROACH)',
    font: 'F2',
    size: 12,
    leading: 16
  });
  addBody(
    `Dataset: ${datasetName} | Sumber Referensi (r): ${refTag} | Complete-Case: ${result.datasetMeta.nCompletePairs}/${result.datasetMeta.nObsRaw} (${result.datasetMeta.nCities} Kota x ${result.datasetMeta.nYears} Tahun)`
  );

  addTitle('1. VALIDITAS SUMBER REFERENSI & KUALITAS DATA');
  addBody(result.interpretations.referenceValidityInterpretation);

  addTitle('2. KORELASI PANEL & EXPLORATORY DATA ANALYSIS');
  addBody(result.interpretations.edaAndCorrelationInterpretation);

  addTitle('3. TABEL METRIK AKURASI, LIN CCC & BLAND-ALTMAN (GAYA STATA)');
  addMono(result.stataOutput.headerConsoleText);
  addMono(result.stataOutput.accuracyMetricsTableText);
  addMono(result.stataOutput.cccAndBlandAltmanTableText);
  addBody(result.interpretations.accuracyAndAgreementInterpretation);

  addTitle('4. MODEL INFERENSIAL PANEL — PAIR FIXED EFFECTS & WILD CLUSTER BOOTSTRAP');
  addMono(result.stataOutput.pairFixedEffectsTableText);
  addMono(result.stataOutput.pairwiseContrastsTableText);
  addBody(result.interpretations.pairFixedEffectsInterpretation);

  addTitle('5. DIAGNOSTIK STATISTIK & PEMERINGKATAN SUMBER PEMBANDING');
  addMono(result.stataOutput.diagnosticsAndRankingText);
  addBody(result.interpretations.diagnosticsInterpretation);
  addBody(result.interpretations.rankingDecisionInterpretation);

  addTitle('6. KETERBATASAN PENELITIAN & KESIMPULAN AKHIR');
  result.interpretations.researchLimitations.forEach(lim => addBody(`- ${lim}`));
  addBody(`Kesimpulan Akhir: ${result.interpretations.finalConclusion}`);

  // Paginate onto A4 pages (595 x 842 pt)
  const pages: PdfLine[][] = [];
  let curPage: PdfLine[] = [];
  let y = 795;
  for (const it of items) {
    if (y - it.leading < 48) {
      pages.push(curPage);
      curPage = [];
      y = 795;
    }
    curPage.push(it);
    y -= it.leading;
  }
  if (curPage.length > 0 || pages.length === 0) pages.push(curPage);

  // Assemble PDF 1.4 objects
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  const pageObjNums: number[] = [];
  const firstPageObj = 6;
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(firstPageObj + i * 2);
  }

  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj');

  pages.forEach((pLines, pIdx) => {
    const pObjNum = firstPageObj + pIdx * 2;
    const cObjNum = pObjNum + 1;
    let curY = 795;
    const streamCmds: string[] = ['BT'];
    pLines.forEach(ln => {
      curY -= ln.leading;
      streamCmds.push(`/${ln.font} ${ln.size} Tf`);
      streamCmds.push(`1 0 0 1 42 ${curY.toFixed(1)} Tm`);
      streamCmds.push(`(${escapePdf(ln.text)}) Tj`);
    });
    streamCmds.push('ET');
    const streamData = streamCmds.join('\n');

    objects.push(
      `${pObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cObjNum} 0 R >>\nendobj`
    );
    objects.push(
      `${cObjNum} 0 obj\n<< /Length ${Buffer.byteLength(streamData, 'utf8')} >>\nstream\n${streamData}\nendstream\nendobj`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  });

  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
