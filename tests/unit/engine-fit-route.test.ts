import { describe, it, expect } from 'vitest';
import { POST } from '../../src/app/api/engine/fit/route';
import { NextRequest } from 'next/server';

function createMockRequest(body: any): NextRequest {
  return new NextRequest('http://localhost:3000/api/engine/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/engine/fit Route Handler Tests', () => {
  const sampleRows = [
    { Nilai_Perusahaan: 10.5, Jumlah: 2.1 },
    { Nilai_Perusahaan: 15.2, Jumlah: 3.4 },
    { Nilai_Perusahaan: 20.8, Jumlah: 4.8 },
    { Nilai_Perusahaan: 25.1, Jumlah: 5.9 },
    { Nilai_Perusahaan: 30.6, Jumlah: 7.2 },
    { Nilai_Perusahaan: 35.4, Jumlah: 8.5 }
  ];

  it('mengembalikan status 400 dalam bentuk JSON jika rows kosong', async () => {
    const req = createMockRequest({ rows: [], yCol: 'Nilai_Perusahaan', xCols: ['Jumlah'] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Data baris (rows) wajib disertakan');
  });

  it('mengembalikan status 400 dalam bentuk JSON jika yCol tidak ada', async () => {
    const req = createMockRequest({ rows: sampleRows, xCols: ['Jumlah'] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Variabel dependen yCol wajib disertakan');
  });

  it('mengembalikan status 400 dalam bentuk JSON jika xCols kosong', async () => {
    const req = createMockRequest({ rows: sampleRows, yCol: 'Nilai_Perusahaan', xCols: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Variabel independen xCols minimal 1 kolom');
  });

  it('berhasil mengestimasi regresi dengan parameter camelCase (yCol, xCols)', async () => {
    const req = createMockRequest({
      rows: sampleRows,
      yCol: 'Nilai_Perusahaan',
      xCols: ['Jumlah'],
      alpha: 0.05
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.modelType).toBe('SLR');
    expect(json.data.kPredictors).toBe(1);
    expect(json.data.coefficients.length).toBe(2);
    expect(json.data.modelSummary.rSquared).toBeGreaterThan(0.9);
  });

  it('berhasil mengestimasi regresi dengan parameter snake_case (y_col, x_cols)', async () => {
    const req = createMockRequest({
      rows: sampleRows,
      y_col: 'Nilai_Perusahaan',
      x_cols: ['Jumlah'],
      alpha: 0.05
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.modelType).toBe('SLR');
    expect(json.data.coefficients.length).toBe(2);
  });
});
