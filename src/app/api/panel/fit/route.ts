import { NextRequest, NextResponse } from 'next/server';
import {
  validatePanelStructure,
  inspectAndCleanPanelData,
  analyzeAndTransformPanelLN,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel,
  testPanelVIF,
  orthogPanelVariables,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  computePanelResiduals,
  testPanelNormality,
  computeClusterRobustSE,
  generateEasyPanelInterpretation
} from '../../../../lib/panel-engine';
import { generateAllPanelConsoleBlocks } from '../../../../lib/panel-interpretation';
import { PanelFitInput, PanelFitResult, ZeroValuePolicy } from '../../../../lib/panel-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows || [];
    const idCol = body.idCol || body.id_col;
    const timeCol = body.timeCol || body.time_col;
    const yCol = body.yCol || body.y_col;
    const xCols = body.xCols || body.x_cols || [];
    const alpha = body.alpha ? Number(body.alpha) : 0.05;
    const zeroPolicy: ZeroValuePolicy = body.zeroPolicy || 'true_zero';
    const manualLnCols: string[] | undefined = Array.isArray(body.lnCols) ? body.lnCols : undefined;
    const manualOrthogCols: string[] | undefined = Array.isArray(body.orthogCols) ? body.orthogCols : undefined;

    // Validasi Invarian I1 - I6
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Data baris (rows) wajib disertakan.' },
        { status: 400 }
      );
    }
    if (!idCol) {
      return NextResponse.json(
        { success: false, error: 'Kolom entitas (idCol) wajib ditentukan.' },
        { status: 400 }
      );
    }
    if (!timeCol) {
      return NextResponse.json(
        { success: false, error: 'Kolom waktu (timeCol) wajib ditentukan.' },
        { status: 400 }
      );
    }
    if (!yCol) {
      return NextResponse.json(
        { success: false, error: 'Variabel dependen (yCol) wajib ditentukan.' },
        { status: 400 }
      );
    }
    if (!xCols || xCols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Variabel independen (xCols) minimal 1 kolom.' },
        { status: 400 }
      );
    }

    if (xCols.includes(yCol)) {
      return NextResponse.json(
        { success: false, error: 'Variabel dependen (yCol) tidak boleh masuk ke dalam variabel independen (xCols).' },
        { status: 400 }
      );
    }

    // 1. Cleaning Data & Penanganan Nilai 0
    const cleanReport = inspectAndCleanPanelData(rows, idCol, timeCol, yCol, xCols, {
      dropDuplicates: true,
      handleMissing: 'listwise',
      zeroPolicy
    });

    // 2. Analisis Data Lanjutan & Transformasi LN
    const lnReport = analyzeAndTransformPanelLN(
      cleanReport.cleanedRows,
      yCol,
      xCols,
      manualLnCols
    );

    const activeYCol = lnReport.activeYCol;
    const initialActiveXCols = lnReport.activeXCols;
    const workingRows = lnReport.transformedRows;

    // 3. Validasi struktur panel (xtset)
    const decl = validatePanelStructure(workingRows, idCol, timeCol);
    if (!decl.isValid) {
      return NextResponse.json(
        { success: false, error: decl.errors.join(' ') },
        { status: 400 }
      );
    }

    const input: PanelFitInput = {
      rows: workingRows,
      idCol,
      timeCol,
      yCol: activeYCol,
      xCols: initialActiveXCols,
      alpha
    };

    // 4. Estimasi 3 model utama (CEM, FEM, REM)
    const cem = fitPanelCEM(input);
    const fem = fitPanelFEM(input);
    const rem = fitPanelREM(input);

    // 5. Uji Pemilihan Model (Chow + Dummy LSDV, Hausman, Mundlak, BP-LM)
    const chow = testChow(cem, fem, alpha, input);
    const hausman = testHausman(fem, rem, input, alpha);
    const mundlak = testMundlakCRE(input, alpha);
    const bp = testBreuschPaganLM(input, alpha);
    const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp, alpha);

    // 6. Uji Asumsi Klasik Panel (VIF pendekatan Uncentered untuk xtreg FEM/REM, Centered untuk reg CEM)
    const vif = testPanelVIF(input, selection.selectedModel);
    const orthogReport = orthogPanelVariables(
      workingRows,
      initialActiveXCols,
      vif,
      10.0,
      manualOrthogCols
    );

    const finalActiveXCols = orthogReport.finalActiveXCols;
    const finalInput: PanelFitInput = {
      rows: orthogReport.transformedRows,
      idCol,
      timeCol,
      yCol: activeYCol,
      xCols: finalActiveXCols,
      alpha
    };

    // Gunakan variabel terakhir (post-LN & post-orthog) pada model terpilih
    let selectedModel =
      selection.selectedModel === 'FEM'
        ? fem
        : selection.selectedModel === 'REM'
        ? rem
        : cem;

    let postOrthogSelectedModel = selectedModel;
    if (orthogReport.triggered) {
      postOrthogSelectedModel =
        selection.selectedModel === 'FEM'
          ? fitPanelFEM(finalInput)
          : selection.selectedModel === 'REM'
          ? fitPanelREM(finalInput)
          : fitPanelCEM(finalInput);
      selectedModel = postOrthogSelectedModel;
    }

    const greene = testGroupwiseHeteroGreene(
      finalInput,
      selection.selectedModel === 'FEM' ? selectedModel : fitPanelFEM(finalInput),
      alpha
    );
    const serial = testWooldridgeSerial(finalInput, alpha);

    // 7. Uji Normalitas Residual (predict e, e vs predict resid, residuals) + Histogram + sktest + swilk + ksmirnov
    const resBoth = computePanelResiduals(selectedModel, finalInput);
    const primaryResiduals = selection.selectedModel === 'CEM' ? resBoth.compositeResiduals : resBoth.eResiduals;
    const altResiduals = selection.selectedModel === 'CEM' ? resBoth.eResiduals : resBoth.compositeResiduals;
    const normality = testPanelNormality(primaryResiduals, alpha, selection.selectedModel, altResiduals);

    // 8. Model Akhir vce(robust) & Interpretasi Bahasa Mudah
    const finalModel = computeClusterRobustSE(selectedModel, finalInput);
    const easyInterpretation = generateEasyPanelInterpretation(
      finalModel,
      activeYCol,
      finalActiveXCols,
      alpha,
      lnReport.appliedVars,
      orthogReport.orthogMapping
    );

    const fitResult: PanelFitResult = {
      success: true,
      declaration: decl,
      models: { cem, fem, rem },
      selection,
      selectedModel,
      postOrthogSelectedModel,
      finalModel,
      assumptions: {
        vif,
        centeredVif: vif.centeredVif,
        uncenteredVif: vif.uncenteredVif,
        orthogReport,
        greeneHetero: greene,
        wooldridgeSerial: serial,
        normality,
        clusterBiasWarning: finalModel.clusterBiasWarning
      },
      lnReport,
      activeYCol,
      initialActiveXCols,
      finalActiveXCols,
      easyInterpretation,
      consoleBlocks: []
    };

    // 13 Blok Konsol Stata (Langkah 0 s/d 12)
    const blocks = generateAllPanelConsoleBlocks(finalInput, fitResult);
    fitResult.consoleBlocks = blocks;

    return NextResponse.json({
      success: true,
      data: fitResult
    });
  } catch (err: any) {
    console.error('[Panel Fit Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Terjadi kesalahan pada estimasi regresi data panel.' },
      { status: 500 }
    );
  }
}
