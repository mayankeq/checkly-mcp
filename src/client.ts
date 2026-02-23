const BASE_URL = "https://api.checklyhq.com";

export interface ChecklyConfig {
  apiKey: string;
  accountId: string;
  readOnly: boolean;
}

export function getConfig(): ChecklyConfig {
  const apiKey = process.env.CHECKLY_API_KEY;
  const accountId = process.env.CHECKLY_ACCOUNT_ID;

  if (!apiKey) throw new Error("CHECKLY_API_KEY env var required");
  if (!accountId) throw new Error("CHECKLY_ACCOUNT_ID env var required");

  return {
    apiKey,
    accountId,
    readOnly: process.env.CHECKLY_READ_ONLY !== "false",
  };
}

async function request<T>(
  config: ChecklyConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "x-checkly-account": config.accountId,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Checkly API ${method} ${path} → ${res.status}: ${text}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(config: ChecklyConfig, path: string) =>
    request<T>(config, "GET", path),
  post: <T>(config: ChecklyConfig, path: string, body?: unknown) =>
    request<T>(config, "POST", path, body),
  put: <T>(config: ChecklyConfig, path: string, body: unknown) =>
    request<T>(config, "PUT", path, body),
};
