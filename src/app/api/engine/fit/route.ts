import { NextRequest, NextResponse } from 'next/server';
import { runStatisticalRegression, OLSFitInput } from '../../../../lib/regression-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows || [];
    const yCol = body.yCol || body.y_col;
    const xCols = body.xCols || body.x_cols || [];
    const isTimeSeries = Boolean(body.isTimeSeries ?? body.is_time_series);
    const timeCol = body.timeCol || body.time_col;
    const frequency = body.frequency;
    const alpha = body.alpha ? Number(body.alpha) : 0.05;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Data baris (rows) wajib disertakan.' },
        { status: 400 }
      );
    }
    if (!yCol) {
      return NextResponse.json(
        { success: false, error: 'Variabel dependen yCol wajib disertakan.' },
        { status: 400 }
      );
    }
    if (!xCols || xCols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Variabel independen xCols minimal 1 kolom.' },
        { status: 400 }
      );
    }

    // Eksekusi estimasi regresi OLS & diagnostik asumsi
    const result = runStatisticalRegression({
      rows,
      yCol,
      xCols,
      isTimeSeries: Boolean(isTimeSeries),
      timeCol,
      frequency,
      alpha: alpha ? Number(alpha) : 0.05
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[Engine Fit Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Terjadi kesalahan saat mengeksekusi estimasi OLS.' },
      { status: 500 }
    );
  }
}
