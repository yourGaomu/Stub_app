import { useEffect, useState } from "react";
import { App } from "antd";
import { Flame, Package, Globe, Sparkles } from "lucide-react";
import { assetsApi, linksApi, templatesApi } from "../services/api";
import type {
  AssetDTO,
  CreateLinkRequest,
  LinkDTO,
  TemplateListItem,
} from "../services/api/types";
import { buildPublicShortUrl } from "../lib/format";
import { useCopy } from "../hooks/use-copy";
import { BottomSheet, MobileQRModal } from "./bottom-sheet";

export function MobileCreateSheet({
  open,
  onClose,
  onCreated,
  presetUrl,
  presetAsset,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (link: LinkDTO) => void;
  presetUrl?: string;
  presetAsset?: AssetDTO | null;
}) {
  const { message } = App.useApp();
  const copy = useCopy();

  const [targetType, setTargetType] = useState<"url" | "minio_asset">("url");
  const [targetUrl, setTargetUrl] = useState("");
  const [assetId, setAssetId] = useState("");
  const [codeMode, setCodeMode] = useState<"generated" | "custom">("generated");
  const [customCode, setCustomCode] = useState("");

  const [ruleSource, setRuleSource] = useState<"inline" | "template">("inline");
  const [expireHours, setExpireHours] = useState<string>("168");
  const [maxVisits, setMaxVisits] = useState<string>("");
  const [password, setPassword] = useState("");
  const [cooldownStrategy, setCooldownStrategy] = useState<
    "fixed_cooldown" | "progressive_cooldown"
  >("progressive_cooldown");
  const [allowedIps, setAllowedIps] = useState("");

  const [templateId, setTemplateId] = useState("");
  const [templateMode, setTemplateMode] = useState<"latest" | "version">("latest");
  const [templateVersion, setTemplateVersion] = useState<number>(1);

  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<LinkDTO | null>(null);

  useEffect(() => {
    if (!open) return;
    if (presetAsset) {
      setTargetType("minio_asset");
      setAssetId(presetAsset.assetId);
    } else if (presetUrl) {
      setTargetType("url");
      setTargetUrl(presetUrl);
    }
    assetsApi
      .list({ includeDeleted: false })
      .then((res) => setAssets(res.items || []))
      .catch(() => {});
    templatesApi
      .list({ includeDeleted: false })
      .then((res) => setTemplates((res.items || []).filter((t) => t.status === "active")))
      .catch(() => {});
  }, [open, presetUrl, presetAsset]);

  const applyPreset = (type: "burn" | "client" | "public") => {
    setRuleSource("inline");
    if (type === "burn") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let pass = "BURN-";
      for (let i = 0; i < 4; i++) {
        pass += chars[Math.floor(Math.random() * chars.length)];
      }
      setMaxVisits("1");
      setExpireHours("24");
      setPassword(pass);
      setCooldownStrategy("progressive_cooldown");
      message.info(`已套用「阅后即焚」预设，口令：${pass}`);
    } else if (type === "client") {
      setMaxVisits("20");
      setExpireHours("168");
      setPassword("");
      message.info("已套用「客户交付（7天 / 20次）」预设");
    } else {
      setMaxVisits("");
      setExpireHours("720");
      setPassword("");
      message.info("已套用「30天公开分享」预设");
    }
  };

  const handleSubmit = async () => {
    if (targetType === "url" && !targetUrl.trim()) {
      message.warning("请输入目标长链 URL（必须为 https://）");
      return;
    }
    if (targetType === "minio_asset" && !assetId) {
      message.warning("请选择要挂载的私有素材");
      return;
    }
    if (codeMode === "custom" && !customCode.trim()) {
      message.warning("请输入自定义短码");
      return;
    }
    if (ruleSource === "template" && !templateId) {
      message.warning("请选择规则模板");
      return;
    }

    setSubmitting(true);
    try {
      const hours = Number(expireHours);
      const visits = maxVisits.trim() ? Number(maxVisits) : 0;
      const hasPw = Boolean(password.trim());

      const payload: CreateLinkRequest = {
        code: codeMode === "custom" ? customCode.trim() : undefined,
        target:
          targetType === "url"
            ? { type: "url", url: targetUrl.trim() }
            : { type: "minio_asset", assetId },
        expiresAt:
          hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null,
        accessPassword: hasPw ? password.trim() : undefined,
        ruleSource:
          ruleSource === "template"
            ? {
                type: "template",
                template: {
                  templateId,
                  version:
                    templateMode === "version" ? Number(templateVersion) || 1 : undefined,
                },
              }
            : {
                type: "inline",
                rules: {
                  maxVisits: visits > 0 ? visits : 0,
                  allowedIpCidrs: allowedIps
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  requirePassword: hasPw,
                  wrongPasswordPolicy: hasPw ? { strategy: cooldownStrategy } : undefined,
                },
              },
      };

      const link = await linksApi.create(payload);
      const shortUrl = buildPublicShortUrl(link.code, link.url);
      await copy(shortUrl, `已签发并复制：${shortUrl}`);
      onCreated(link);
      setCreatedLink(link);
      onClose();
    } catch (err: any) {
      message.error(err?.message || "创建短链失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="新建短链票据 · New Stub"
        subtitle="POST /api/v1/links"
      >
        <div className="space-y-3 text-xs">
          {/* Quick Presets */}
          <div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" /> 快捷场景预设
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset("burn")}
                className="p-2 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-left"
              >
                <div className="flex items-center gap-1 text-xs">
                  <Flame className="w-3.5 h-3.5" /> 阅后即焚
                </div>
                <div className="text-[10px] font-mono opacity-80 mt-0.5">1次 + 随机口令</div>
              </button>
              <button
                type="button"
                onClick={() => applyPreset("client")}
                className="p-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] text-left"
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Package className="w-3.5 h-3.5" /> 客户交付
                </div>
                <div className="text-[10px] font-mono text-[var(--ink-3)] mt-0.5">7天 / 20次</div>
              </button>
              <button
                type="button"
                onClick={() => applyPreset("public")}
                className="p-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] text-left"
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <Globe className="w-3.5 h-3.5" /> 公开分享
                </div>
                <div className="text-[10px] font-mono text-[var(--ink-3)] mt-0.5">30天不限次</div>
              </button>
            </div>
          </div>

          {/* Target Type */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => setTargetType("url")}
              className={`py-1.5 rounded-sm font-bold text-xs ${
                targetType === "url"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              URL 长链跳转
            </button>
            <button
              type="button"
              onClick={() => setTargetType("minio_asset")}
              className={`py-1.5 rounded-sm font-bold text-xs ${
                targetType === "minio_asset"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              MinIO 私有素材
            </button>
          </div>

          {targetType === "url" ? (
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                目标 HTTPS URL
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/your-resource"
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                选择已上传的 MinIO 私有素材
              </label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              >
                <option value="">-- 请选择素材 --</option>
                {assets.map((a) => (
                  <option key={a.assetId} value={a.assetId}>
                    [{a.businessId}] {a.fileName || a.path}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Short code & expiration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                短码生成方式
              </label>
              <select
                value={codeMode}
                onChange={(e) => setCodeMode(e.target.value as "generated" | "custom")}
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              >
                <option value="generated">随机短码 (6~10位)</option>
                <option value="custom">自定义短码</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                有效期时长
              </label>
              <select
                value={expireHours}
                onChange={(e) => setExpireHours(e.target.value)}
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              >
                <option value="1">1 小时后过期</option>
                <option value="24">24 小时后过期</option>
                <option value="72">3 天后过期</option>
                <option value="168">7 天后过期</option>
                <option value="720">30 天后过期</option>
                <option value="0">永不过期</option>
              </select>
            </div>
          </div>

          {codeMode === "custom" && (
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                自定义短码 (4~32位)
              </label>
              <input
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="design-v2"
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            </div>
          )}

          {/* Rule mode */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
            <button
              type="button"
              onClick={() => setRuleSource("inline")}
              className={`py-1.5 rounded-sm font-bold text-xs ${
                ruleSource === "inline"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              独立内联规则
            </button>
            <button
              type="button"
              onClick={() => setRuleSource("template")}
              className={`py-1.5 rounded-sm font-bold text-xs ${
                ruleSource === "template"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              绑定规则模板
            </button>
          </div>

          {ruleSource === "inline" ? (
            <div className="space-y-2.5 p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                    有效访问上限 (次)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={maxVisits}
                    onChange={(e) => setMaxVisits(e.target.value)}
                    placeholder="留空不限次数"
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                    IP CIDR 白名单（可选）
                  </label>
                  <input
                    value={allowedIps}
                    onChange={(e) => setAllowedIps(e.target.value)}
                    placeholder="逗号分隔, 留空不限"
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                    访问口令（留空公开访问）
                  </label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="设置后访客需输入口令"
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                    输错冷却策略
                  </label>
                  <select
                    value={cooldownStrategy}
                    onChange={(e) => setCooldownStrategy(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                  >
                    <option value="progressive_cooldown">渐进冷却 (progressive)</option>
                    <option value="fixed_cooldown">固定冷却 (fixed)</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  选择规则模板
                </label>
                <select
                  value={templateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTemplateId(id);
                    const found = templates.find((t) => t.templateId === id);
                    if (found) setTemplateVersion(found.latestVersion);
                  }}
                  className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                >
                  <option value="">-- 请选择规则模板 --</option>
                  {templates.map((t) => (
                    <option key={t.templateId} value={t.templateId}>
                      {t.name} (最新 v{t.latestVersion})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                    版本绑定模式
                  </label>
                  <select
                    value={templateMode}
                    onChange={(e) => setTemplateMode(e.target.value as "latest" | "version")}
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                  >
                    <option value="latest">跟随最新 (latest)</option>
                    <option value="version">锁定指定版本 (version)</option>
                  </select>
                </div>
                {templateMode === "version" && (
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                      指定版本号
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={templateVersion}
                      onChange={(e) => setTemplateVersion(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
          >
            {submitting ? "签发中..." : "签发短链并复制"}
          </button>
        </div>
      </BottomSheet>

      <MobileQRModal
        open={!!createdLink}
        onClose={() => setCreatedLink(null)}
        code={createdLink?.code || ""}
        shortUrl={createdLink ? buildPublicShortUrl(createdLink.code, createdLink.url) : ""}
        targetLabel={createdLink?.target.url || createdLink?.target.assetId || ""}
      />
    </>
  );
}
