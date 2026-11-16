import { NextRequest, NextResponse } from 'next/server';
import { executePanelAccuracyPipeline } from '@/lib/panel-accuracy-orchestrator';
import { PanelDataset } from '@/lib/panel-accuracy-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataset: PanelDataset | undefined = body?.dataset;
    const preprocessing = body?.preprocessing || {};

    if (!dataset || !Array.isArray(dataset.observations) || dataset.observations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dataset observasi panel wajib disertakan.' },
        { status: 400 }
      );
    }
    if (!dataset.cityIdColumn || !dataset.yearColumn || !Array.isArray(dataset.sources) || dataset.sources.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Minimal 2 sumber pengukuran (1 Reference + minimal 1 Comparison) serta kolom City dan Year wajib terpetakan.' },
        { status: 400 }
      );
    }

    const result = executePanelAccuracyPipeline({
      dataset,
      preprocessing
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menjalankan analisis komparasi akurasi panel.' },
      { status: 400 }
    );
  }
}
