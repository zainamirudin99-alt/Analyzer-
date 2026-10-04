import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    status: 'healthy',
    service: 'regression-statistical-engine-bridge',
    version: '1.0.0',
    capabilities: [
      'file-signature-validation',
      'google-sheets-ssrf-safe-import',
      'sample-size-green-1991',
      'y-continuous-numeric-invariant',
      'matrix-rank-deficiency-detection',
      'time-series-gap-and-duplicate-audit'
    ],
    timestamp: new Date().toISOString()
  });
}
