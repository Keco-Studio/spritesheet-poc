const BASE_URL = "https://api.pixellab.ai/v2";

export class PixelLabError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
  }
}

export type PixelLabClient = {
  post: <T>(path: string, body: unknown) => Promise<T>;
  get: <T>(path: string) => Promise<T>;
};

export function createClient(apiKey: string): PixelLabClient {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new PixelLabError(
        `PixelLab ${method} ${path} → ${res.status}`,
        res.status,
        text,
      );
    }
    return res.json() as Promise<T>;
  }

  return {
    post: (path, body) => request("POST", path, body),
    get: (path) => request("GET", path),
  };
}
