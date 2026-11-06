import { NextRequest, NextResponse } from "next/server";
import { generateRegressionXLSX } from "../../../../lib/regression-export-xlsx";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      result,
      datasetName = "Dataset_Regresi.xlsx",
      sheetName = "Sheet1",
      comparisonReport,
      recommendationOutput
    } = body;

    if (!result || !result.coefficients || !result.modelSummary) {
      return NextResponse.json(
        { error: "Objek hasil OLSFitResult tidak valid atau belum tersedia." },
        { status: 400 }
      );
    }

    const xlsxBuffer = generateRegressionXLSX({
      result,
      datasetName,
      sheetName,
      comparisonReport,
      recommendationOutput
    });

    const filename = `Hasil_Regresi_SPSS_${new Date().toISOString().slice(0, 10)}.xlsx`;

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

