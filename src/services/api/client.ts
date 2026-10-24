import { Capacitor } from "@capacitor/core";
import { getServerBaseURL } from "@/lib/format";
import type { APIErrorPayload } from "./types";

const TOKEN_STORAGE_KEY = "stub_app_access_token";
export const CLIENT_APP_ID = "shortlink_app";

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function resolveApiUrl(path: string, query?: Record<string, string | number | boolean | undefined | null>): string {
  const customServer = localStorage.getItem("stub_app_server_url");
  const isNative = Capacitor.isNativePlatform();
  const basePrefix = isNative || customServer ? `${getServerBaseURL()}/api/v1` : "/api/v1";

  let url = `${basePrefix}${path}`;
  if (query) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        search.set(k, String(v));
      }
    });
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

export async function request<T>(
  path: string,
  options: RequestInit & {
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {},
): Promise<T> {
  const { query, headers: customHeaders, body, ...rest } = options;
  const url = resolveApiUrl(path, query);

  const headers = new Headers(customHeaders);
  headers.set("X-Client-App", CLIENT_APP_ID);

  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...rest,
    headers,
    body,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const errPayload = data as APIErrorPayload | null;
    const code = errPayload?.error?.code || `http_${res.status}`;
    const msg = errPayload?.error?.message || `请求失败 (${res.status})`;
    const reqId = errPayload?.error?.requestId;

    if (res.status === 401 && path !== "/auth/login") {
      setStoredToken(null);
      window.dispatchEvent(new CustomEvent("stub:unauthorized", { detail: msg }));
    }

    throw new ApiError(res.status, code, msg, reqId);
  }

  return data as T;
}
