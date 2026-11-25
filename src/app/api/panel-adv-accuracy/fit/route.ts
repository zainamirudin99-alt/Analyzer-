import { NextRequest, NextResponse } from 'next/server';
import { executeAdvancedPanelAccuracyPipeline } from '@/lib/panel-adv-orchestrator';
import { AdvManualOverrides, PanelDataset } from '@/lib/panel-adv-types';
import { evaluateOption2VsOption3Methodology } from '@/lib/panel-methodology-comparison';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataset: PanelDataset | undefined = body?.dataset;
    const mode: 'option3' | 'compare_2_and_3' =
      body?.mode === 'compare_2_and_3' ? 'compare_2_and_3' : 'option3';
    const datasetName = String(body?.datasetName || 'Panel_MultiSource_Dataset.xlsx');
    const overrides: AdvManualOverrides | undefined = body?.overrides;

    if (!dataset || !Array.isArray(dataset.observations) || dataset.observations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dataset observasi panel wajib disertakan.' },
        { status: 400 }
      );
    }
    if (
      !dataset.cityIdColumn ||
      !dataset.yearColumn ||
      !Array.isArray(dataset.sources) ||
      dataset.sources.length < 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Minimal 2 kolom sumber pengukuran (disarankan >= 3 untuk identifikasi penuh model laten tanpa referensi) serta kolom Entitas dan Waktu wajib terpetakan.'
        },
        { status: 400 }
      );
    }

    const highPrecision = body?.highPrecisionMode !== undefined ? Boolean(body.highPrecisionMode) : true;
    const mcRepsRaw = Number(body?.monteCarloReplications);
    const monteCarloReplications = Number.isFinite(mcRepsRaw)
      ? Math.max(15, Math.min(120, Math.round(mcRepsRaw)))
      : highPrecision
        ? 50
        : 28;

    if (mode === 'compare_2_and_3') {
      const compBundle = evaluateOption2VsOption3Methodology({
        dataset,
        datasetName,
        option3Overrides: overrides,
        highPrecision
      });
      return NextResponse.json({
        success: true,
        mode: 'compare_2_and_3',
        data: compBundle
      });
    }

    const result = executeAdvancedPanelAccuracyPipeline({
      dataset,
      datasetName,
      overrides,
      highPrecisionMode: highPrecision,
      monteCarloReplications,
      executionMode: 'server_high_precision'
    });

    return NextResponse.json({
      success: true,
      mode: 'option3',
      data: result
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Gagal menjalankan analisis Option 3.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
