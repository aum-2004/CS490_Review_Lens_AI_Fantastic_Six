/** @jest-environment node */
import { getOutscraperResult } from "@/services/ingestion/outscraper-client";
import { readBoundedProviderJson } from "@/services/ingestion/bounded-provider-json";
import {
  assertIngestionResultWithinLimits,
  MAX_PROVIDER_RESULT_BYTES,
} from "@/services/ingestion/ingestion-limits";
import { createIngestionAttemptWriter } from "@/services/ingestion/ingestion-attempt-repository";

it("cancels an oversized result stream without trusting Content-Length or parsing it", async () => {
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel,
  });
  await expect(
    readBoundedProviderJson(new Response(stream, { headers: { "content-length": "1" } })),
  ).rejects.toMatchObject({ code: "INGESTION_RESULT_LIMIT" });
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("rejects a declared oversized body without reading it", async () => {
  const cancel = jest.fn();
  const stream = new ReadableStream({ cancel });
  await expect(
    readBoundedProviderJson(
      new Response(stream, {
        headers: { "content-length": String(MAX_PROVIDER_RESULT_BYTES + 1) },
      }),
    ),
  ).rejects.toMatchObject({ code: "INGESTION_RESULT_LIMIT" });
  expect(cancel).toHaveBeenCalled();
});
it("reads valid bounded JSON and rejects malformed JSON", async () => {
  await expect(readBoundedProviderJson(new Response('{"status":"Pending"}'))).resolves.toEqual({
    status: "Pending",
  });
  await expect(readBoundedProviderJson(new Response("not json"))).rejects.toBeInstanceOf(
    SyntaxError,
  );
});

it.each(["count", "bytes", "text", "metadata", "identity"])(
  "bounds normalized %s before persistence",
  (limit) => {
    let rows: Record<string, unknown>[] = [{ text: "valid", rating: 4 }];
    const identity = { businessName: "Synthetic" };
    if (limit === "count") rows = Array.from({ length: 31 }, () => ({ text: "valid", rating: 4 }));
    if (limit === "bytes") rows[0].ignored = "x".repeat(MAX_PROVIDER_RESULT_BYTES + 1);
    if (limit === "text") rows[0].text = "x".repeat(10001);
    if (limit === "metadata") rows[0].source_metadata = { note: "x".repeat(16385) };
    if (limit === "identity") identity.businessName = "x".repeat(201);
    expect(() => assertIngestionResultWithinLimits(rows, identity)).toThrow(
      expect.objectContaining({ code: "INGESTION_RESULT_LIMIT" }),
    );
  },
);
it("permits the supported 30-review batch at the review text boundary", () => {
  expect(() =>
    assertIngestionResultWithinLimits(
      Array.from({ length: 30 }, () => ({ text: "x".repeat(10000), rating: 4 })),
      { businessName: "Synthetic" },
    ),
  ).not.toThrow();
});

it.each(["flat", "nested"])(
  "cleans NULs from the verified %s business identity and bounds review counts",
  async (shape) => {
    const previous = process.env.OUTSCRAPER_API_KEY;
    process.env.OUTSCRAPER_API_KEY = "synthetic-test-key";
    try {
      const reviews = [
        { name: "Ca\u0000fe", place_id: "ChIJSynthetic", review_text: "valid", review_rating: 4 },
      ];
      const data =
        shape === "flat"
          ? reviews
          : [{ name: "Ca\u0000fe", place_id: "ChIJSynthetic", reviews_data: reviews }];
      const result = await getOutscraperResult(
        "synthetic-job",
        "ChIJSynthetic",
        async () => new Response(JSON.stringify({ status: "Success", data })),
      );
      expect(result).toMatchObject({
        status: "completed",
        businessName: "Cafe",
        identity: { businessName: "Cafe" },
      });
      const oversized = Array.from({ length: 31 }, () => reviews[0]);
      const oversizedData =
        shape === "flat"
          ? oversized
          : [{ name: "Cafe", place_id: "ChIJSynthetic", reviews_data: oversized }];
      await expect(
        getOutscraperResult(
          "synthetic-job",
          "ChIJSynthetic",
          async () => new Response(JSON.stringify({ status: "Success", data: oversizedData })),
        ),
      ).rejects.toMatchObject({ code: "INGESTION_RESULT_LIMIT" });
    } finally {
      if (previous === undefined) delete process.env.OUTSCRAPER_API_KEY;
      else process.env.OUTSCRAPER_API_KEY = previous;
    }
  },
);
it("maps only the known database start-cap code to safe feedback", async () => {
  const rpc = jest
    .fn()
    .mockResolvedValue({ data: null, error: { code: "P0001", message: "INGESTION_START_LIMIT" } });
  const writer = createIngestionAttemptWriter({ rpc } as never);
  await expect(writer.reserve("target", "owner")).rejects.toMatchObject({
    code: "INGESTION_START_LIMIT",
  });
  rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "private SQL detail" } });
  await expect(writer.reserve("target", "owner")).rejects.not.toMatchObject({
    message: "private SQL detail",
  });
});
