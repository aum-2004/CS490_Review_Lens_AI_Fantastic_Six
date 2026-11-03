/** @jest-environment node */

import { GET } from "@/app/api/health/route";

jest.mock("next/server", () => ({
  connection: jest.fn().mockResolvedValue(undefined),
}));

describe("GET /api/health", () => {
  it("returns the healthy API response contract", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { status: "ok" },
    });
  });
});
