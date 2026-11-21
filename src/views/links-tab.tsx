import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Copy, QrCode, MoreHorizontal, RefreshCw, RotateCcw, Power, CalendarClock, ClipboardCheck, Flame, X } from "lucide-react";
import { linksApi, logsApi } from "../services/api";
import type { AnalyticsResponse, LinkDTO, LinkListItem, LinkListQuery } from "../services/api/types";
import { buildPublicShortUrl, formatBytes, formatDateTime, formatRelative } from "../lib/format";
import { buildWindowPatch, expirationAfterHours, isHttpsUrl, linkMetadata, localWindowTime, validatedCode } from "../lib/link-form";
import type { LinkWindowForm } from "../lib/link-form";
import { readClipboardText, useCopy } from "../hooks/use-copy";
import { useAuthStore } from "../stores/auth-store";
import { BottomSheet, MobileQRModal } from "../components/bottom-sheet";
import { GroupPicker, useLinkGroups } from "../components/group-picker";

type Filter = "all" | "asset" | "burn" | LinkDTO["availability"];
type Confirmation = { type: "reset" } | { type: "rotate"; strategy: "generated" | "custom"; code?: string };
const PAGE_SIZE = 20;
const AVAILABILITY_BADGE: Record<LinkDTO["availability"], { label: string; className: string }> = {
  available: { label: "可用", className: "stub-pill-ok" },
  not_started: { label: "尚未开放", className: "" },
  window_ended: { label: "开放结束", className: "stub-pill-warn" },
  expired: { label: "已过期", className: "stub-pill-warn" },
  disabled: { label: "已停用", className: "stub-pill-err" },
  visit_limit_reached: { label: "次数耗尽", className: "stub-pill-warn" },
};
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" }, { key: "available", label: "可用中" },
  { key: "not_started", label: "尚未开放" }, { key: "window_ended", label: "开放结束" },
  { key: "asset", label: "素材短链" }, { key: "burn", label: "阅后即焚" },
  { key: "expired", label: "已过期" }, { key: "disabled", label: "已停用" },
  { key: "visit_limit_reached", label: "次数耗尽" },
];
const inputClass = "w-full min-w-0 px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs";
const labelClass = "block text-[11px] font-mono text-[var(--ink-3)] mb-1";

function filterQuery(filter: Filter): Omit<LinkListQuery, "groupId" | "ungrouped"> {
  if (filter === "asset") return { targetType: "minio_asset" };
  if (filter === "burn") return { maxVisits: 1 };
  if (filter !== "all") return { availability: filter };
  return {};
}

function dedupeLinks(previous: LinkListItem[], incoming: LinkListItem[]): LinkListItem[] {
  const items = new Map(previous.map((link) => [link.linkId, link]));
  for (const item of incoming) items.set(item.linkId, item);
  return [...items.values()];
}

