import type { PixelLabClient } from "./client.js";
import { PixelLabError } from "./client.js";

type JobResponse = {
  status: "processing" | "completed" | "failed";
  error?: string;
  last_response?: {
    images?: Array<{ type: "base64"; base64: string }>;
    [key: string]: unknown;
  };
};

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForJob(
  client: PixelLabClient,
  jobId: string,
): Promise<JobResponse> {
  const start = Date.now();
  while (true) {
    const job = await client.get<JobResponse>(`/background-jobs/${jobId}`);
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new PixelLabError(`job ${jobId} failed: ${job.error ?? "unknown"}`);
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new PixelLabError(`job ${jobId} timed out after ${TIMEOUT_MS}ms`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
