import { NextRequest, NextResponse } from 'next/server';
import { executePanelLatentPipeline } from '@/lib/panel-latent-orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const mapping = body?.mapping;
    const preprocessing = body?.preprocessing || {};
    const spec = body?.spec || {};

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dataset baris (rows) wajib disertakan.' },
        { status: 400 }
      );
    }
    if (!mapping || !mapping.cityCol || !mapping.yearCol || !mapping.x1Col || !mapping.x2Col || !mapping.x3Col) {
      return NextResponse.json(
        { success: false, error: 'Pemetaan kolom City, Year, X1, X2, dan X3 wajib lengkap.' },
        { status: 400 }
      );
    }

    const result = executePanelLatentPipeline({
      rows,
      mapping,
      preprocessing,
      spec
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menjalankan estimasi Bayesian Panel Latent.' },
      { status: 400 }
    );
  }
}

