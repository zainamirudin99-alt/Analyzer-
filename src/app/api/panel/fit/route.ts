import { NextRequest, NextResponse } from 'next/server';
import {
  validatePanelStructure,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel,
  testPanelVIF,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  computeClusterRobustSE
} from '../../../../lib/panel-engine';
import { generateAllPanelConsoleBlocks } from '../../../../lib/panel-interpretation';
import { PanelFitInput, PanelFitResult } from '../../../../lib/panel-types';

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

    // Validasi struktur panel (xtset)
    const decl = validatePanelStructure(rows, idCol, timeCol);
    if (!decl.isValid) {
      return NextResponse.json(
        { success: false, error: decl.errors.join(' ') },
        { status: 400 }
      );
    }

    const input: PanelFitInput = {
      rows,
      idCol,
      timeCol,
      yCol,
      xCols,
      alpha
    };

    // Estimasi 3 model utama
    const cem = fitPanelCEM(input);
    const fem = fitPanelFEM(input);
    const rem = fitPanelREM(input);

    // Uji Pemilihan Model
    const chow = testChow(cem, fem, alpha);
    const hausman = testHausman(fem, rem, input, alpha);
    const mundlak = testMundlakCRE(input, alpha);
    const bp = testBreuschPaganLM(input, alpha);
    const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp, alpha);

    // Uji Asumsi Klasik Panel
    const vif = testPanelVIF(input);
    const greene = testGroupwiseHeteroGreene(input, fem, alpha);
    const serial = testWooldridgeSerial(input, alpha);

    // Model Terpilih & Koreksi Cluster-Robust
    const selectedModel = selection.selectedModel === 'FEM' ? fem : rem;
    const finalModel = computeClusterRobustSE(selectedModel, input);

    const fitResult: PanelFitResult = {
      success: true,
      declaration: decl,
      models: { cem, fem, rem },
      selection,
      selectedModel,
      finalModel,
      assumptions: {
        vif,
        greeneHetero: greene,
        wooldridgeSerial: serial,
        clusterBiasWarning: finalModel.clusterBiasWarning
      },
      consoleBlocks: []
    };

    // 13 Blok Konsol Stata (Langkah 0 s/d 12)
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
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
