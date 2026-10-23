import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import {
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
  testPanelNormality,
  computeClusterRobustSE
} from '../../src/lib/panel-engine';
import {
  generateAllPanelConsoleBlocks,
  formatStataRegTable,
  formatPanelClipboardSummary
} from '../../src/lib/panel-interpretation';

describe('Penanganan Variabel Time-Invariant (seperti BANTUAN dan SIZE pada data pengguna)', () => {
  const rowsWithTimeInvariant = grunfeldData.map(r => ({
    ...r,
    BANTUAN: r.company * 10, // konstan per company (time-invariant)
    SIZE: Math.log(r.company + 5), // konstan per company (time-invariant)
    'Carbon Disclosure': r.invest // nama kolom dengan spasi
  }));

  const input = {
    rows: rowsWithTimeInvariant,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'Carbon Disclosure',
    xCols: ['BANTUAN', 'mvalue', 'kstock', 'SIZE'],
    alpha: 0.05
  };

  it('1. fitPanelFEM otomatis meng-omit variabel time-invariant tanpa error singular matrix', () => {
    const fem = fitPanelFEM(input);
    expect(fem).toBeDefined();
    expect(fem.coefficients['BANTUAN'].isOmitted).toBe(true);
    expect(fem.coefficients['SIZE'].isOmitted).toBe(true);
    expect(fem.coefficients['mvalue'].isOmitted).toBe(false);
    expect(fem.coefficients['kstock'].isOmitted).toBe(false);
    expect(fem.coefficients['mvalue'].b).toBeCloseTo(0.1101, 3);
    expect(fem.coefficients['kstock'].b).toBeCloseTo(0.3101, 3);
  });

  it('2. Menjalankan seluruh rantai pengujian (Chow, Hausman, Mundlak, BP LM, VIF, Robust SE)', () => {
    const cem = fitPanelCEM(input);
    const fem = fitPanelFEM(input);
    const rem = fitPanelREM(input);

    expect(cem).toBeDefined();
    expect(rem).toBeDefined();

    const chow = testChow(cem, fem);
    expect(chow).toBeDefined();
    expect(chow.preferred).toBe('FEM');

    const hausman = testHausman(fem, rem);
    expect(hausman).toBeDefined();

    const mundlak = testMundlakCRE(input);
    expect(mundlak).toBeDefined();

    const bp = testBreuschPaganLM(input);
    expect(bp).toBeDefined();

    const vif = testPanelVIF(input);
    expect(vif).toBeDefined();

    const serial = testWooldridgeSerial(input);
    expect(serial).toBeDefined();

    const robust = computeClusterRobustSE(rem, input);
    expect(robust).toBeDefined();
  });

  it('3. Menghasilkan format tabel Stata dengan teks (omitted) untuk variabel time-invariant', () => {
    const fem = fitPanelFEM(input);
    const tableStr = formatStataRegTable(fem, input.yCol);
    expect(tableStr).toContain('(omitted)');
  });
});
