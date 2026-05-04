const BASE_URL = "https://api.open5e.com";
const TIMEOUT_MS = 10_000;

export type ApiError = {
  status: number | "network" | "timeout";
  message: string;
};

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw { status: "timeout", message: `Request to ${path} timed out` } as ApiError;
    }
    throw {
      status: "network",
      message: err instanceof Error ? err.message : String(err),
    } as ApiError;
  }
  if (!response.ok) {
    throw {
      status: response.status,
      message: `${response.status} ${response.statusText}`,
    } as ApiError;
  }
  return (await response.json()) as T;
}
