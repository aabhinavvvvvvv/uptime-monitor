export interface CheckResult {
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  errorMessage: string | null;
}

export async function checkUrl(
  url: string,
  method: string,
  expectedStatus: number,
  timeoutMs: number,
): Promise<CheckResult> {
  const start = performance.now();

  try {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      success: response.status === expectedStatus,
      statusCode: response.status,
      responseTimeMs: Math.round(performance.now() - start),
      errorMessage: null,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: null,
      responseTimeMs: Math.round(performance.now() - start),
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
