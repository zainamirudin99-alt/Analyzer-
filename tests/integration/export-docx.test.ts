import { describe, it, expect } from "vitest";
import { generateRegressionDocx } from "../../src/lib/regression-docx-builder";
import { runRegressionEngine } from "../../src/lib/regression-engine";
import { DATASET_SLR_N20 } from "../fixtures/synthetic-datasets";

describe("Word Export (.docx) Generator Integration Tests", () => {
  it("generates a valid binary .docx buffer with correct OOXML signature", async () => {
    const ds = DATASET_SLR_N20;
    const res = runRegressionEngine({
      data: ds.data,
      yCol: ds.yCol,
      xCols: ds.xCols,
      alpha: 0.05,
    });

    const docxBuffer = await generateRegressionDocx({
      result: res,
      datasetName: "Synthetic_SLR_N20.xlsx",
      sheetName: "Sheet1",
      alpha: 0.05,
      seed: 12345,
      statusLabel: "Konfirmatori",
      kTried: 1,
      modelsHistory: [
        {
          id: "M0",
          title: "Model Awal (M0)",
          type: "baseline",
          result: res,
          label: "Konfirmatori",
        },
      ],
    });

    expect(docxBuffer).toBeDefined();
    expect(docxBuffer.length).toBeGreaterThan(1000);

    // Verify ZIP / OOXML magic bytes: PK\x03\x04 (0x50, 0x4b, 0x03, 0x04)
    expect(docxBuffer[0]).toBe(0x50);
    expect(docxBuffer[1]).toBe(0x4b);
    expect(docxBuffer[2]).toBe(0x03);
    expect(docxBuffer[3]).toBe(0x04);
  });

  it("handles POST request in route handler and returns binary attachment", async () => {
    const { POST } = await import("../../src/app/api/regression/export-docx/route");
    const ds = DATASET_SLR_N20;
    const res = runRegressionEngine({
      data: ds.data,
      yCol: ds.yCol,
      xCols: ds.xCols,
      alpha: 0.05,
    });

    const mockReq = {
      json: async () => ({
        result: res,
        datasetName: "Synthetic_SLR_N20.xlsx",
        sheetName: "Sheet1",
        alpha: 0.05,
      }),
    } as any;

    const response = await POST(mockReq);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(response.headers.get("content-disposition")).toContain("attachment; filename=");

    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
