import dayjs from "dayjs";
import type {
  AssetDTO,
  CreateLinkRequest,
  LinkDTO,
  LinkRules,
  UpdateLinkRulesRequest,
} from "../services/api/types";

export interface LinkWindowForm {
  activeFrom: string;
  activeUntil: string;
}

export interface LinkWindowValues {
  activeFrom?: string | null;
  activeUntil?: string | null;
  expiresAt?: string | null;
}

export function localWindowTime(value?: string | null): string {
  if (!value) return "";
  const date = dayjs(value);
  return date.format(date.second() ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DDTHH:mm");
}

function parseLocalWindowTime(value: string, label: string): string | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  const date = new Date(value);
  if (!parts || !Number.isFinite(date.getTime()) || Number(parts[1]) < 1 ||
    date.getFullYear() !== Number(parts[1]) || date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) || date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5]) || date.getSeconds() !== Number(parts[6] || 0) ||
    date.getMilliseconds() !== Number((parts[7] || "").padEnd(3, "0"))) {
    throw new Error(`${label}无效，请输入有效的本地日期时间`);
  }
  return date.toISOString();
}

function windowInstant(value?: string | null): bigint | null {
  if (!value) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error("时间配置无效，请重新设置日期时间");
  // Date preserves milliseconds only. Compare the remaining PostgreSQL microseconds too.
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i.exec(value)?.[1] || "";
  return BigInt(millis) * 1_000n + BigInt(fraction.padEnd(6, "0").slice(3, 6));
}

export function hasWindowEnded(value?: string | null, now = Date.now()): boolean {
  const cutoff = windowInstant(value);
  return cutoff !== null && cutoff <= BigInt(now) * 1_000n;
}

export function validateLinkWindow(values: LinkWindowValues): void {
  const start = windowInstant(values.activeFrom);
  const end = windowInstant(values.activeUntil);
  const expiration = windowInstant(values.expiresAt);
  if (start !== null && end !== null && start >= end) {
    throw new Error("开放开始时间必须早于开放结束时间");
  }
  if (start !== null && expiration !== null && start >= expiration) {
    throw new Error("开放开始时间必须早于短链到期时间（实际截止取到期与开放结束的较早者）");
  }
}

export function buildCreateWindow(
  form: LinkWindowForm,
  expiresAt: string | null,
  source?: LinkWindowValues | null,
  now = Date.now(),
): { activeFrom: string | null; activeUntil: string | null } {
  const read = (key: keyof LinkWindowForm, label: string) =>
    source && form[key] === localWindowTime(source[key])
      ? source[key] || null
      : parseLocalWindowTime(form[key], label);
  const window = { activeFrom: read("activeFrom", "开放开始时间"), activeUntil: read("activeUntil", "开放结束时间") };
  validateLinkWindow({ ...window, expiresAt });
  if (hasWindowEnded(window.activeUntil, now)) {
    throw new Error("开放结束时间必须晚于当前时间；复制已结束窗口后请明确修改或清除开放结束时间");
  }
  return window;
}

// Unchanged values stay omitted, including historical times and sub-millisecond precision.
// Clearing an existing boundary sends null; a new local time is serialized in UTC.
export function buildWindowPatch(
  source: LinkWindowValues,
  form: LinkWindowForm,
  expiresAt = source.expiresAt,
  now = Date.now(),
): Pick<UpdateLinkRulesRequest, "activeFrom" | "activeUntil"> {
  const patch: Pick<UpdateLinkRulesRequest, "activeFrom" | "activeUntil"> = {};
  for (const key of ["activeFrom", "activeUntil"] as const) {
    if (form[key] === localWindowTime(source[key])) continue;
    const value = parseLocalWindowTime(form[key], key === "activeFrom" ? "开放开始时间" : "开放结束时间");
    if (key === "activeUntil" && value && !(Date.parse(value) > now)) {
      throw new Error("新的开放结束时间必须晚于当前时间，留空表示清除结束限制");
    }
    patch[key] = value;
  }
  if (Object.keys(patch).length || expiresAt !== source.expiresAt) {
    validateLinkWindow({
      activeFrom: patch.activeFrom === undefined ? source.activeFrom : patch.activeFrom,
      activeUntil: patch.activeUntil === undefined ? source.activeUntil : patch.activeUntil,
      expiresAt,
    });
  }
  return patch;
}

export interface CreateLinkForm extends LinkWindowForm {
  sourceActiveFrom: string | null;
  sourceActiveUntil: string | null;
  title: string;
  tags: string[];
  groupId: string | null;
  tagInput: string;
  targetType: "url" | "minio_asset";
  targetUrl: string;
  assetId: string;
  codeMode: "generated" | "custom";
  customCode: string;
  ruleSource: "inline" | "template";
  expireHours: string;
  expirationMode: "hours" | "source";
  sourceExpiresAt: string | null;
  maxVisits: string;
  requirePassword: boolean;
  password: string;
  cooldownStrategy: "fixed_cooldown" | "progressive_cooldown";
  allowedIps: string;
  templateId: string;
  templateMode: "latest" | "version";
  templateVersion: string;
}

