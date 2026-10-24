import dayjs from "dayjs";

export const DECIMAL_MB = 1_000_000;
const SERVER_URL_KEY = "stub_app_server_url";

export function formatMB(bytes?: number | null, digits = 1): string {
  if (bytes === undefined || bytes === null) return "—";
  const mb = bytes / DECIMAL_MB;
  if (mb > 0 && mb < 0.1) return `${mb.toFixed(2)} MB`;
  return `${mb.toFixed(digits)} MB`;
}

export const formatBytes = formatMB;

export function bytesToMB(bytes?: number | null): number {
  if (!bytes) return 0;
  return Math.round((bytes / DECIMAL_MB) * 100) / 100;
}

export function mbToBytes(mb: number): number {
  return Math.round(mb * DECIMAL_MB);
}

export function formatDateTime(iso?: string | null, pattern = "MM-DD HH:mm"): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  return d.isValid() ? d.format(pattern) : iso;
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  if (!d.isValid()) return iso;
  const diffMin = d.diff(dayjs(), "minute");
  const absMin = Math.abs(diffMin);
  if (absMin < 1) return "刚刚";
  if (absMin < 60) return diffMin > 0 ? `${absMin}分钟后` : `${absMin}分钟前`;
  const absHour = Math.round(absMin / 60);
  if (absHour < 48) return diffMin > 0 ? `${absHour}小时后` : `${absHour}小时前`;
  const absDay = Math.round(absHour / 24);
  return diffMin > 0 ? `${absDay}天后` : `${absDay}天前`;
}

export function formatReasonLabel(reason?: string | null): string {
  if (!reason) return "正常放行";
  const map: Record<string, string> = {
    allowed: "正常放行",
    expired: "已过期拦截",
    disabled: "已停用拦截",
    visit_limit_reached: "次数耗尽拦截",
    password_required: "要求输入口令",
    wrong_password: "口令错误",
    password_cooldown: "口令输错冷却中",
    ip_denied: "IP 白名单拦截",
    asset_deleted: "素材已移入回收站",
    template_disabled: "规则模板已停用",
  };
  return map[reason] || reason;
}

export function getServerBaseURL(): string {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(SERVER_URL_KEY) : null;
  if (stored && stored.trim()) {
    return stored.trim().replace(/\/+$/, "");
  }
  const envUrl = import.meta.env.VITE_PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (
    typeof window !== "undefined" &&
    window.location.origin.startsWith("http") &&
    !window.location.origin.includes("localhost")
  ) {
    return window.location.origin;
  }
  return "https://stubapi.mikasa.wiki";
}

export function setServerBaseURL(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  if (!clean) {
    localStorage.removeItem(SERVER_URL_KEY);
  } else {
    localStorage.setItem(SERVER_URL_KEY, clean);
  }
}

export function buildPublicShortUrl(code: string, serverUrl?: string): string {
  if (serverUrl && /^https?:\/\//i.test(serverUrl)) {
    return serverUrl;
  }
  return `${getServerBaseURL()}/r/${code}`;
}