export function LinksTab({ refreshTrigger, openLinkId, onOpenedLink, onOpenCreateWithUrl, onCopyConfiguration, clipboardChecked, clipboardUrl, onClipboardChecked, onClipboardUrlChange }: {
  refreshTrigger: number;
  openLinkId?: string;
  onOpenedLink?: () => void;
  onOpenCreateWithUrl: (url: string) => void;
  onCopyConfiguration: (link: LinkDTO) => void;
  clipboardChecked: boolean;
  clipboardUrl: string;
  onClipboardChecked: () => void;
  onClipboardUrlChange: (url: string) => void;
}) {
  const { message } = App.useApp();
  const copy = useCopy();
  const { hasPermission, initialized, usage, refreshUsage, user, token } = useAuthStore();
  const canRead = initialized && hasPermission("links.read");
  const canManage = initialized && hasPermission("links.manage");
  const canReset = initialized && hasPermission("links.reset_visits");
  const canCreateUrl = initialized && hasPermission("links.create_url");
  const [links, setLinks] = useState<LinkListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const groups = useLinkGroups(canRead, `${token}:${user?.defaultWorkspaceId || ""}:${refreshTrigger}`);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestVersion = useRef(0);
  const requestInFlight = useRef<number | null>(null);
  const queryRef = useRef<LinkListQuery>({});
  const pageRef = useRef(0);
  const lastKeywordRef = useRef("");
  const mounted = useRef(true);
  const clipboardAttempted = useRef(clipboardChecked);
  const clipboardDismissed = useRef(false);
  const [clipboardBusy, setClipboardBusy] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeLink, setActiveLink] = useState<LinkDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [linkAnalytics, setLinkAnalytics] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const detailVersion = useRef(0);
  const detailIdRef = useRef<string | null>(null);
  const analyticsVersion = useRef(0);
  const [qrLink, setQrLink] = useState<{ code: string; url: string; label?: string } | null>(null);
  const [renewHours, setRenewHours] = useState("168");
  const [windowForm, setWindowForm] = useState<LinkWindowForm>({ activeFrom: "", activeUntil: "" });
  const [renewCodeMode, setRenewCodeMode] = useState<"keep" | "generated">("keep");
  const [customCodeInput, setCustomCodeInput] = useState("");
  const [metadata, setMetadata] = useState<{ title: string; tags: string[]; tagInput: string; groupId: string | null }>({ title: "", tags: [], tagInput: "", groupId: null });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmation) return;
    confirmationRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    confirmationRef.current?.focus({ preventScroll: true });
  }, [confirmation]);
  const [busy, setBusy] = useState("");
  const operationLock = useRef(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestVersion.current++; detailVersion.current++; analyticsVersion.current++; };
  }, []);

  const clearList = useCallback(() => {
    requestVersion.current++;
    requestInFlight.current = null;
    pageRef.current = 0;
    setLinks([]);
    setPage(0);
    setTotal(0);
    setListError("");
    setLoading(true);
  }, []);

  const loadPage = useCallback(async (requestedPage: number, version: number, query: LinkListQuery) => {
    if (requestInFlight.current === version || requestVersion.current !== version) return;
    requestInFlight.current = version;
    setLoading(true);
    setListError("");
    try {
      const res = await linksApi.list({ ...query, page: requestedPage, pageSize: PAGE_SIZE });
      if (!mounted.current || requestVersion.current !== version) return;
      setLinks((prev) => dedupeLinks(requestedPage === 1 ? [] : prev, res.items || []));
      setTotal(res.pagination.total);
      pageRef.current = requestedPage;
      setPage(requestedPage);
    } catch (err: any) {
      if (mounted.current && requestVersion.current === version) setListError(err?.message || "加载短链列表失败");
    } finally {
      if (requestInFlight.current === version) requestInFlight.current = null;
      if (mounted.current && requestVersion.current === version) setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearList();
    const version = requestVersion.current;
    if (!canRead) { setLoading(false); return; }
    const groupQuery: LinkListQuery = groupFilter === "ungrouped" ? { ungrouped: true } : groupFilter !== "all" ? { groupId: groupFilter } : {};
    const query: LinkListQuery = { ...filterQuery(filter), ...groupQuery, keyword: keyword.trim() || undefined };
    queryRef.current = query;
    const changedKeyword = lastKeywordRef.current !== keyword;
    lastKeywordRef.current = keyword;
    const timer = window.setTimeout(() => { void loadPage(1, version, query); }, changedKeyword ? 300 : 0);
    return () => { clearTimeout(timer); requestVersion.current++; };
  }, [keyword, filter, groupFilter, refreshTrigger, refreshVersion, canRead, user?.defaultWorkspaceId, token, clearList, loadPage]);

  const usageRefresh = useRef(refreshTrigger);
  useEffect(() => {
    if (usageRefresh.current !== refreshTrigger) {
      usageRefresh.current = refreshTrigger;
      void refreshUsage();
    }
  }, [refreshTrigger, refreshUsage]);

  const refreshList = () => {
    clearList();
    setRefreshVersion((n) => n + 1);
    void refreshUsage();
  };

  const checkClipboard = useCallback(async () => {
    if (!canCreateUrl || clipboardAttempted.current) return;
    clipboardAttempted.current = true;
    onClipboardChecked();
    setClipboardBusy(true);
    const text = (await readClipboardText()).trim();
    if (mounted.current && !clipboardDismissed.current && isHttpsUrl(text)) onClipboardUrlChange(text);
    if (mounted.current) setClipboardBusy(false);
  }, [canCreateUrl, onClipboardChecked, onClipboardUrlChange]);

  const isCurrentDetail = useCallback((id: string, version: number) =>
    mounted.current && detailIdRef.current === id && detailVersion.current === version && useAuthStore.getState().token === token, [token]);
  const closeDetail = () => {
    detailVersion.current++;
    analyticsVersion.current++;
    detailIdRef.current = null;
    setDetailId(null);
    setActiveLink(null);
    setLinkAnalytics(null);
    setDetailError("");
    setConfirmation(null);
    setActionError("");
  };
  const applyDetail = useCallback((link: LinkDTO) => {
    setActiveLink(link);
    setMetadata({ title: link.title || "", tags: [...(link.tags || [])], tagInput: "", groupId: link.groupId ?? null });
    setWindowForm({ activeFrom: localWindowTime(link.activeFrom), activeUntil: localWindowTime(link.activeUntil) });
  }, []);
  const loadAnalytics = useCallback(async (id: string, version: number) => {
    const request = ++analyticsVersion.current;
    setLinkAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const result = await logsApi.analyticsLink(id, { range: "7d" });
      if (isCurrentDetail(id, version) && analyticsVersion.current === request) setLinkAnalytics(result);
    } catch (err: any) {
      if (isCurrentDetail(id, version) && analyticsVersion.current === request) setAnalyticsError(err?.message || "统计加载失败");
    } finally {
      if (isCurrentDetail(id, version) && analyticsVersion.current === request) setAnalyticsLoading(false);
    }
  }, [isCurrentDetail]);
  const loadDetail = useCallback(async (id: string, version: number) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await linksApi.get(id);
      if (isCurrentDetail(id, version)) applyDetail(result);
    } catch (err: any) {
      if (isCurrentDetail(id, version)) setDetailError(err?.message || "读取短链详情失败");
    } finally {
      if (isCurrentDetail(id, version)) setDetailLoading(false);
    }
  }, [isCurrentDetail, applyDetail]);
  const openLinkDetail = useCallback((id: string) => {
    if (!canRead) return;
    const version = ++detailVersion.current;
    detailIdRef.current = id;
    setDetailId(id);
    setActiveLink(null);
    setLinkAnalytics(null);
    setCustomCodeInput("");
    setRenewHours("168");
    setRenewCodeMode("keep");
    setConfirmation(null);
    setActionError("");
    void loadDetail(id, version);
    void loadAnalytics(id, version);
  }, [canRead, loadDetail, loadAnalytics]);

  useEffect(() => {
    if (!openLinkId || !initialized) return;
    const timer = window.setTimeout(() => {
      onOpenedLink?.();
      if (canRead) openLinkDetail(openLinkId);
      else message.warning("当前账号没有读取短链的权限");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openLinkId, initialized, canRead, onOpenedLink, openLinkDetail, message]);

  const runOperation = async (link: LinkDTO, permission: string, name: string, operation: () => Promise<unknown>, success: string) => {
    if (operationLock.current) return false;
    if (!useAuthStore.getState().hasPermission(permission)) { message.warning("当前账号没有此操作权限"); return false; }
    operationLock.current = true;
    const version = detailVersion.current;
    const token = useAuthStore.getState().token;
    setBusy(name);
    setActionError("");
    try {
      await operation();
      if (!mounted.current || useAuthStore.getState().token !== token) return false;
      refreshList();
      message.success(success);
      if (isCurrentDetail(link.linkId, version)) {
        setConfirmation(null);
        setCustomCodeInput("");
        await loadDetail(link.linkId, version);
        if (isCurrentDetail(link.linkId, version)) void loadAnalytics(link.linkId, version);
      }
      return true;
    } catch (err: any) {
      if (isCurrentDetail(link.linkId, version)) setActionError(err?.message || `${name}失败，请重试`);
      return false;
    } finally {
      operationLock.current = false;
      if (mounted.current) setBusy("");
    }
  };

  const requestRotate = (strategy: "generated" | "custom") => {
    try {
      setActionError("");
      setConfirmation({ type: "rotate", strategy, code: strategy === "custom" ? validatedCode(customCodeInput) : undefined });
    } catch (err: any) { setActionError(err.message); }
  };
  const confirmOperation = () => {
    if (!activeLink || !confirmation) return;
    if (confirmation.type === "reset") {
      void runOperation(activeLink, "links.reset_visits", "清零计数", () => linksApi.resetVisits(activeLink.linkId), "已清零访问计数，口令冷却状态保持不变");
    } else {
      void runOperation(activeLink, "links.manage", "更换短码", () => linksApi.rotateCode(activeLink.linkId, { strategy: confirmation.strategy, code: confirmation.code }), "短码已更换，原短码已失效");
    }
  };
  const saveMetadata = () => {
    if (!activeLink) return;
    try {
      const body = { ...linkMetadata(metadata.title, metadata.tags, metadata.tagInput), groupId: metadata.groupId };
      void runOperation(activeLink, "links.manage", "保存资料", () => linksApi.updateMetadata(activeLink.linkId, body), "标题、标签和分组已保存");
    } catch (err: any) { setActionError(err.message); }
  };
  const saveWindow = () => {
    if (!activeLink) return;
    try {
      const patch = buildWindowPatch(activeLink, windowForm);
      if (!Object.keys(patch).length) { message.info("时间窗未修改"); return; }
      void runOperation(activeLink, "links.manage", "保存时间窗", () => linksApi.updateRules(activeLink.linkId, patch), "开放时间窗已更新，其它访问限制继续生效");
    } catch (err: any) { setActionError(err.message); }
  };
  const handleRenew = () => {
    if (!activeLink) return;
    try {
      if (!activeLink.expiresAt) throw new Error("永久有效短链无需续期");
      const current = Date.parse(activeLink.expiresAt);
      if (!Number.isFinite(current)) throw new Error("当前到期时间无效，请刷新详情");
      const expiresAt = expirationAfterHours(renewHours, Math.max(Date.now(), current));
      if (renewCodeMode === "generated" && !window.confirm("续期并更换随机短码？原短码将失效。")) return;
      void runOperation(activeLink, "links.manage", "续期", () => linksApi.renew(activeLink.linkId, { expiresAt, codeStrategy: renewCodeMode }), "续期成功");
    } catch (err: any) { setActionError(err.message); }
  };

  if (!canRead) return <div className="m-ticket text-center py-8 text-xs" role="status">{initialized ? "当前账号没有读取短链的权限" : "正在加载账号权限…"}</div>;

  return <div className="space-y-2.5">
    {canCreateUrl && clipboardUrl && <div className="p-2.5 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] flex items-center gap-2">
      <button type="button" onClick={() => onOpenCreateWithUrl(clipboardUrl)} className="min-w-0 flex-1 text-left"><span className="text-[10px] font-bold text-[var(--accent)] flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> 剪贴板 HTTPS 链接 · 创建短链</span><span className="block text-xs truncate mt-0.5">{clipboardUrl}</span></button>
      <button type="button" aria-label="关闭剪贴板建议" onClick={() => { clipboardDismissed.current = true; onClipboardUrlChange(""); }} className="shrink-0 p-2"><X className="w-4 h-4" /></button>
    </div>}
    {canCreateUrl && !clipboardChecked && <button type="button" disabled={clipboardBusy} onClick={() => void checkClipboard()} className="stub-btn stub-btn-ghost px-2.5 py-1.5 text-xs"><ClipboardCheck className="w-3.5 h-3.5" />{clipboardBusy ? "读取中…" : "从剪贴板读取链接"}</button>}
    {usage && <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]"><div className="text-[10px] text-[var(--ink-3)]">URL 短链配额</div><div className="text-sm font-extrabold font-mono mt-0.5">{usage.urlLinks.used} <span className="text-[10px] font-normal text-[var(--ink-3)]">/ {usage.urlLinks.limit ?? "∞"}</span></div></div>
      <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]"><div className="text-[10px] text-[var(--ink-3)]">素材短链配额</div><div className="text-sm font-extrabold font-mono mt-0.5">{usage.minioAssetLinks.used} <span className="text-[10px] font-normal text-[var(--ink-3)]">/ {usage.minioAssetLinks.limit ?? "∞"}</span></div></div>
      <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]"><div className="text-[10px] text-[var(--ink-3)]">存储空间</div><div className="text-sm font-extrabold font-mono mt-0.5 truncate">{formatBytes(usage.storage.usedBytes)}</div></div>
      <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]"><div className="text-[10px] text-[var(--ink-3)]">API Key 凭证</div><div className="text-sm font-extrabold font-mono mt-0.5">{usage.apiKeys?.used ?? 0} <span className="text-[10px] font-normal text-[var(--ink-3)]">/ {usage.apiKeys?.limit ?? "∞"}</span></div></div>
    </div>}
    <div className="flex gap-1.5">
      <input aria-label="搜索短链" value={keyword} maxLength={160} onChange={(e) => { clearList(); setKeyword(e.target.value); }} placeholder="搜索标题、标签、短码、目标…" className={inputClass} />
      <button type="button" aria-label="刷新短链列表" onClick={refreshList} className="stub-btn stub-btn-ghost px-2.5"><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /></button>
    </div>
    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" aria-label="短链筛选">
      {filters.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => { if (filter !== item.key) { clearList(); setFilter(item.key); } }} className={`stub-pill cursor-pointer shrink-0 ${filter === item.key ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : ""}`}>{item.label}</button>)}
    </div>
    <div className="space-y-1.5">
      <label htmlFor="links-group-filter" className={labelClass}>按分组筛选</label>
      <select id="links-group-filter" value={groupFilter} onChange={(event) => { clearList(); setGroupFilter(event.target.value); }} className={inputClass}>
        <option value="all">全部分组</option><option value="ungrouped">未分组</option>
        {groupFilter !== "all" && groupFilter !== "ungrouped" && !groups.items.some((group) => group.groupId === groupFilter) && <option value={groupFilter}>当前分组</option>}
        {groups.items.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
      </select>
      {groups.loading && <p role="status" className="text-[11px] text-[var(--ink-3)]">正在加载分组…</p>}
      {groups.error && <p role="alert" className="text-[11px] text-[var(--err)]">分组加载失败：{groups.error} <button type="button" onClick={groups.retry} className="underline">重试分组</button></p>}
      {!groups.loading && !groups.error && groups.loaded && groups.items.length === 0 && <p className="text-[11px] text-[var(--ink-3)]">暂无分组。</p>}
      {groups.hasMore && <button type="button" disabled={groups.loading} onClick={groups.loadMore} className="underline text-[11px]">加载更多分组</button>}
    </div>
    <p className="text-[11px] font-mono text-[var(--ink-3)]" aria-live="polite">{page > 0 ? `已加载 ${links.length} / 共 ${total} 条` : loading ? "正在查询…" : "尚未加载"}</p>
    {loading && page === 0 && <div role="status" className="m-ticket text-center py-8 text-xs">正在加载短链…</div>}
    {listError && <div role="alert" className="m-ticket space-y-2 text-xs"><p>{listError}</p><button type="button" disabled={loading} onClick={() => void loadPage(pageRef.current + 1, requestVersion.current, queryRef.current)} className="stub-btn stub-btn-ghost px-3 py-1.5">{loading ? "重试中…" : "重试加载"}</button></div>}
    {!loading && !listError && links.length === 0 && <div className="m-ticket text-center py-8 text-xs text-[var(--ink-3)]">{keyword.trim() || filter !== "all" || groupFilter !== "all" ? "没有匹配的短链，请调整关键词或筛选条件" : "暂无短链票据，可点击底部「＋」签发"}</div>}
    {links.map((link) => {
      const shortUrl = buildPublicShortUrl(link.code, link.url);
      const tags = link.tags || [];
      const target = link.targetType === "minio_asset" ? link.assetId : link.targetUrl;
      const badge = AVAILABILITY_BADGE[link.availability];
      return <div key={link.linkId} className="m-ticket">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {link.title && <div className="text-sm font-bold break-words mb-1">{link.title}</div>}
            <div className="flex items-center gap-1.5 flex-wrap"><span className="text-base font-extrabold font-mono text-[var(--accent)] break-all">/r/{link.code}</span><span className="stub-pill">{link.targetType === "minio_asset" ? "ASSET" : "URL"}</span>{link.maxVisits === 1 && <span className="stub-pill stub-pill-accent"><Flame className="w-3 h-3" />阅后即焚</span>}</div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] truncate mt-1" title={shortUrl}>{shortUrl}</div>
            <div className="text-[11px] text-[var(--ink-2)] truncate mt-1" title={target}>目标：{target || "未提供目标信息"}</div>
            <div className="text-[11px] text-[var(--ink-3)] truncate mt-1" title={link.groupName || undefined}>分组：{link.groupId ? link.groupName || "已分组" : "未分组"}</div>
            {tags.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{tags.slice(0, 3).map((tag, i) => <span key={i} className="stub-pill max-w-full"><span className="truncate">{tag}</span></span>)}{tags.length > 3 && <span className="stub-pill" aria-label={`还有 ${tags.length - 3} 个标签`} title={tags.slice(3).join("、")}>+{tags.length - 3}</span>}</div>}
          </div>
          <span className={`stub-pill shrink-0 ${badge?.className || ""}`}>{badge?.label || link.availability}</span>
        </div>
        <div className="m-ticket-meta flex-wrap"><div>访问 <strong className="text-[var(--ink)]">{link.visitsUsed} / {link.maxVisits === -1 ? "∞" : link.maxVisits}</strong> · {link.expiresAt ? formatRelative(link.expiresAt) : "永不过期"}</div><div className="flex items-center gap-1 flex-wrap">
          <button type="button" onClick={() => void copy(shortUrl, "已复制短链")} className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"><Copy className="w-3 h-3" />复制</button>
          <button type="button" aria-label={`显示 ${link.code} 的二维码`} onClick={() => setQrLink({ code: link.code, url: shortUrl, label: target })} className="stub-btn stub-btn-ghost px-2 py-1"><QrCode className="w-3 h-3" /></button>
          <button type="button" onClick={() => openLinkDetail(link.linkId)} className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"><MoreHorizontal className="w-3.5 h-3.5" />详情</button>
        </div></div>
      </div>;
    })}
    {page > 0 && page * PAGE_SIZE < total && !listError && <button type="button" disabled={loading} onClick={() => void loadPage(pageRef.current + 1, requestVersion.current, queryRef.current)} className="stub-btn stub-btn-ghost w-full py-2">{loading ? "加载中…" : "加载更多"}</button>}
    <MobileQRModal open={!!qrLink} onClose={() => setQrLink(null)} code={qrLink?.code || ""} shortUrl={qrLink?.url || ""} targetLabel={qrLink?.label} />
    <BottomSheet open={!!detailId} onClose={closeDetail} title={activeLink ? activeLink.title || `/r/${activeLink.code}` : "短链详情"} subtitle={activeLink ? `/r/${activeLink.code} · ${activeLink.target.url || activeLink.target.assetId || ""}` : undefined}>
      <div className="space-y-3 text-xs">
        {detailLoading && <p role="status">正在加载详情…</p>}
        {detailError && <div role="alert"><p>{detailError}</p><button type="button" disabled={detailLoading || !!busy} onClick={() => { if (detailId) void loadDetail(detailId, detailVersion.current); }} className="stub-btn stub-btn-ghost px-3 py-1.5 mt-1">重试详情</button></div>}
        {activeLink && <>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]"><div className="text-[10px] text-[var(--ink-3)]">累计有效访问</div><div className="text-sm font-bold font-mono mt-0.5">{activeLink.visitsUsed} / {activeLink.rules.maxVisits === -1 ? "∞" : activeLink.rules.maxVisits}</div></div>
            <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]"><div className="text-[10px] text-[var(--ink-3)]">近7天放行</div><div className="text-sm font-bold font-mono text-[var(--ok)] mt-0.5">{linkAnalytics?.totals.redirectCount ?? "—"}</div></div>
            <div className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]"><div className="text-[10px] text-[var(--ink-3)]">近7天拦截</div><div className="text-sm font-bold font-mono text-[var(--err)] mt-0.5">{linkAnalytics?.totals.failureCount ?? "—"}</div></div>
          </div>
          {analyticsLoading && <p role="status">正在加载统计…</p>}
          {analyticsError && <div role="alert">统计加载失败：{analyticsError} <button type="button" className="underline" onClick={() => void loadAnalytics(activeLink.linkId, detailVersion.current)}>重试统计</button></div>}
          <div className="space-y-1 break-words rounded-sm border border-[var(--line)] bg-[var(--bg-card)] p-2.5 font-mono text-[11px]">
            <div>可用性：<strong>{AVAILABILITY_BADGE[activeLink.availability]?.label || activeLink.availability}</strong></div>
            <div>过期时间：<strong>{activeLink.expiresAt ? formatDateTime(activeLink.expiresAt) : "永久有效"}</strong></div>
            <div>开放开始：<strong>{activeLink.activeFrom ? formatDateTime(activeLink.activeFrom, "YYYY-MM-DD HH:mm:ss Z") : "不限制"}</strong></div>
            <div>开放结束：<strong>{activeLink.activeUntil ? formatDateTime(activeLink.activeUntil, "YYYY-MM-DD HH:mm:ss Z") : "不限制"}</strong></div>
            <div>分组：<strong>{activeLink.groupId ? activeLink.groupName || "已分组" : "未分组"}</strong></div>
            <div>规则来源：<strong>{activeLink.ruleTemplate ? `模板 ${activeLink.ruleTemplate.templateId} v${activeLink.ruleTemplate.version || "最新"}` : "独立内联规则"}</strong></div>
          </div>
          {hasPermission(activeLink.target.type === "url" ? "links.create_url" : "links.create_asset") && <button type="button" disabled={!!busy || detailLoading} onClick={() => { const source = activeLink; closeDetail(); onCopyConfiguration(source); }} className="stub-btn stub-btn-accent w-full py-2"><Copy className="w-3.5 h-3.5" />复制配置</button>}
          <fieldset disabled={!!busy || detailLoading} className="min-w-0 space-y-3">
            {canManage ? <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
              <div className="font-bold">编辑标题、标签与分组</div>
              <div><label htmlFor="detail-title" className={labelClass}>标题（最多 120 字符）</label><input id="detail-title" value={metadata.title} onChange={(e) => setMetadata((prev) => ({ ...prev, title: e.target.value }))} className={inputClass} /></div>
              <div><label htmlFor="detail-tag" className={labelClass}>标签（最多 20 个，每个 32 字符）</label><div className="flex gap-1.5"><input id="detail-tag" value={metadata.tagInput} onChange={(e) => setMetadata((prev) => ({ ...prev, tagInput: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); try { setMetadata({ ...metadata, ...linkMetadata(metadata.title, metadata.tags, metadata.tagInput), tagInput: "" }); } catch (err: any) { setActionError(err.message); } } }} className={inputClass} /><button type="button" onClick={() => { try { setMetadata({ ...metadata, ...linkMetadata(metadata.title, metadata.tags, metadata.tagInput), tagInput: "" }); } catch (err: any) { setActionError(err.message); } }} className="stub-btn stub-btn-ghost px-2.5">添加</button></div></div>
              <div className="flex flex-wrap gap-1">{metadata.tags.map((tag, i) => <span key={i} className="stub-pill max-w-full"><span className="truncate">{tag}</span><button type="button" aria-label={`移除标签 ${tag}`} onClick={() => setMetadata((prev) => ({ ...prev, tags: prev.tags.filter((_, index) => index !== i) }))}><X className="w-3 h-3" /></button></span>)}</div>
              <GroupPicker id="detail-group" value={metadata.groupId} fallbackName={activeLink.groupName} onChange={(groupId) => setMetadata((prev) => ({ ...prev, groupId }))} options={groups} canRead={canRead} canManage={canManage} disabled={!!busy || detailLoading} scopeKey={`${detailId}:${token}`} />
              <button type="button" onClick={saveMetadata} className="stub-btn stub-btn-primary w-full py-2">保存标题、标签与分组</button>
            </div> : <div className="flex flex-wrap gap-1">{(activeLink.tags || []).map((tag, i) => <span key={i} className="stub-pill">{tag}</span>)}</div>}
            {canManage && <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
              <div className="font-bold">编辑定时开放窗口</div>
              <p className="text-[11px] text-[var(--ink-3)]">按本机时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 输入。未改保持原值，清空移除边界；清除时间窗后其它访问限制继续生效。</p>
              <div><label htmlFor="detail-active-from" className={labelClass}>开放开始（留空不限制开始）</label><input id="detail-active-from" type="datetime-local" step="1" value={windowForm.activeFrom} onChange={(e) => setWindowForm((prev) => ({ ...prev, activeFrom: e.target.value }))} className={inputClass} /></div>
              <div><label htmlFor="detail-active-until" className={labelClass}>开放结束（留空不限制结束）</label><input id="detail-active-until" type="datetime-local" step="1" value={windowForm.activeUntil} onChange={(e) => setWindowForm((prev) => ({ ...prev, activeUntil: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => setWindowForm({ activeFrom: "", activeUntil: "" })} className="stub-btn stub-btn-ghost py-2">清除时间窗</button><button type="button" onClick={saveWindow} className="stub-btn stub-btn-primary py-2">保存时间窗</button></div>
            </div>}
            <div className="flex flex-wrap gap-2">
              {canReset && <button type="button" onClick={() => { setConfirmation({ type: "reset" }); setActionError(""); }} className="stub-btn stub-btn-ghost py-2 px-2 flex-1"><RotateCcw className="w-3.5 h-3.5" />清零访问计数</button>}
              {canManage && <button type="button" onClick={() => void runOperation(activeLink, "links.manage", "更新状态", () => activeLink.status === "enabled" ? linksApi.disable(activeLink.linkId) : linksApi.enable(activeLink.linkId), activeLink.status === "enabled" ? "短链已停用" : "短链已启用")} className="stub-btn stub-btn-ghost py-2 px-2 flex-1"><Power className="w-3.5 h-3.5" />{activeLink.status === "enabled" ? "停用短链" : "恢复启用"}</button>}
            </div>
            {canReset && <p className="text-[11px] text-[var(--ink-3)]">清零只重置访问计数，不清除口令冷却状态。</p>}
            {canManage && <>
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2"><div className="font-bold">更换短码</div><label htmlFor="detail-code" className={labelClass}>新自定义短码（4–64 位，可选）</label><input id="detail-code" value={customCodeInput} onChange={(e) => setCustomCodeInput(e.target.value)} autoCapitalize="none" className={inputClass} /><div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => requestRotate("generated")} className="stub-btn stub-btn-ghost py-2">随机换码</button><button type="button" disabled={!customCodeInput.trim()} onClick={() => requestRotate("custom")} className="stub-btn stub-btn-primary py-2">指定换码</button></div></div>
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2"><div className="font-bold flex gap-1 items-center"><CalendarClock className="w-3.5 h-3.5" />续期短链</div><p className="text-[11px] text-[var(--ink-3)]">从当前到期时间与现在的较晚者延长，不会缩短现有期限。</p><div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-1.5"><div><label htmlFor="detail-renew-hours" className={labelClass}>延长时长</label><select id="detail-renew-hours" value={renewHours} onChange={(e) => setRenewHours(e.target.value)} className={inputClass}><option value="24">延长 24 小时</option><option value="168">延长 7 天</option><option value="720">延长 30 天</option></select></div><div><label htmlFor="detail-renew-mode" className={labelClass}>短码策略</label><select id="detail-renew-mode" value={renewCodeMode} onChange={(e) => setRenewCodeMode(e.target.value as "keep" | "generated")} className={inputClass}><option value="keep">保留原短码</option><option value="generated">换随机码（原码失效）</option></select></div></div><button type="button" disabled={!activeLink.expiresAt} onClick={handleRenew} className="stub-btn stub-btn-primary w-full py-2">{activeLink.expiresAt ? "确认续期" : "永久有效，无需续期"}</button></div>
            </>}
          </fieldset>
          {confirmation && <div ref={confirmationRef} tabIndex={-1} className="p-3 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] space-y-2" role="group" aria-label="确认短链操作"><p>{confirmation.type === "reset" ? "确认清零访问计数？操作不可撤销，历史日志保留；只清计数，不清口令冷却状态。" : `确认更换${confirmation.strategy === "custom" ? `为 /r/${confirmation.code}` : "随机短码"}？操作不可撤销，原短码将失效，历史日志保留。`}</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={!!busy} onClick={() => { setConfirmation(null); setActionError(""); }} className="stub-btn stub-btn-ghost py-2">取消</button><button type="button" disabled={!!busy} onClick={confirmOperation} className="stub-btn stub-btn-accent py-2">{busy ? "处理中…" : "确认操作"}</button></div></div>}
          {busy && <p role="status">正在{busy}…</p>}
          {actionError && <p role="alert" className="text-[var(--err)]">{actionError}；可重试，已保留填写内容。</p>}
        </>}
      </div>
    </BottomSheet>
  </div>;
}