export function initialCreateForm(input: {
  source?: LinkDTO | null;
  presetUrl?: string;
  presetAsset?: AssetDTO | null;
} = {}): CreateLinkForm {
  const source = input.source;
  const sourceExpiresAt = source?.expiresAt || null;
  const expired = !!sourceExpiresAt && !(Date.parse(sourceExpiresAt) > Date.now());
  return {
    title: source?.title || "",
    tags: [...(source?.tags || [])],
    groupId: source?.groupId ?? null,
    tagInput: "",
    targetType: source?.target.type || (input.presetAsset ? "minio_asset" : "url"),
    targetUrl: source?.target.url || input.presetUrl || "",
    assetId: source?.target.assetId || input.presetAsset?.assetId || "",
    codeMode: "generated",
    customCode: "",
    ruleSource: "inline",
    expireHours: expired ? "" : "168",
    expirationMode: source && !expired ? "source" : "hours",
    sourceExpiresAt,
    activeFrom: localWindowTime(source?.activeFrom),
    activeUntil: localWindowTime(source?.activeUntil),
    sourceActiveFrom: source?.activeFrom || null,
    sourceActiveUntil: source?.activeUntil || null,
    maxVisits: source ? String(source.rules.maxVisits) : "",
    requirePassword: source?.rules.requirePassword || false,
    password: "",
    cooldownStrategy: source?.rules.wrongPasswordPolicy?.strategy || "progressive_cooldown",
    allowedIps: (source?.rules.allowedIpCidrs || []).join(", "),
    templateId: "",
    templateMode: "latest",
    templateVersion: "1",
  };
}

export function linkMetadata(title: string, tags: string[], draft = ""): { title: string; tags: string[] } {
  const normalizedTitle = title.trim();
  if ([...normalizedTitle].length > 120) throw new Error("标题不能超过 120 个字符");
  const values = [...tags, ...(draft.trim() ? [draft] : [])];
  if (values.length > 20) throw new Error("每条短链最多添加 20 个标签");
  const seen = new Set<string>();
  const normalizedTags: string[] = [];
  for (const value of values) {
    const tag = value.trim();
    if (!tag) continue;
    if ([...tag].length > 32) throw new Error("每个标签不能超过 32 个字符");
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalizedTags.push(tag);
    }
  }
  return { title: normalizedTitle, tags: normalizedTags };
}

export function isHttpsUrl(value: string): boolean {
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed);
    return /^https:\/\//i.test(trimmed) && !/\s/.test(trimmed) && url.protocol === "https:" && !!url.hostname;
  } catch {
    return false;
  }
}

export function safeInteger(value: string, min: number, label: string): number {
  if (!/^-?\d+$/.test(value.trim())) throw new Error(`${label}必须是整数`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) throw new Error(`${label}超出有效安全整数范围`);
  return number;
}

export function validatedCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{4,64}$/.test(code)) throw new Error("短码须为 4–64 位字母、数字或连字符");
  return code;
}

export function expirationAfterHours(value: string, base = Date.now()): string {
  const hours = safeInteger(value, 1, "有效期小时数");
  const date = new Date(base + hours * 3_600_000);
  if (!Number.isSafeInteger(date.getTime())) throw new Error("有效期超出支持的日期范围");
  return date.toISOString();
}

export function buildCreateLinkRequest(form: CreateLinkForm, templateRules?: LinkRules | null): CreateLinkRequest {
  const metadata = linkMetadata(form.title, form.tags, form.tagInput);
  if (form.targetType === "url" && !isHttpsUrl(form.targetUrl)) throw new Error("请输入有效的 HTTPS 目标 URL");
  if (form.targetType === "minio_asset" && !form.assetId.trim()) throw new Error("请选择要挂载的私有素材");
  const code = form.codeMode === "custom" ? validatedCode(form.customCode) : undefined;
  let expiresAt: string | null;
  if (form.expirationMode === "source") {
    expiresAt = form.sourceExpiresAt;
    if (expiresAt && !(Date.parse(expiresAt) > Date.now())) throw new Error("原期限已过期，请选择新的有效期");
  } else {
    const hours = safeInteger(form.expireHours, 0, "有效期小时数");
    expiresAt = hours === 0 ? null : expirationAfterHours(form.expireHours);
  }
  const window = buildCreateWindow(form, expiresAt, {
    activeFrom: form.sourceActiveFrom,
    activeUntil: form.sourceActiveUntil,
    expiresAt: form.sourceExpiresAt,
  });
  if (form.ruleSource === "template" && (!form.templateId || !templateRules)) {
    throw new Error("请先选择并成功加载模板版本规则");
  }
  const requirePassword = form.ruleSource === "template" ? templateRules!.requirePassword : form.requirePassword;
  if (requirePassword && !form.password.trim()) throw new Error("该规则需要访问口令，请设置新口令");
  if (requirePassword && new TextEncoder().encode(form.password).length > 1024) throw new Error("访问口令不能超过 1024 字节");
  let version: number | undefined;
  if (form.ruleSource === "template" && form.templateMode === "version") {
    version = safeInteger(form.templateVersion, 1, "模板版本");
    if (version > 2_147_483_647) throw new Error("模板版本超出有效范围");
  }
  return {
    ...metadata,
    groupId: form.groupId,
    code,
    target: form.targetType === "url"
      ? { type: "url", url: form.targetUrl.trim() }
      : { type: "minio_asset", assetId: form.assetId.trim() },
    expiresAt,
    ...window,
    accessPassword: requirePassword ? form.password : undefined,
    ruleSource: form.ruleSource === "template"
      ? { type: "template", template: { templateId: form.templateId, version } }
      : {
          type: "inline",
          rules: {
            maxVisits: form.maxVisits.trim() ? safeInteger(form.maxVisits, -1, "访问上限") : -1,
            allowedIpCidrs: form.allowedIps.split(",").map((s) => s.trim()).filter(Boolean),
            requirePassword,
            wrongPasswordPolicy: requirePassword ? { strategy: form.cooldownStrategy } : undefined,
          },
        },
  };
}

export function randomAccessPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const limit = Math.floor(256 / chars.length) * chars.length;
  let password = "BURN-";
  while (password.length < 17) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && password.length < 17) password += chars[byte % chars.length];
    }
  }
  return password;
}
