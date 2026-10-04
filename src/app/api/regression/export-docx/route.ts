import { NextRequest, NextResponse } from "next/server";
import { generateRegressionDocx } from "../../../../lib/regression-docx-builder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      result,
      datasetName = "Dataset_Regresi.xlsx",
      sheetName = "Sheet1",
      alpha = 0.05,
      seed = 12345,
      statusLabel = "Konfirmatori",
      exploratoryReason,
      kTried = 1,
      modelsHistory = [],
    } = body;

    if (!result || !result.coefficients || !result.modelSummary) {
      return NextResponse.json(
        { error: "Objek hasil OLSFitResult tidak valid atau belum tersedia." },
        { status: 400 }
      );
    }

    const docxBuffer = await generateRegressionDocx({
      result,
      datasetName,
      sheetName,
      alpha,
      seed,
      statusLabel,
      exploratoryReason,
      kTried,
      modelsHistory,
    });

    const filename = `Hasil_Regresi_SPSS_${new Date().toISOString().slice(0, 10)}.docx`;

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
