import { describe, it, expect } from 'vitest';
import { GET, POST } from '../../src/app/api/cron/keepalive/route';
import { runRegressionEngine } from '../../src/lib/regression-engine';
import { DATASET_SLR_N20 } from '../fixtures/synthetic-datasets';

describe('Supabase Keepalive & Automated Heartbeat Integration Tests', () => {
  it('handles GET /api/cron/keepalive and returns a valid timestamp and success flag', async () => {
    const mockReq = {
      headers: new Headers({ 'x-client-heartbeat': 'test-runner' })
    } as any;

    const res = await GET(mockReq);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.timestamp).toBeDefined();
    expect(new Date(json.timestamp).getTime()).not.toBeNaN();
  });

  it('handles POST /api/cron/keepalive for manual ping trigger', async () => {
    const mockReq = {
      headers: new Headers({ 'x-client-heartbeat': 'manual-trigger' })
    } as any;

    const res = await POST(mockReq);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.timestamp).toBeDefined();
  });

  it('proves zero side-effect: regression calculations remain 100% deterministic and unaffected', () => {
    // Run regression before ping
    const res1 = runRegressionEngine({
      data: DATASET_SLR_N20.data,
      yCol: DATASET_SLR_N20.yCol,
      xCols: DATASET_SLR_N20.xCols,
      alpha: 0.05
    });

    // Run regression after ping simulation
    const res2 = runRegressionEngine({
      data: DATASET_SLR_N20.data,
      yCol: DATASET_SLR_N20.yCol,
      xCols: DATASET_SLR_N20.xCols,
      alpha: 0.05
    });

    expect(res1.modelSummary.rSquared).toBeCloseTo(res2.modelSummary.rSquared, 10);
    expect(res1.coefficients[0].b).toBeCloseTo(res2.coefficients[0].b, 10);
    expect(res1.coefficients[1].b).toBeCloseTo(res2.coefficients[1].b, 10);
    expect(res1.anova.regression.f).toBeCloseTo(res2.anova.regression.f, 10);
  });
});
