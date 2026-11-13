import { NextRequest, NextResponse } from "next/server";
import {
  generateRegressionDocx,
  generateMRADocx,
  generateContingencyDocx
} from "../../../../lib/regression-docx-builder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      analysisType = "ols",
      result,
      mraResult,
      contingencyResult,
      datasetName = body.fileName || "Dataset_Regresi.xlsx",
      sheetName = body.selectedSheet || "Sheet1",
      alpha = 0.05,
      seed = 12345,
      statusLabel = "Konfirmatori",
      exploratoryReason,
      kTried = 1,
      modelsHistory = [],
      recommendationOutput,
      comparisonReport,
    } = body;

    let docxBuffer: Buffer;
    let prefix = "Hasil_Regresi_SPSS";

    if (analysisType === "mra") {
      if (!mraResult || !mraResult.models) {
        return NextResponse.json({ error: "Objek hasil MRA tidak valid." }, { status: 400 });
      }
      docxBuffer = await generateMRADocx({ mraResult, datasetName, sheetName });
      prefix = "Hasil_MRA_SPSS";
    } else if (analysisType === "contingency") {
      if (!contingencyResult || !contingencyResult.chiSquareTests) {
        return NextResponse.json({ error: "Objek hasil Kontingensi tidak valid." }, { status: 400 });
      }
      docxBuffer = await generateContingencyDocx({ contingencyResult, datasetName, sheetName });
      prefix = "Hasil_Kontingensi_SPSS";
    } else {
      if (!result || !result.coefficients || !result.modelSummary) {
        return NextResponse.json(
          { error: "Objek hasil OLSFitResult tidak valid atau belum tersedia." },
          { status: 400 }
        );
      }

      docxBuffer = await generateRegressionDocx({
        result,
        datasetName,
        sheetName,
        alpha,
        seed,
        statusLabel,
        exploratoryReason,
        kTried,
        modelsHistory,
        recommendationOutput,
        comparisonReport,
      });
    }

    const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("Gagal mengekspor file Word docx:", err);
    return NextResponse.json(
      { error: "Gagal membuat dokumen Word: " + (err.message || String(err)) },
      { status: 500 }
    );
  }
}
