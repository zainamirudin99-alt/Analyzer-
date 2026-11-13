// ============================================================
// Panel Latent Variable Measurement Model — Pure TypeScript PDF Generator
// Produces multi-page PDF 1.4 binary covering all 14 academic chapters
// without external heavy dependencies (Vercel-safe & offline-capable).
// ============================================================

import { PanelLatentFitResult } from './panel-latent-types';

function escapePdfText(text: string): string {
  // Map common Unicode symbols cleanly to WinAnsi/ASCII equivalents
  const ascii = text
    .replace(/CO₂/g, 'CO2')
    .replace(/[α]/g, 'alpha')
    .replace(/[λ]/g, 'lambda')
    .replace(/[σ]/g, 'sigma')
    .replace(/[ε]/g, 'eps')
    .replace(/[μ]/g, 'mu')
    .replace(/[γ]/g, 'gamma')
    .replace(/[ρ]/g, 'rho')
    .replace(/[η]/g, 'eta')
    .replace(/[ν]/g, 'nu')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[≠]/g, '!=')
    .replace(/[×]/g, 'x')
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars = 90): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += ` ${w}`;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface PdfLineItem {
  text: string;
  size: number;
  bold: boolean;
  mono?: boolean;
  spacingBefore?: number;
}

export function generatePanelLatentPDF(
  result: PanelLatentFitResult,
  datasetName = 'Dataset_CO2_Panel.xlsx'
): Buffer {
  const items: PdfLineItem[] = [];
  const pushHeading = (t: string) => items.push({ text: t, size: 12, bold: true, spacingBefore: 10 });
  const pushBody = (t: string) =>
    wrapText(t, 88).forEach(line => items.push({ text: line, size: 9.5, bold: false }));
  const pushMono = (block: string) =>
    block.split('\n').forEach(l => items.push({ text: l.slice(0, 96), size: 8, bold: false, mono: true }));

  items.push({ text: 'LAPORAN PENELITIAN: PANEL LATENT VARIABLE MEASUREMENT MODEL', size: 14, bold: true });
  pushBody(`Integrasi Multi-Sumber Emisi CO2 | Bayesian Hierarchical Model | Dataset: ${datasetName}`);

  pushHeading('1. Deskripsi Data');
  pushBody(
    `Jumlah observasi = ${result.nObs} (${result.nCities} kota x ${result.nYears} tahun, status: ${result.isBalanced ? 'Balanced' : 'Unbalanced'}). Sumber: ${result.mapping.x1Label}, ${result.mapping.x2Label}, ${result.mapping.x3Label} (satuan: ${result.scaleContext.workingUnitNote}).`
  );

  pushHeading('2. Metodologi Penelitian');
  pushBody(
    'Menggunakan Bayesian Hierarchical Latent Variable Measurement Model yang memperlakukan X1, X2, dan X3 sebagai indikator dari satu variabel laten emisi CO2 Y*_it.'
  );

  pushHeading('3. Spesifikasi Model & 4. Persamaan Matematis');
  pushBody(
    `Likelihood: ${result.spec.likelihood === 'student_t' ? `Student-t(df=${result.spec.studentTDf})` : 'Gaussian Normal'} | Prior: ${result.spec.priorRegime} | City Random Intercept: ${result.spec.includeCityIntercept ? 'Ya' : 'Tidak'} | Time Effect: ${result.spec.includeTimeEffect ? 'Ya' : 'Tidak'} | AR(1): ${result.spec.includeAR1 ? 'Ya' : 'Tidak'}.`
  );
  pushBody('Persamaan: X_j,it = alpha_j + lambda_j * Y*_it + eps_j,it; Y*_it = mu + u_i + gamma_t + rho*(Y*_i,t-1 - mu - u_i - gamma_t-1) + eta_it.');

  pushHeading('5. Asumsi Identifikasi');
  pushBody(result.interpretations.methodologyAndIdentificationNote);

  pushHeading('6. Proses Estimasi & 7. Hasil Diagnostik');
  pushBody(`Mesin Komputasi: ${result.engineAttribution}`);
  pushBody(result.interpretations.diagnosticsInterpretation);

  pushHeading('8. Estimasi Parameter Posterior (Gaya Stata)');
  pushMono(result.stataOutput.parameterTableText);

  pushHeading('9. Perbandingan Ketiga Sumber Pengukuran');
  pushMono(result.stataOutput.reliabilityTableText);
  pushBody(result.interpretations.reliabilityInterpretation);

  pushHeading('10. Estimasi Nilai Laten Emisi CO2 (Cuplikan Kota-Tahun)');
  pushMono(result.stataOutput.latentTableText);

  pushHeading('11. Interpretasi Hasil');
  pushBody(result.interpretations.parameterInterpretation);
  pushBody(result.interpretations.latentEmissionInterpretation);
  pushBody(result.interpretations.sensitivityInterpretation);

  pushHeading('12. Keterbatasan Penelitian');
  result.interpretations.researchLimitations.forEach(lim => pushBody(`- ${lim}`));

  pushHeading('13. Kesimpulan');
  pushBody(result.interpretations.finalConclusion);

  pushHeading('14. Referensi');
  pushBody('1. Stan Users Guide: Measurement Error Models (mc-stan.org).');
  pushBody('2. stan-dev/example-models & munchfab/mlts & paul-buerkner/brms.');
  pushBody('3. Vehtari et al. (2021). Rank-Normalized Split-Rhat & ESS. Bayesian Analysis.');

  // Lay out items into A4 pages (595 x 842 pt)
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const topY = 795;
  const bottomY = 48;

  const pages: string[][] = [[]];
  let curY = topY;

  for (const item of items) {
    const gapBefore = item.spacingBefore || 0;
    const lineHeight = item.size + 4;
    if (curY - gapBefore - lineHeight < bottomY) {
      pages.push([]);
      curY = topY;
    } else {
      curY -= gapBefore;
    }
    const fontKey = item.mono ? '/F3' : item.bold ? '/F2' : '/F1';
    const cmd = `BT ${fontKey} ${item.size} Tf ${marginX} ${curY.toFixed(1)} Td (${escapePdfText(item.text)}) Tj ET`;
    pages[pages.length - 1].push(cmd);
    curY -= lineHeight;
  }

  // Construct valid PDF 1.4 object tree
  // Obj 1: Catalog, Obj 2: Pages, Obj 3/4/5: Fonts (Helvetica, Helvetica-Bold, Courier)
  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');

  const pageObjIds: number[] = [];
  const nextObjStart = 6;
  pages.forEach((_, idx) => pageObjIds.push(nextObjStart + idx * 2));

  objects.push(
    `2 0 obj << /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`
  );
  objects.push('3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj');
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj');

  pages.forEach((cmds, idx) => {
    const pageId = nextObjStart + idx * 2;
    const contentId = pageId + 1;
    const streamBody = cmds.join('\n');
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >> endobj`
    );
    objects.push(
      `${contentId} 0 obj << /Length ${Buffer.byteLength(streamBody, 'utf8')} >> stream\n${streamBody}\nendstream endobj`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach(obj => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

