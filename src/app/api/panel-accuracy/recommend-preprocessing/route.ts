import { NextRequest, NextResponse } from 'next/server';
import { evaluateAccuracyPreprocessingRecommendations } from '@/lib/panel-accuracy-orchestrator';
import { PanelDataset } from '@/lib/panel-accuracy-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataset: PanelDataset | undefined = body?.dataset;
    const allowNegativeValues = Boolean(body?.allowNegativeValues);

    if (!dataset || !Array.isArray(dataset.observations) || dataset.observations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dataset observasi panel wajib disertakan.' },
        { status: 400 }
      );
    }

    const data = evaluateAccuracyPreprocessingRecommendations({
      dataset,
      allowNegativeValues
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal mengevaluasi skenario prapemrosesan.' },
      { status: 400 }
    );
  }
}
