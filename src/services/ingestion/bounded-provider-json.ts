import "server-only";
import { MAX_PROVIDER_RESULT_BYTES, IngestionLimitError } from "./ingestion-limits";

/** Never buffer an unbounded response, even when Content-Length is absent or false. */
export async function readBoundedProviderJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_PROVIDER_RESULT_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new IngestionLimitError("INGESTION_RESULT_LIMIT");
  }
  if (!response.body) throw new SyntaxError("Missing provider response body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROVIDER_RESULT_BYTES) {
        await reader.cancel().catch(() => {});
        throw new IngestionLimitError("INGESTION_RESULT_LIMIT");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
