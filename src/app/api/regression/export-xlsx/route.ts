import { NextRequest, NextResponse } from "next/server";
import {
  generateRegressionXLSX,
  generateMRAXLSX,
  generateContingencyXLSX
} from "../../../../lib/regression-export-xlsx";

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
      comparisonReport,
      recommendationOutput
    } = body;

    let xlsxBuffer: Buffer;
    let prefix = "Hasil_Regresi_SPSS";

    if (analysisType === "mra") {
      if (!mraResult || !mraResult.models) {
        return NextResponse.json({ error: "Objek hasil MRA tidak valid." }, { status: 400 });
      }
      xlsxBuffer = generateMRAXLSX({ mraResult, datasetName, sheetName });
      prefix = "Hasil_MRA_SPSS";
    } else if (analysisType === "contingency") {
      if (!contingencyResult || !contingencyResult.chiSquareTests) {
        return NextResponse.json({ error: "Objek hasil Kontingensi tidak valid." }, { status: 400 });
      }
      xlsxBuffer = generateContingencyXLSX({ contingencyResult, datasetName, sheetName });
      prefix = "Hasil_Kontingensi_SPSS";
    } else {
      if (!result || !result.coefficients || !result.modelSummary) {
        return NextResponse.json(
          { error: "Objek hasil OLSFitResult tidak valid atau belum tersedia." },
          { status: 400 }
        );
      }

      xlsxBuffer = generateRegressionXLSX({
        result,
        datasetName,
        sheetName,
        comparisonReport,
        recommendationOutput
      });
    }

    const filename = `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("Gagal mengekspor file Excel xlsx:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat membuat file Excel: " + (err.message || String(err)) },
      { status: 500 }
    );
  }
}

