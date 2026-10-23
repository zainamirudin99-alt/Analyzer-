/**
 * Panel Data Regression Word (.docx) Document Builder
 *
 * Menghasilkan dokumen laporan Microsoft Word ekonometrika gaya Stata
 * dengan tabel formal APA/Stata (garis ganda atas, garis bawah header, tanpa garis vertikal),
 * 13 blok langkah terstruktur, hasil uji pemilihan model, dan penjelasan bahasa bayi.
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Packer
} from 'docx';
import { PanelFitResult, StataConsoleBlockData } from './panel-types';

export interface PanelDocxExportOptions {
  fitResult: PanelFitResult;
  datasetName?: string;
  author?: string;
  notes?: string;
}

export async function generatePanelDocx(options: PanelDocxExportOptions): Promise<Buffer> {
  const { fitResult, datasetName = 'Dataset_Panel.xlsx', author = 'Sistem Analisis Ekonometrika Panel' } = options;
  const { declaration, selection, finalModel, assumptions, consoleBlocks } = fitResult;

  // Gaya border tabel APA/Stata
  const stataTableBorders = {
    top: { style: BorderStyle.DOUBLE, size: 3, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 3, color: '000000' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
  };

  const headerBottomBorder = {
    bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
    top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' }
  };

  const docChildren: (Paragraph | Table)[] = [];

  // ==========================================
  // Header / Judul Dokumen
  // ==========================================
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'LAPORAN HASIL REGRESI DATA PANEL',
          bold: true,
          size: 32,
          color: '1E3D14'
        })
      ],
      spacing: { before: 200, after: 100 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Standar Ekonometrika Gaya Stata (13 Langkah Lengkap)',
          italics: true,
          size: 22,
          color: '2E6922'
        })
      ],
      spacing: { after: 300 }
    })
  );

  // Metadata Tabel Ringkas
  const metaRows = [
    ['Nama Berkas Dataset', datasetName],
    ['Struktur Data', `Data Panel (${declaration.entityCount} Entitas, ${declaration.tMax} Periode, NT = ${declaration.totalObs})`],
    ['Keseimbangan Panel', declaration.isBalanced ? 'Strongly Balanced' : 'Unbalanced Panel'],
    ['Model Terpilih', `${selection.selectedModel} (${selection.selectedModel === 'FEM' ? 'Fixed Effects Model' : selection.selectedModel === 'REM' ? 'Random Effects Model' : 'Common Effect Model'})`],
    ['Koreksi Standar Error', 'Cluster-Robust SE (Arellano / Rogers Sandwich Estimator)'],
    ['Waktu Eksekusi', new Date().toLocaleString('id-ID')]
  ];

  const metaTableRows = metaRows.map(([k, v]) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 19 })] })],
          width: { size: 35, type: WidthType.PERCENTAGE }
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: v, size: 19 })] })],
          width: { size: 65, type: WidthType.PERCENTAGE }
        })
      ]
    })
  );

  docChildren.push(
    new Table({
      rows: metaTableRows,
      borders: stataTableBorders,
      width: { size: 100, type: WidthType.PERCENTAGE }
    }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // ==========================================
  // Bagian 1: Hasil Model Akhir
  // ==========================================
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `1. Estimasi Model Akhir (${finalModel.modelType} - Cluster Robust)`, bold: true, size: 26, color: '1E3D14' })],
      spacing: { before: 250, after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Tabel di bawah menyajikan koefisien regresi model ${finalModel.modelType} apa adanya, dilengkapi standard error yang telah disesuaikan terhadap clustering entitas (G = ${finalModel.nEntities}):`,
          size: 20
        })
      ],
      spacing: { after: 150 }
    })
  );

  // Tabel Koefisien Model Akhir
  const coeffHeaders = ['Variabel', 'Koefisien (b)', 'Std. Error (Robust)', finalModel.modelType === 'REM' ? 'z' : 't', 'P-value', '95% CI Lower', '95% CI Upper'];
  const coeffHeaderCells = coeffHeaders.map(h =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
      borders: headerBottomBorder
    })
  );

  const coeffDataRows = Object.entries(finalModel.coefficients).map(([vName, cRow]) =>
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: vName, bold: true, size: 18 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '0 (omitted)' : cRow.b.toFixed(6), size: 18 })], alignment: AlignmentType.RIGHT })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '-' : cRow.stdError.toFixed(6), size: 18 })], alignment: AlignmentType.RIGHT })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '-' : cRow.tOrZ.toFixed(2), size: 18 })], alignment: AlignmentType.RIGHT })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '-' : cRow.sig.toFixed(4), size: 18 })], alignment: AlignmentType.RIGHT })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '-' : cRow.ciLower.toFixed(6), size: 18 })], alignment: AlignmentType.RIGHT })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cRow.isOmitted ? '-' : cRow.ciUpper.toFixed(6), size: 18 })], alignment: AlignmentType.RIGHT })] })
      ]
    })
  );

  docChildren.push(
    new Table({
      rows: [new TableRow({ children: coeffHeaderCells }), ...coeffDataRows],
      borders: stataTableBorders,
      width: { size: 100, type: WidthType.PERCENTAGE }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Keterangan: R-sq within = ${finalModel.r2.within.toFixed(4)}, between = ${finalModel.r2.between.toFixed(4)}, overall = ${finalModel.r2.overall.toFixed(4)}. Jumlah observasi N = ${finalModel.nObs}.`,
          italics: true,
          size: 17
        })
      ],
      spacing: { before: 80, after: 250 }
    })
  );

  // ==========================================
  // Bagian 2: Matriks Keputusan Pemilihan Model
  // ==========================================
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '2. Pengujian Spesifikasi & Pemilihan Model', bold: true, size: 26, color: '1E3D14' })],
      spacing: { before: 200, after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Hasil Uji Chow: F(${selection.chow.df1}, ${selection.chow.df2}) = ${selection.chow.stat.toFixed(2)} (p = ${selection.chow.p.toFixed(4)}) -> Memilih ${selection.chow.preferred}\n`, size: 20 }),
        new TextRun({ text: `Hasil Uji Hausman: chi2(${selection.hausman.df}) = ${selection.hausman.chi2.toFixed(2)} (p = ${selection.hausman.p.toFixed(4)}) -> Memilih ${selection.hausman.preferred}\n`, size: 20 }),
        new TextRun({ text: `Hasil Uji Breusch-Pagan LM: chibar2(${selection.breuschPaganLM.df}) = ${selection.breuschPaganLM.chibar2.toFixed(2)} (p = ${selection.breuschPaganLM.p.toFixed(4)}) -> Memilih ${selection.breuschPaganLM.preferred}\n`, size: 20 }),
        new TextRun({ text: `Alasan Pemilihan: ${selection.selectionReason}`, bold: true, size: 20 })
      ],
      spacing: { after: 250 }
    })
  );

  // ==========================================
  // Bagian 3: 13 Langkah Stata Lengkap
  // ==========================================
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '3. Rincian 13 Langkah Ekonometrika Gaya Stata', bold: true, size: 26, color: '1E3D14' })],
      spacing: { before: 200, after: 150 }
    })
  );

  for (const block of consoleBlocks) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: `Langkah ${block.stepIndex}: ${block.stepTitle}`,
            bold: true,
            size: 22,
            color: '2E6922'
          })
        ],
        spacing: { before: 180, after: 60 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Perintah Stata: ', bold: true, size: 19 }),
          new TextRun({ text: block.stataCommand, font: 'Consolas', size: 19, color: '15803D' })
        ],
        spacing: { after: 40 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Fungsi Metodologis: ', bold: true, size: 19 }),
          new TextRun({ text: block.stataFunction, size: 19 })
        ],
        spacing: { after: 60 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Output Terminal Stata:\n', bold: true, size: 18 }),
          new TextRun({ text: block.stataOutput, font: 'Consolas', size: 16, color: '374151' })
        ],
        spacing: { after: 60 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Penjelasan Bahasa Bayi (Analogi Awam): ', bold: true, size: 19, color: 'B45309' }),
          new TextRun({ text: block.babyLanguage, italics: true, size: 19 })
        ],
        spacing: { after: 180 }
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        children: docChildren
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
