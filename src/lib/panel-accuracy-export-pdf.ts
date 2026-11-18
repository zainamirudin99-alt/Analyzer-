// ============================================================
// Model Pengukuran Laten & Akurasi Panel (ISO 5725)
// Generator Laporan Akademis PDF 1.4 Murni TypeScript (Step 1–9 Lengkap)
// ============================================================

import { PanelAccuracyFitResult } from './panel-accuracy-types';

export function escapePdfAscii(text: string): string {
  const ascii = text
    .replace(/CO₂/g, 'CO2')
    .replace(/[₀]/g, '0')
    .replace(/[₁]/g, '1')
    .replace(/[₂]/g, '2')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[γ]/g, 'gamma')
    .replace(/[ε]/g, 'eps')
    .replace(/[θ]/g, 'theta')
    .replace(/[λ]/g, 'lambda')
    .replace(/[μ]/g, 'mu')
    .replace(/[ρ]/g, 'rho')
    .replace(/[σ]/g, 'sigma')
    .replace(/[τ]/g, 'tau')
    .replace(/[Δ]/g, 'Delta ')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[≠]/g, '!=')
    .replace(/[±]/g, '+/-')
    .replace(/[×]/g, 'x')
    .replace(/[÷]/g, '/')
    .replace(/[·]/g, '*')
    .replace(/[✓]/g, '[OK]')
    .replace(/[✗]/g, '[X]')
    .replace(/[★]/g, '*')
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars = 94): string[] {
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
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

interface PdfLine {
  kind: 'title' | 'section' | 'sub' | 'body' | 'mono' | 'monoHead' | 'spacer';
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

  const addSpacer = (leading = 8) => {
    items.push({ kind: 'spacer', text: '', font: 'F1', size: 8, leading });
  };
  const addSection = (t: string) => {
    addSpacer(8);
    wrapLines(t, 80).forEach(l =>
      items.push({ kind: 'section', text: l, font: 'F2', size: 10.5, leading: 15 })
    );
  };
  const addSub = (t: string) => {
    addSpacer(4);
    wrapLines(t, 88).forEach(l =>
      items.push({ kind: 'sub', text: l, font: 'F2', size: 9.5, leading: 13 })
    );
  };
  const addBody = (t: string) => {
    wrapLines(t, 95).forEach(l =>
      items.push({ kind: 'body', text: l, font: 'F1', size: 9.2, leading: 12.6 })
    );
  };
  const addMono = (block: string) => {
    block.split('\n').forEach(raw => {
      const normalized = raw.replace(/\t/g, '  ');
      if (normalized.length <= 112) {
        items.push({ kind: 'mono', text: normalized, font: 'F3', size: 7.2, leading: 10.0 });
      } else {
        for (let i = 0; i < normalized.length; i += 110) {
          items.push({
            kind: 'mono',
            text: normalized.slice(i, i + 110),
            font: 'F3',
            size: 7.2,
            leading: 10.0
          });
        }
      }
    });
  };

  // Header & Metadata Ringkas
  items.push({
    kind: 'title',
    text: 'LAPORAN MODEL PENGUKURAN LATEN & AKURASI PANEL (ISO 5725)',
    font: 'F2',
    size: 13,
    leading: 17
  });
  addBody(
    `Komparasi Bayesian Multi-Sumber Tanpa Reference Source | Dataset: ${datasetName} | Mesin: ${result.engineAttribution}`
  );
  addBody(
    `Struktur Panel: J=${result.sources.length} Sumber (${result.sources.map(s => s.label).join(', ')}) | Entitas G=${result.datasetMeta.nCities} x Periode T=${result.datasetMeta.nYears} | Complete-Case=${result.datasetMeta.nCompletePairs}/${result.datasetMeta.nObsRaw} | Max R-hat=${result.latentModel.maxRhat.toFixed(4)} | Min ESS=${result.latentModel.minEss} | Status=${result.ranking.canonicalStatus}`
  );
  addBody(
    `Kandidat Terbaik Relatif (#1): ${result.ranking.bestSourceLabel || result.ranking.bestCandidateLabel || 'Belum Dapat Ditetapkan Secara Mutlak'}`
  );

  // Bagian 1: Output Tabel Stata Berurutan Step 1 -> Step 9
  addSection('BAGIAN I. OUTPUT TABEL BERGAYA STATA TERURUT (STEP 1 S.D. STEP 9)');
  const ordered = result.stataOutput.orderedStepOutputs;
  if (ordered && ordered.length > 0) {
    ordered.forEach(st => {
      addSub(`${st.stepTitle}  [Stata: . ${st.stataCommand}]`);
      addMono(st.outputTableText);
    });
  } else {
    addMono(result.stataOutput.headerConsoleText);
    addMono(result.stataOutput.accuracyMetricsTableText);
    addMono(result.stataOutput.cccAndBlandAltmanTableText);
    addMono(result.stataOutput.pairFixedEffectsTableText);
    addMono(result.stataOutput.pairwiseContrastsTableText);
    addMono(result.stataOutput.diagnosticsAndRankingText);
  }

  // Bagian 2: Ringkasan Tambahan Korelasi Panel Step 4 (Within-Entity & First-Difference)
  addSection('BAGIAN II. MATRIKS KORELASI PANEL TAMBAHAN (WITHIN-ENTITY & FIRST-DIFF)');
  const padM = (s: string, w: number, right = false) =>
    s.length > w ? s.slice(0, w) : right ? s.padStart(w, ' ') : s.padEnd(w, ' ');
  const buildCorrBlock = (title: string, mat: number[][]) => {
    const hdr = `${padM('Sumber', 20)} | ` + result.eda.sourceLabels.map((_, i) => padM(`S${i + 1}`, 8, true)).join(' ');
    const rows = mat.map((row, i) =>
      `${padM(`S${i + 1} ${result.eda.sourceLabels[i]}`, 20)} | ` + row.map(v => padM(v.toFixed(3), 8, true)).join(' ')
    );
    return [`. * ${title}`, '-'.repeat(86), hdr, '-'.repeat(86), ...rows, '-'.repeat(86)].join('\n');
  };
  addMono(buildCorrBlock('Within-Entity Demeaned Pearson Correlation', result.eda.withinCityPearson));
  addSpacer(4);
  addMono(buildCorrBlock('First-Difference (Delta X) Pearson Correlation', result.eda.firstDiffPearson));

  // Bagian 3: Interpretasi Akademis Lengkap (Step 1-9)
  addSection('BAGIAN III. INTERPRETASI AKADEMIS BAHASA INDONESIA');
  addSub('1. Identifikasi Model Laten & Audit Kualitas Data (Step 1–3)');
  addBody(result.interpretations.referenceValidityInterpretation);

  addSub('2. Exploratory Data Analysis & Korelasi Panel (Step 4)');
  addBody(result.interpretations.edaAndCorrelationInterpretation);

  addSub('3. Akurasi Laten, Validasi LOSO, Lin CCC & Bland-Altman (Step 5–6)');
  addBody(result.interpretations.accuracyAndAgreementInterpretation);

  addSub('4. Model Inferensial Pair Fixed Effects, Driscoll-Kraay SE & Wild Bootstrap (Step 6)');
  addBody(result.interpretations.pairFixedEffectsInterpretation);

  addSub('5. Diagnostik Panel, Korelasi Galat & Sensitivitas (Step 7)');
  addBody(result.interpretations.diagnosticsInterpretation);

  addSub('6. Keputusan Pemeringkatan & Analisis 8-Poin Mengapa Sumber Terbaik (Step 8)');
  addBody(result.interpretations.rankingDecisionInterpretation);
  result.ranking.whyBestAnalysis.points.forEach((pt, idx) => {
    addBody(`${idx + 1}. ${pt.label}: ${pt.detail}`);
  });

  addSub('7. Keterbatasan Epistemologis & Kesimpulan Akhir');
  result.interpretations.researchLimitations.forEach(lim => addBody(`- ${lim}`));
  addBody(`Kesimpulan Akhir: ${result.interpretations.finalConclusion}`);

  // Bagian 4: Lampiran Kode Reprodusibilitas Stata Master (.do)
  addSection('BAGIAN IV. KODE STATA MASTER REPRODUKSI LENGKAP (.DO)');
  addMono(result.generatedCode.stataDoFile);

  // Paginate onto A4 pages (595 x 842 pt), usable text y in [785 .. 54]
  const TOP_Y = 785;
  const BOTTOM_Y = 54;
  const pages: PdfLine[][] = [];
  let curPage: PdfLine[] = [];
  let y = TOP_Y;
  for (const it of items) {
    if (y - it.leading < BOTTOM_Y && curPage.length > 0) {
      pages.push(curPage);
      curPage = [];
      y = TOP_Y;
    }
    if (!(curPage.length === 0 && it.kind === 'spacer')) {
      curPage.push(it);
      y -= it.leading;
    }
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

  const totalPages = pages.length;

  pages.forEach((pLines, pIdx) => {
    const pObjNum = firstPageObj + pIdx * 2;
    const cObjNum = pObjNum + 1;
    let curY = TOP_Y;

    const lineOps: Array<PdfLine & { yPos: number }> = [];
    pLines.forEach(ln => {
      curY -= ln.leading;
      lineOps.push({ ...ln, yPos: curY });
    });

    const cmds: string[] = [];

    // Graphic rules & tinted section bands drawn cleanly before text layer
    cmds.push('q');
    // Top page header rule
    cmds.push('0.12 0.25 0.45 RG 0.8 w 40 798 m 555 798 l S');
    // Bottom footer rule
    cmds.push('0.75 0.80 0.86 RG 0.5 w 40 42 m 555 42 l S');
    // Section header soft shading bars
    lineOps.forEach(ln => {
      if (ln.kind === 'section') {
        const boxBottom = ln.yPos - 4;
        cmds.push(`0.93 0.96 0.99 rg 40 ${boxBottom.toFixed(1)} 515 16 re f`);
        cmds.push(`0.18 0.36 0.62 RG 0.9 w 40 ${boxBottom.toFixed(1)} m 555 ${boxBottom.toFixed(1)} l S`);
      }
    });
    cmds.push('Q');

    // Text layer
    cmds.push('BT');
    // Running header & footer
    cmds.push('/F1 7.5 Tf 0.40 0.45 0.52 rg');
    cmds.push('1 0 0 1 40 806 Tm');
    cmds.push('(MODEL PENGUKURAN LATEN & AKURASI PANEL - ISO 5725) Tj');
    cmds.push('1 0 0 1 40 28 Tm');
    cmds.push(`(${escapePdfAscii(`Dataset: ${datasetName}`)}) Tj`);
    cmds.push('1 0 0 1 478 28 Tm');
    cmds.push(`(${escapePdfAscii(`Halaman ${pIdx + 1} dari ${totalPages}`)}) Tj`);

    lineOps.forEach(ln => {
      if (!ln.text.trim() && ln.kind === 'spacer') return;
      if (ln.kind === 'section' || ln.kind === 'title') {
        cmds.push('0.07 0.16 0.30 rg');
      } else if (ln.kind === 'sub') {
        cmds.push('0.06 0.35 0.25 rg');
      } else {
        cmds.push('0.10 0.12 0.16 rg');
      }
      cmds.push(`/${ln.font} ${ln.size} Tf`);
      cmds.push(`1 0 0 1 40 ${ln.yPos.toFixed(1)} Tm`);
      cmds.push(`(${escapePdfAscii(ln.text)}) Tj`);
    });
    cmds.push('ET');

    const streamData = cmds.join('\n');

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
