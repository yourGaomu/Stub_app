import { useEffect, useMemo, useState } from "react";
import { App } from "antd";
import {
  Copy,
  QrCode,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Power,
  CalendarClock,
  ClipboardCheck,
  Flame,
} from "lucide-react";
import { authApi, linksApi, logsApi } from "../services/api";
import type {
  AnalyticsResponse,
  LinkDTO,
  LinkListItem,
  UsageResponse,
} from "../services/api/types";
import { buildPublicShortUrl, formatBytes, formatDateTime, formatRelative } from "../lib/format";
import { readClipboardText, useCopy } from "../hooks/use-copy";
import { BottomSheet, MobileQRModal } from "../components/bottom-sheet";

export function LinksTab({
  refreshTrigger,
  onOpenCreateWithUrl,
}: {
  refreshTrigger: number;
  onOpenCreateWithUrl: (url: string) => void;
}) {
  const { message } = App.useApp();
  const copy = useCopy();

  const [links, setLinks] = useState<LinkListItem[]>([]);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "burn" | "asset" | "expired">("all");
  const [clipboardUrl, setClipboardUrl] = useState<string>("");

  const [activeLink, setActiveLink] = useState<LinkDTO | null>(null);
  const [qrLink, setQrLink] = useState<{ code: string; url: string; label?: string } | null>(
    null
  );
  const [linkAnalytics, setLinkAnalytics] = useState<AnalyticsResponse | null>(null);

  const [renewHours, setRenewHours] = useState("168");
  const [renewCodeMode, setRenewCodeMode] = useState<"keep" | "generated">("keep");
  const [customCodeInput, setCustomCodeInput] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [linksRes, usageRes] = await Promise.all([
        linksApi.list({ page: 1, pageSize: 100 }),
        authApi.myUsage().catch(() => null),
      ]);
      setLinks(linksRes.items || []);
      if (usageRes) setUsage(usageRes);
    } catch (err: any) {
      message.error(err?.message || "加载短链列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const checkClipboard = async () => {
    const text = (await readClipboardText()).trim();
    if (/^https:\/\/[^\s]+$/i.test(text)) {
      setClipboardUrl(text);
    }
  };

  useEffect(() => {
    checkClipboard();
  }, []);

  const openLinkDetail = async (item: LinkListItem) => {
    try {
      const detail = await linksApi.get(item.linkId);
      setActiveLink(detail);
      logsApi
        .analyticsLink(item.linkId, { range: "7d" })
        .then(setLinkAnalytics)
        .catch(() => setLinkAnalytics(null));
    } catch (err: any) {
      message.error(err?.message || "读取短链详情失败");
    }
  };

  const filteredLinks = useMemo(() => {
    return links.filter((item) => {
      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchUrl = (item.url || "").toLowerCase().includes(q);
        if (!matchCode && !matchUrl) return false;
      }

      if (filter === "active") {
        return item.availability === "available";
      }
      if (filter === "burn") {
        return item.maxVisits === 1;
      }
      if (filter === "asset") {
        return item.targetType === "minio_asset";
      }
      if (filter === "expired") {
        return item.availability !== "available";
      }
      return true;
    });
  }, [links, keyword, filter]);

  const handleToggleStatus = async (link: LinkDTO) => {
    try {
      if (link.status === "enabled") {
        await linksApi.disable(link.linkId);
        message.success("短链已停用");
      } else {
        await linksApi.enable(link.linkId);
        message.success("短链已启用");
      }
      const updated = await linksApi.get(link.linkId);
      setActiveLink(updated);
      loadData();
    } catch (err: any) {
      message.error(err?.message || "操作失败");
    }
  };

  const handleResetVisits = async (link: LinkDTO) => {
    try {
      await linksApi.resetVisits(link.linkId);
      message.success("已清零访问计数与口令冷却状态");
      const updated = await linksApi.get(link.linkId);
      setActiveLink(updated);
      loadData();
    } catch (err: any) {
      message.error(err?.message || "重置计数失败");
    }
  };

  const handleRotateCode = async (link: LinkDTO, strategy: "generated" | "custom") => {
    if (strategy === "custom" && !customCodeInput.trim()) {
      message.warning("请输入新自定义短码");
      return;
    }
    try {
      const res = await linksApi.rotateCode(link.linkId, {
        strategy,
        code: strategy === "custom" ? customCodeInput.trim() : undefined,
      });
      message.success(`短码已更换为 /r/${res.code}`);
      const updated = await linksApi.get(link.linkId);
      setActiveLink(updated);
      setCustomCodeInput("");
      loadData();
    } catch (err: any) {
      message.error(err?.message || "更换短码失败");
    }
  };

  const handleRenew = async (link: LinkDTO) => {
    const hours = Number(renewHours) || 168;
    try {
      await linksApi.renew(link.linkId, {
        expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
        codeStrategy: renewCodeMode,
      });
      message.success("续期成功");
      const updated = await linksApi.get(link.linkId);
      setActiveLink(updated);
      loadData();
    } catch (err: any) {
      message.error(err?.message || "续期失败");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Clipboard quick banner */}
      {clipboardUrl && (
        <div
          onClick={() => onOpenCreateWithUrl(clipboardUrl)}
          className="p-2.5 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-bold text-[var(--accent)] flex items-center gap-1">
              <ClipboardCheck className="w-3 h-3" /> 剪贴板检测到 HTTPS 链接 · 点此一键转短链
            </div>
            <div className="text-xs font-mono truncate mt-0.5">{clipboardUrl}</div>
          </div>
          <span className="stub-btn stub-btn-accent text-xs px-2.5 py-1 shrink-0">缩短</span>
        </div>
      )}

      {/* Mini Usage Cards */}
      {usage && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
            <div className="text-[10px] font-mono text-[var(--ink-3)]">URL 短链配额</div>
            <div className="text-sm font-extrabold font-mono mt-0.5">
              {usage.urlLinks.used}{" "}
              <span className="text-[10px] font-normal text-[var(--ink-3)]">
                / {usage.urlLinks.limit ?? "∞"}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
            <div className="text-[10px] font-mono text-[var(--ink-3)]">素材短链配额</div>
            <div className="text-sm font-extrabold font-mono mt-0.5">
              {usage.minioAssetLinks.used}{" "}
              <span className="text-[10px] font-normal text-[var(--ink-3)]">
                / {usage.minioAssetLinks.limit ?? "∞"}
              </span>
            </div>
          </div>
          <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
            <div className="text-[10px] font-mono text-[var(--ink-3)]">存储空间</div>
            <div className="text-sm font-extrabold font-mono mt-0.5 truncate">
              {formatBytes(usage.storage.usedBytes)}
            </div>
          </div>
          <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
            <div className="text-[10px] font-mono text-[var(--ink-3)]">API Key 凭证</div>
            <div className="text-sm font-extrabold font-mono mt-0.5">
              {usage.apiKeys?.used ?? 0}{" "}
              <span className="text-[10px] font-normal text-[var(--ink-3)]">
                / {usage.apiKeys?.limit ?? "∞"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search & Refresh */}
      <div className="flex gap-1.5">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索短码 /r/code ..."
          className="flex-1 px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => {
            checkClipboard();
            loadData();
          }}
          className="stub-btn stub-btn-ghost px-2.5 py-1.5 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Horizontal Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { key: "all", label: `全部 (${links.length})` },
          { key: "active", label: "可用中" },
          { key: "burn", label: "🔥 阅后即焚" },
          { key: "asset", label: "素材短链" },
          { key: "expired", label: "已停用/过期" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key as any)}
            className={`stub-pill cursor-pointer shrink-0 ${
              filter === item.key ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : ""
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Perforated Ticket List */}
      {filteredLinks.length === 0 ? (
        <div className="m-ticket text-center py-8 text-xs font-mono text-[var(--ink-3)]">
          暂无匹配的短链票据，点击底部中央「＋」立即签发
        </div>
      ) : (
        filteredLinks.map((link) => {
          const shortUrl = buildPublicShortUrl(link.code, link.url);
          const isBurn = link.maxVisits === 1;

          return (
            <div key={link.linkId} className="m-ticket">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base font-extrabold font-mono text-[var(--accent)]">
                      /r/{link.code}
                    </span>
                    <span className="stub-pill">
                      {link.targetType === "minio_asset" ? "ASSET" : "URL"}
                    </span>
                    {isBurn && (
                      <span className="stub-pill stub-pill-accent">
                        <Flame className="w-3 h-3" /> 阅后即焚
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--ink-3)] truncate mt-1">
                    {shortUrl}
                  </div>
                </div>

                {link.availability === "disabled" ? (
                  <span className="stub-pill stub-pill-err shrink-0">已停用</span>
                ) : link.availability === "expired" ? (
                  <span className="stub-pill stub-pill-err shrink-0">已过期</span>
                ) : link.availability === "visit_limit_reached" ? (
                  <span className="stub-pill stub-pill-warn shrink-0">次数耗尽</span>
                ) : (
                  <span className="stub-pill stub-pill-ok shrink-0">● 正常</span>
                )}
              </div>

              <div className="m-ticket-meta">
                <div>
                  访问{" "}
                  <strong className="text-[var(--ink)]">
                    {link.visitsUsed}
                    {link.maxVisits > 0 ? ` / ${link.maxVisits}` : " / ∞"}
                  </strong>{" "}
                  · {link.expiresAt ? formatRelative(link.expiresAt) : "永不过期"}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => copy(shortUrl, `已复制 ${shortUrl}`)}
                    className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" /> 复制
                  </button>
                  <button
                    type="button"
                    onClick={() => setQrLink({ code: link.code, url: shortUrl })}
                    className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"
                  >
                    <QrCode className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openLinkDetail(link)}
                    className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" /> 管理
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* QR Code Sheet */}
      <MobileQRModal
        open={!!qrLink}
        onClose={() => setQrLink(null)}
        code={qrLink?.code || ""}
        shortUrl={qrLink?.url || ""}
        targetLabel={qrLink?.label}
      />

      {/* Single Link Governance Bottom Sheet */}
      <BottomSheet
        open={!!activeLink}
        onClose={() => setActiveLink(null)}
        title={activeLink ? `/r/${activeLink.code}` : ""}
        subtitle={activeLink?.target.url || activeLink?.target.assetId}
      >
        {activeLink && (
          <div className="space-y-3 text-xs">
            {/* 7d Mini stats */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">累计有效访问</div>
                <div className="text-sm font-extrabold font-mono mt-0.5">
                  {activeLink.visitsUsed}
                  {activeLink.rules.maxVisits > 0 ? ` / ${activeLink.rules.maxVisits}` : ""}
                </div>
              </div>
              <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">近7天放行</div>
                <div className="text-sm font-extrabold font-mono text-[var(--ok)] mt-0.5">
                  {linkAnalytics ? linkAnalytics.totals.redirectCount : "-"}
                </div>
              </div>
              <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">近7天拦截</div>
                <div className="text-sm font-extrabold font-mono text-[var(--err)] mt-0.5">
                  {linkAnalytics ? linkAnalytics.totals.failureCount : "-"}
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] font-mono text-[11px] space-y-1">
              <div>
                过期时间：
                <strong>
                  {activeLink.expiresAt ? formatDateTime(activeLink.expiresAt) : "永久有效"}
                </strong>
              </div>
              <div>
                规则来源：
                <strong>
                  {activeLink.ruleTemplate
                    ? `模板 (${activeLink.ruleTemplate.templateId}${
                        activeLink.ruleTemplate.version
                          ? ` v${activeLink.ruleTemplate.version}`
                          : " 跟随最新"
                      })`
                    : "独立内联规则"}
                </strong>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleResetVisits(activeLink)}
                className="stub-btn stub-btn-ghost py-2 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 清零访问计数
              </button>
              <button
                type="button"
                onClick={() => handleToggleStatus(activeLink)}
                className="stub-btn stub-btn-ghost py-2 text-xs"
              >
                <Power className="w-3.5 h-3.5" />{" "}
                {activeLink.status === "enabled" ? "停用此短链" : "恢复启用短链"}
              </button>
            </div>

            {/* Rotate short code */}
            <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
              <div className="font-bold">更换短码 · Rotate Code</div>
              <div className="flex gap-1.5">
                <input
                  value={customCodeInput}
                  onChange={(e) => setCustomCodeInput(e.target.value)}
                  placeholder="可选：输入新自定义短码"
                  className="flex-1 px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleRotateCode(activeLink, "generated")}
                  className="stub-btn stub-btn-ghost px-2.5 py-1.5 text-xs"
                >
                  随机换码
                </button>
                {customCodeInput.trim() && (
                  <button
                    type="button"
                    onClick={() => handleRotateCode(activeLink, "custom")}
                    className="stub-btn stub-btn-primary px-2.5 py-1.5 text-xs"
                  >
                    指定换码
                  </button>
                )}
              </div>
            </div>

            {/* Renew expiration */}
            <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
              <div className="font-bold flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" /> 续期短链 · Renew
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={renewHours}
                  onChange={(e) => setRenewHours(e.target.value)}
                  className="px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                >
                  <option value="24">延长 24 小时</option>
                  <option value="168">延长 7 天</option>
                  <option value="720">延长 30 天</option>
                </select>
                <select
                  value={renewCodeMode}
                  onChange={(e) => setRenewCodeMode(e.target.value as "keep" | "generated")}
                  className="px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                >
                  <option value="keep">保留原短码 (keep)</option>
                  <option value="generated">续期并换随机码</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleRenew(activeLink)}
                className="stub-btn stub-btn-primary w-full py-2 text-xs"
              >
                确认续期
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
