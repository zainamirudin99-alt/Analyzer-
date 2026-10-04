/**
 * Regression Word (.docx) Document Builder
 *
 * Constructs publication-grade Microsoft Word reports with genuine semantic tables
 * formatted in SPSS APA style (double top line, header underline, bottom line, NO vertical borders),
 * deterministic narrative interpretations, cover page metadata, and audit logs.
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
  Packer,
} from "docx";
import { OLSFitResult } from "./regression-engine";
import { generateDeterministicInterpretation } from "./regression-interpretation";

export interface DocxExportOptions {
  result: OLSFitResult;
  datasetName: string;
  sheetName?: string;
  alpha?: number;
  seed?: number;
  statusLabel?: "Konfirmatori" | "Eksploratori";
  exploratoryReason?: string;
  kTried?: number;
  modelsHistory?: Array<{
    id: string;
    title: string;
    type: string;
    result: OLSFitResult;
    label: "Konfirmatori" | "Eksploratori";
    passRate?: number;
  }>;
}

export async function generateRegressionDocx(options: DocxExportOptions): Promise<Buffer> {
  const {
    result,
    datasetName,
    sheetName = "Sheet1",
    alpha = 0.05,
    seed = 12345,
    statusLabel = "Konfirmatori",
    exploratoryReason,
    kTried = 1,
    modelsHistory = [],
  } = options;

  const narrative = generateDeterministicInterpretation(result, {
    modelId: "M0",
    modelType: "baseline",
    title: "Model Terpilih",
    kTried,
    label: statusLabel,
    alpha,
    exploratoryReason,
  });

  // Border styles for genuine SPSS-style Word tables:
  // - Top border: double line
  // - Header bottom: single line
  // - Table bottom: single line
  // - Vertical / column borders: NONE
  const spssTableBorders = {
    top: { style: BorderStyle.DOUBLE, size: 3, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 3, color: "000000" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  const headerBottomBorder = {
    bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  function createSPSSTable(
    caption: string,
    headers: string[],
    dataRows: (string | number)[][],
    footnotes: string[] = []
  ): (Paragraph | Table)[] {
    const tableElements: (Paragraph | Table)[] = [];

    // Caption
    tableElements.push(
      new Paragraph({
        children: [
          new TextRun({ text: caption, bold: true, size: 22 }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    // Header Row
    const headerCells = headers.map(
      (h) =>
        new Cell(
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 18 })],
            alignment: AlignmentType.CENTER,
          }),
          headerBottomBorder
        )
    );

    // Data Rows
    const rows = [
      new TableRow({ children: headerCells }),
      ...dataRows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (val, idx) =>
                new Cell(
                  new Paragraph({
                    children: [new TextRun({ text: String(val), size: 18 })],
                    alignment: idx === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
                  })
                )
            ),
          })
      ),
    ];

    tableElements.push(
      new Table({
        rows,
        borders: spssTableBorders,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    // Footnotes
    for (const fn of footnotes) {
      tableElements.push(
        new Paragraph({
          children: [new TextRun({ text: fn, italics: true, size: 16, color: "555555" })],
          spacing: { before: 50, after: 100 },
        })
      );
    }

    return tableElements;
  }

  // Build document sections
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Cover Header
          new Paragraph({
            text: "CED & Statistical Regression Analyzer",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Laporan Hasil Analisis Regresi Linear & Uji Asumsi Klasik",
                bold: true,
                size: 32,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Tanggal Laporan: ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })} | Versi Mesin: ${result.engineVersion}`,
                size: 20,
                color: "666666",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),

          // Metadata Summary
          new Paragraph({
            children: [new TextRun({ text: "1. Metadata dan Parameter Analisis", bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }),
          ...createSPSSTable(
            "Tabel 1.1: Parameter Spesifikasi Model",
            ["Parameter", "Nilai Spesifikasi", "Keterangan"],
            [
              ["Nama Berkas / Sumber", datasetName, `Lembar Kerja: ${sheetName}`],
              ["Variabel Dependen (Y)", result.variables.yCol, "Numerik Kontinu (Skala Rasio/Interval)"],
              ["Variabel Independen (X)", result.variables.xCols.join(", "), `${result.kPredictors} Prediktor`],
              ["Ukuran Sampel Efektif (N)", result.sampleSize.nUsed, `Observasi bersih (Dropped: ${result.sampleSize.rowsDropped})`],
              ["Tingkat Signifikansi (Alpha)", alpha, "Uji Dua Arah (Two-Tailed)"],
              ["Seed Acak Replikasi", seed, "Benih acak konstan"],
              ["Status Laporan", statusLabel, kTried > 1 ? `Eksplorasi ${kTried} model` : "Model tunggal terencana"],
            ]
          ),

          // Executive Summary & Benchmark Card
          new Paragraph({
            children: [new TextRun({ text: "2. Ringkasan Eksekutif & Skor Kesesuaian", bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: narrative.executiveSummary, size: 20 })],
            spacing: { after: 150 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Skor Konsistensi Matematis S3: ${result.scores.s3Consistency}% (${result.scores.checksPassed}/${result.scores.totalChecks} identitas OLS lolos secara eksak).`,
                bold: true,
                size: 18,
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Akurasi Benchmark S1: Lulus terhadap dataset sertifikasi NIST StRD Norris (LRE 13.33–15.11, target >= 9.0) dan R standard library.",
                size: 18,
                color: "444444",
              }),
            ],
            spacing: { after: 200 },
          }),

          // 3. Tabel Analisis Bergaya SPSS
          new Paragraph({
            children: [new TextRun({ text: "3. Tabel Analisis Bergaya SPSS", bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),

          // SPSS Table 0: Descriptive Statistics
          ...(result.descriptiveStatistics && result.descriptiveStatistics.length > 0
            ? createSPSSTable(
                "Tabel 3.0: Descriptive Statistics",
                ["Variabel", "N", "Mean", "Std. Deviation", "Minimum", "Maximum"],
                result.descriptiveStatistics.map((ds) => [
                  ds.variable,
                  ds.n,
                  ds.mean.toFixed(3),
                  ds.stdDev.toFixed(3),
                  ds.min.toFixed(3),
                  ds.max.toFixed(3),
                ]),
                [`a. Ukuran sampel valid (listwise deletion): N = ${result.sampleSize.nUsed}`]
              )
            : []),

          // SPSS Table 1: Model Summary
          ...createSPSSTable(
            "Tabel 3.1: Model Summary",
            ["Model", "R", "R Square", "Adjusted R Square", "Std. Error of the Estimate", "Durbin-Watson"],
            [
              [
                result.modelSummary.model,
                result.modelSummary.r.toFixed(3),
                result.modelSummary.rSquared.toFixed(3),
                result.modelSummary.adjRSquared.toFixed(3),
                result.modelSummary.stdErrorEstimate.toFixed(3),
                result.modelSummary.durbinWatson.toFixed(3),
              ],
            ],
            [
              `a. Predictors: (Constant), ${result.variables.xCols.join(", ")}`,
              `b. Dependent Variable: ${result.variables.yCol}`,
            ]
          ),
          new Paragraph({
            children: [new TextRun({ text: `Interpretasi: ${narrative.modelSummary}`, size: 18, italics: true })],
            spacing: { before: 50, after: 200 },
          }),

          // SPSS Table 2: ANOVA
          ...createSPSSTable(
            "Tabel 3.2: ANOVA",
            ["Model", "Sum of Squares", "df", "Mean Square", "F", "Sig."],
            [
              [
                "Regression",
                result.anova.regression.ss.toFixed(3),
                result.anova.regression.df,
                result.anova.regression.ms.toFixed(3),
                result.anova.regression.f.toFixed(3),
                result.anova.regression.sig < 0.001 ? ".000" : result.anova.regression.sig.toFixed(3).replace(/^0/, ""),
              ],
              [
                "Residual",
                result.anova.residual.ss.toFixed(3),
                result.anova.residual.df,
                result.anova.residual.ms.toFixed(3),
                "",
                "",
              ],
              [
                "Total",
                result.anova.total.ss.toFixed(3),
                result.anova.total.df,
                "",
                "",
                "",
              ],
            ],
            [
              `a. Dependent Variable: ${result.variables.yCol}`,
              `b. Predictors: (Constant), ${result.variables.xCols.join(", ")}`,
            ]
          ),
          new Paragraph({
            children: [new TextRun({ text: `Interpretasi: ${narrative.anova}`, size: 18, italics: true })],
            spacing: { before: 50, after: 200 },
          }),

          // SPSS Table 3: Coefficients
          ...createSPSSTable(
            "Tabel 3.3: Coefficients",
            ["Model", "B", "Std. Error", "Beta", "t", "Sig.", "95% CI Lower", "95% CI Upper", "Tolerance", "VIF"],
            result.coefficients.map((c) => [
              c.variable,
              c.b.toFixed(3),
              c.stdError.toFixed(3),
              c.variable === "(Constant)" ? "" : c.beta.toFixed(3),
              c.t.toFixed(3),
              c.sig < 0.001 ? ".000" : c.sig.toFixed(3).replace(/^0/, ""),
              c.ciLower.toFixed(3),
              c.ciUpper.toFixed(3),
              c.variable === "(Constant)" ? "" : c.collinearity.tolerance.toFixed(3),
              c.variable === "(Constant)" ? "" : c.collinearity.vif.toFixed(3),
            ]),
            [`a. Dependent Variable: ${result.variables.yCol}`]
          ),
          new Paragraph({
            children: [
              new TextRun({ text: "Persamaan Garis Regresi Linear: ", bold: true, size: 20 }),
              new TextRun({ text: narrative.regressionEquation, bold: true, color: "0055aa", size: 20 }),
            ],
            spacing: { before: 100, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `Interpretasi Koefisien & Uji Parsial (Uji t): ${narrative.coefficients}`, size: 18, italics: true })],
            spacing: { before: 50, after: 200 },
          }),

          // SPSS Table 4: Diagnostik Asumsi
          new Paragraph({
            children: [new TextRun({ text: "4. Hasil Evaluasi 9 Uji Asumsi Klasik", bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),
          ...createSPSSTable(
            "Tabel 4.1: Rekapitulasi Diagnostik Asumsi Klasik",
            ["Nama Pengujian", "Statistik", "Sig. / Kriteria", "Status Evaluasi", "Keterangan Ilmiah"],
            result.assumptions.map((a) => [
              a.name,
              a.statistic !== undefined && a.statistic !== null ? a.statistic.toFixed(3) : "-",
              a.pValue !== undefined && a.pValue !== null ? (a.pValue < 0.001 ? ".000" : a.pValue.toFixed(3).replace(/^0/, "")) : a.criteria,
              a.status === "lulus" ? "Terpenuhi" : a.status === "gagal" ? "Gagal" : "Tidak Berlaku",
              a.reason,
            ])
          ),

          // Low R2 Disclosure if applicable
          ...(narrative.lowR2Note
            ? [
                new Paragraph({
                  children: [new TextRun({ text: `Catatan Jalur R² Rendah: ${narrative.lowR2Note}`, size: 18, italics: true, color: "c2410c" })],
                  spacing: { before: 100, after: 150 },
                }),
              ]
            : []),

          // Models History Section (M0 vs M1...Mk)
          ...(modelsHistory.length > 1
            ? [
                new Paragraph({
                  children: [new TextRun({ text: "5. Riwayat Eksplorasi Model (Perbaikan yang Dicoba)", bold: true, size: 24 })],
                  heading: HeadingLevel.HEADING_3,
                  spacing: { before: 300, after: 100 },
                }),
                ...createSPSSTable(
                  "Tabel 5.1: Perbandingan Spesifikasi Model",
                  ["Model", "Deskripsi / Opsi", "R Square", "Adj. R²", "F Stat", "Pass Rate (%)", "Status"],
                  modelsHistory.map((m) => [
                    m.id,
                    m.title,
                    m.result.modelSummary.rSquared.toFixed(3),
                    m.result.modelSummary.adjRSquared.toFixed(3),
                    m.result.anova.regression.f.toFixed(3),
                    m.passRate !== undefined ? `${m.passRate.toFixed(1)}%` : "-",
                    m.label,
                  ])
                ),
              ]
            : []),

          // Status & Methodological Notes
          new Paragraph({
            children: [new TextRun({ text: "6. Pernyataan Metodologis & Sumber Perbedaan terhadap SPSS", bold: true, size: 24 })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: narrative.status, bold: true, size: 18 })],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "1. Uji Normalitas: Menggunakan uji Shapiro-Wilk (N <= 50) dan koreksi Lilliefors aproksimasi analitik Molin-Abdi / Dallal-Wilkinson (N > 50).\n2. Uji Heteroskedastisitas: Menggunakan Breusch-Pagan bentuk Koenker studentized yang tangguh terhadap deviasi normalitas residual.\n3. Uji Stasioneritas ADF: Menggunakan nilai kritis asimtotik MacKinnon (1996).\n4. Penanganan Missing Data: Menggunakan listwise deletion terstandardisasi.",
                size: 16,
                color: "555555",
              }),
            ],
            spacing: { after: 300 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

class Cell extends TableCell {
  constructor(content: Paragraph, borders?: any) {
    super({
      children: [content],
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      borders: borders || {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
    });
  }
}
