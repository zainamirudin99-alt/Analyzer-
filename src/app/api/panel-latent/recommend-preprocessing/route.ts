import { NextRequest, NextResponse } from 'next/server';
import { evaluatePreprocessingCandidates } from '@/lib/panel-latent-recommender';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const mapping = body?.mapping;
    const baseSpec = body?.spec || {};
    const allowNegativeValues = Boolean(body?.allowNegativeValues);

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

    const data = evaluatePreprocessingCandidates({
      rows,
      mapping,
      baseSpec,
      allowNegativeValues
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal mengevaluasi kombinasi prapemrosesan.' },
      { status: 400 }
    );
  }
}

