import { describe, it, expect } from 'vitest';
import { POST as handleFit } from '../../src/app/api/panel/fit/route';
import { POST as handleExportDocx } from '../../src/app/api/panel/export-docx/route';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import { NextRequest } from 'next/server';

describe('Panel Data Regression API Routes (Fit & Export DOCX)', () => {
  const payload = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  it('POST /api/panel/fit executes full 13-step Stata panel regression', async () => {
    const req = new NextRequest('http://localhost:3000/api/panel/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await handleFit(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();

    const data = json.data;
    // Model selection
    expect(data.selection.selectedModel).toBe('REM');
    // 13 console blocks
    expect(data.consoleBlocks).toHaveLength(13);
    // Classical assumptions
    expect(data.assumptions.vif.meanVif).toBeCloseTo(1.31, 2);
    expect(data.assumptions.greeneHetero.hasHeteroskedasticity).toBe(true);
    expect(data.assumptions.wooldridgeSerial.hasAutocorrelation).toBe(true);
    // Robust final model
    expect(data.finalModel.isRobust).toBe(true);
    expect(data.finalModel.clusterBiasWarning?.isBiased).toBe(true);
  });

  it('POST /api/panel/fit validates required input parameters (Invariants I1-I6)', async () => {
    // Missing idCol
    const badReq1 = new NextRequest('http://localhost:3000/api/panel/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, idCol: '' })
    });
    const res1 = await handleFit(badReq1);
    expect(res1.status).toBe(400);

    // Empty xCols
    const badReq2 = new NextRequest('http://localhost:3000/api/panel/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, xCols: [] })
    });
    const res2 = await handleFit(badReq2);
    expect(res2.status).toBe(400);
  });

  it('POST /api/panel/export-docx generates valid Word document buffer', async () => {
    // Fit first
    const fitReq = new NextRequest('http://localhost:3000/api/panel/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const fitRes = await handleFit(fitReq);
    const { data: fitData } = await fitRes.json();

    const exportReq = new NextRequest('http://localhost:3000/api/panel/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fitResult: fitData,
        datasetName: 'Grunfeld_1958.xlsx'
      })
    });

    const exportRes = await handleExportDocx(exportReq);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('Content-Type')).toContain('officedocument.wordprocessingml');

    const arrayBuffer = await exportRes.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
  });
});
