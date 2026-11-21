import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { Flame, Package, Globe, Sparkles, X } from "lucide-react";
import { assetsApi, linksApi, templatesApi } from "../services/api";
import type { AssetDTO, LinkDTO, LinkRules, TemplateListItem } from "../services/api/types";
import { buildPublicShortUrl, formatDateTime } from "../lib/format";
import { buildCreateLinkRequest, hasWindowEnded, initialCreateForm, linkMetadata, randomAccessPassword, safeInteger } from "../lib/link-form";
import type { CreateLinkForm } from "../lib/link-form";
import { useAuthStore } from "../stores/auth-store";
import { useCopy } from "../hooks/use-copy";
import { mergeOptionsById, usePagedOptions } from "../hooks/use-paged-options";
import { GroupPicker, useLinkGroups } from "./group-picker";
import { BottomSheet, MobileQRModal } from "./bottom-sheet";

const assetId = (asset: AssetDTO) => asset.assetId;
const templateId = (template: TemplateListItem) => template.templateId;
const fetchAssets = (keyword: string, page: number, pageSize: number) => assetsApi.list({ includeDeleted: false, keyword: keyword || undefined, page, pageSize });
const fetchTemplates = (keyword: string, page: number, pageSize: number) => templatesApi.list({ includeDeleted: false, status: "active", keyword: keyword || undefined, page, pageSize });

const inputClass = "w-full min-w-0 px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs";
const labelClass = "block text-[11px] font-mono text-[var(--ink-3)] mb-1";

export function MobileCreateSheet({ open, onClose, onCreated, presetUrl, presetAsset, sourceLink }: {
  open: boolean;
  onClose: () => void;
  onCreated: (link: LinkDTO) => void;
  presetUrl?: string;
  presetAsset?: AssetDTO | null;
  sourceLink?: LinkDTO | null;
}) {
  const { message } = App.useApp();
  const copy = useCopy();
  const { hasPermission, initialized, user, token } = useAuthStore();
  const canCreateUrl = initialized && hasPermission("links.create_url");
  const canCreateAsset = initialized && hasPermission("links.create_asset");
  const canReadAssets = initialized && hasPermission("assets.read");
  const canUseTemplates = initialized && hasPermission("templates.read_use");
  const canReadGroups = initialized && hasPermission("links.read");
  const canManageGroups = initialized && hasPermission("links.manage");
  const [form, setForm] = useState(initialCreateForm);
  const [selectionScope, setSelectionScope] = useState(0);
  const scopeKey = `${selectionScope}:${open}:${token}:${user?.defaultWorkspaceId || ""}`;
  const assetOptions = usePagedOptions({ enabled: open && canReadAssets && form.targetType === "minio_asset", scopeKey, fetchPage: fetchAssets, getId: assetId });
  const templateOptions = usePagedOptions({ enabled: open && canUseTemplates && form.ruleSource === "template", scopeKey, fetchPage: fetchTemplates, getId: templateId });
  const groups = useLinkGroups(open && canReadGroups, scopeKey);
  const [selectedAsset, setSelectedAsset] = useState<AssetDTO | null>(null);
  const [selectedTemplateOption, setSelectedTemplateOption] = useState<TemplateListItem | null>(null);
  const assets = mergeOptionsById(assetOptions.items, selectedAsset ? [selectedAsset] : [], assetId);
  const templates = mergeOptionsById(templateOptions.items, selectedTemplateOption ? [selectedTemplateOption] : [], templateId);
  const [sourceGroupUnconfirmed, setSourceGroupUnconfirmed] = useState(false);
  const [templateResult, setTemplateResult] = useState<{ key: string; rules: LinkRules; version: number } | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [templateRetry, setTemplateRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<LinkDTO | null>(null);
  const sessionRef = useRef(0);
  const submitRef = useRef<number | null>(null);
  const openRef = useRef(open);
  const mountedRef = useRef(true);
  openRef.current = open;
  const update = <K extends keyof CreateLinkForm>(key: K, value: CreateLinkForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; sessionRef.current++; };
  }, []);

  useEffect(() => {
    sessionRef.current++;
    setSelectionScope((value) => value + 1);
    submitRef.current = null;
    setSubmitting(false);
    if (open) {
      const next = initialCreateForm({ source: sourceLink, presetUrl, presetAsset });
      if (!sourceLink && !presetAsset && !presetUrl && !canCreateUrl && canCreateAsset) next.targetType = "minio_asset";
      setForm(next);
      setSelectedAsset(presetAsset || null);
      setSelectedTemplateOption(null);
      setSourceGroupUnconfirmed(!!sourceLink?.groupId);
      setCreatedLink(null);
      setTemplateResult(null);
      setTemplateError("");
    }
    return () => { sessionRef.current++; };
  }, [open, sourceLink, presetUrl, presetAsset]);

  useEffect(() => {
    if (!open || !sourceGroupUnconfirmed || !sourceLink?.groupId) return;
    if (!groups.loaded || groups.loading || groups.error || groups.hasMore) return;
    if (groups.items.some((group) => group.groupId === sourceLink.groupId && group.workspaceId === user?.defaultWorkspaceId)) setSourceGroupUnconfirmed(false);
  }, [open, sourceGroupUnconfirmed, sourceLink, groups.loaded, groups.loading, groups.error, groups.hasMore, groups.items, user?.defaultWorkspaceId]);

  useEffect(() => {
    if (!open || !form.assetId || selectedAsset?.assetId === form.assetId) return;
    const asset = assetOptions.items.find((item) => item.assetId === form.assetId);
    if (asset) setSelectedAsset(asset);
  }, [open, form.assetId, assetOptions.items, selectedAsset]);

  const templateKey = `${form.templateId}:${form.templateMode}:${form.templateVersion}`;
  useEffect(() => {
    setTemplateResult(null);
    setTemplateError("");
    if (!open || form.ruleSource !== "template" || !form.templateId || !canUseTemplates) return;
    let cancelled = false;
    const session = sessionRef.current;
    const load = async () => {
      try {
        const version = form.templateMode === "latest"
          ? (await templatesApi.get(form.templateId)).latestVersion
          : safeInteger(form.templateVersion, 1, "模板版本");
        if (version > 2_147_483_647) throw new Error("模板版本超出有效范围");
        const result = await templatesApi.getVersion(form.templateId, version);
        if (!cancelled && openRef.current && sessionRef.current === session) setTemplateResult({ key: templateKey, rules: result.rules, version: result.version });
      } catch (err: any) {
        if (!cancelled && openRef.current && sessionRef.current === session) setTemplateError(err?.message || "模板版本加载失败");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, selectionScope, form.ruleSource, templateKey, canUseTemplates, templateRetry]);

  const selectedTemplate = templateResult?.key === templateKey ? templateResult : null;
  const needsPassword = form.ruleSource === "template" ? !!selectedTemplate?.rules.requirePassword : form.requirePassword;
  const canCreateTarget = form.targetType === "url" ? canCreateUrl : canCreateAsset;
  const close = () => { sessionRef.current++; assetOptions.invalidate(); templateOptions.invalidate(); groups.invalidate(); onClose(); };
  const switchRules = (ruleSource: "inline" | "template") => {
    setForm((prev) => ({ ...prev, ruleSource, password: "" }));
  };
  const addTag = () => {
    try {
      const metadata = linkMetadata(form.title, form.tags, form.tagInput);
      setForm((prev) => ({ ...prev, tags: metadata.tags, tagInput: "" }));
    } catch (err: any) { message.warning(err.message); }
  };
  const applyPreset = (type: "burn" | "client" | "public") => {
    try {
      const password = type === "burn" ? randomAccessPassword() : "";
      setForm((prev) => ({
        ...prev, ruleSource: "inline", expirationMode: "hours", allowedIps: "",
        maxVisits: type === "burn" ? "1" : type === "client" ? "20" : "-1",
        expireHours: type === "burn" ? "24" : type === "client" ? "168" : "720",
        requirePassword: type === "burn", password, cooldownStrategy: "progressive_cooldown",
      }));
      message.info(type === "burn" ? "已套用阅后即焚预设，请保存新口令" : "已套用场景预设");
    } catch { message.error("无法生成安全随机口令，请手动设置口令"); }
  };

  const handleSubmit = async () => {
    if (submitRef.current !== null) return;
    if (!canCreateTarget) { message.warning("当前账号没有创建此类短链的权限"); return; }
    let payload;
    try {
      if (form.ruleSource === "template" && !canUseTemplates) throw new Error("当前账号没有使用模板的权限");
      if (sourceGroupUnconfirmed && form.groupId) throw new Error("请先确认来源分组属于当前工作区，或选择其他分组、未分组");
      payload = buildCreateLinkRequest(form, selectedTemplate?.rules);
      // Pin the exact version whose password requirement was checked, including latest mode.
      if (payload.ruleSource.template && selectedTemplate) payload.ruleSource.template.version = selectedTemplate.version;
    } catch (err: any) { message.warning(err.message); return; }
    const session = sessionRef.current;
    const token = useAuthStore.getState().token;
    submitRef.current = session;
    setSubmitting(true);
    try {
      const link = await linksApi.create(payload);
      if (!mountedRef.current || useAuthStore.getState().token !== token) return;
      onCreated(link);
      if (sessionRef.current !== session || !openRef.current) return;
      setCreatedLink(link);
      onClose();
      void copy(buildPublicShortUrl(link.code, link.url), "已签发并复制短链");
    } catch (err: any) {
      if (mountedRef.current && sessionRef.current === session && openRef.current) message.error(err?.message || "创建短链失败");
    } finally {
      if (submitRef.current === session) {
        submitRef.current = null;
        if (mountedRef.current) setSubmitting(false);
      }
    }
  };

  return <>
    <BottomSheet open={open} onClose={close} title={sourceLink ? "复制短链配置" : "新建短链票据 · New Stub"} subtitle={sourceLink ? `来源 /r/${sourceLink.code}` : "设置目标与访问规则"}>
      <div className="space-y-3 text-xs">
        {sourceLink && <div className="p-2.5 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] space-y-1" role="note">
          <p>将复制标题、标签、目标和当前生效规则，签发新短码并从零计数，不引用原模板。</p>
          <p>原短码、访问次数和口令均不复制。{sourceLink.rules.requirePassword ? "访问口令仍为必需，请设置新口令。" : "可自行设置新口令。"}</p>
          {sourceLink.expiresAt && !(Date.parse(sourceLink.expiresAt) > Date.now()) && <p className="font-bold">来源已过期，必须选择新的有效期。</p>}
          {sourceLink.activeFrom && <p>原开放开始：{formatDateTime(sourceLink.activeFrom, "YYYY-MM-DD HH:mm:ss.SSS Z")}</p>}
          {sourceLink.activeUntil && <p>原开放结束：{formatDateTime(sourceLink.activeUntil, "YYYY-MM-DD HH:mm:ss.SSS Z")}</p>}
          {hasWindowEnded(sourceLink.activeUntil) && <p className="font-bold">原开放窗口已结束，创建前请明确修改或清除开放结束时间。</p>}
        </div>}
        <div>
          <div className="text-[11px] font-mono text-[var(--ink-3)] mb-1.5 flex items-center gap-1"><Sparkles className="w-3 h-3 text-[var(--accent)]" /> 快捷场景预设</div>
          <div className="grid grid-cols-3 gap-1.5">
            {([{ type: "burn", label: "阅后即焚", hint: "1次 + 新随机口令", Icon: Flame }, { type: "client", label: "客户交付", hint: "7天 / 20次", Icon: Package }, { type: "public", label: "公开分享", hint: "30天不限次", Icon: Globe }] as const).map(({ type, label, hint, Icon }) => <button key={type} type="button" disabled={submitting} onClick={() => applyPreset(type)} className="p-2 min-w-0 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] text-left"><div className="flex items-center flex-wrap gap-1 text-xs font-bold"><Icon className="w-3.5 h-3.5" />{label}</div><div className="text-[10px] text-[var(--ink-3)] mt-0.5">{hint}</div></button>)}
          </div>
        </div>
        <fieldset disabled={submitting} className="space-y-3 min-w-0">
          <div><label htmlFor="create-title" className={labelClass}>标题（可选，最多 120 字符）</label><input id="create-title" value={form.title} onChange={(e) => update("title", e.target.value)} className={inputClass} /></div>
          <div>
            <label htmlFor="create-tag" className={labelClass}>标签（最多 20 个，每个 32 字符）</label>
            <div className="flex gap-1.5"><input id="create-tag" value={form.tagInput} onChange={(e) => update("tagInput", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); } }} placeholder="输入标签后添加" className={inputClass} /><button type="button" onClick={addTag} className="stub-btn stub-btn-ghost px-2.5">添加</button></div>
            <div className="flex flex-wrap gap-1 mt-1.5">{form.tags.map((tag, index) => <span key={index} className="stub-pill max-w-full"><span className="truncate">{tag}</span><button type="button" aria-label={`移除标签 ${tag}`} onClick={() => update("tags", form.tags.filter((_, i) => i !== index))}><X className="w-3 h-3" /></button></span>)}</div>
          </div>
          <GroupPicker id="create-group" value={form.groupId} fallbackName={sourceLink?.groupId === form.groupId ? sourceLink.groupName : undefined} onChange={(groupId) => { setSourceGroupUnconfirmed(false); update("groupId", groupId); }} options={groups} canRead={canReadGroups} canManage={canManageGroups} disabled={submitting} scopeKey={scopeKey} />
          {sourceGroupUnconfirmed && <p role="status" className="text-[11px] text-[var(--ink-3)]">{groups.loading ? "正在确认来源分组…" : groups.error ? "来源分组已保留，加载成功后可继续复制；也可选择未分组。" : !canReadGroups ? "无法读取来源分组，请改选未分组后创建。" : "来源分组不在当前工作区，请选择其他分组或未分组。"}</p>}
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!canCreateUrl} aria-pressed={form.targetType === "url"} onClick={() => update("targetType", "url")} className={`stub-btn py-2 ${form.targetType === "url" ? "stub-btn-primary" : "stub-btn-ghost"}`}>URL 长链跳转</button>
            <button type="button" disabled={!canCreateAsset} aria-pressed={form.targetType === "minio_asset"} onClick={() => update("targetType", "minio_asset")} className={`stub-btn py-2 ${form.targetType === "minio_asset" ? "stub-btn-primary" : "stub-btn-ghost"}`}>MinIO 私有素材</button>
          </div>
          {form.targetType === "url" ? <div><label htmlFor="create-target" className={labelClass}>目标 HTTPS URL</label><input id="create-target" type="url" value={form.targetUrl} onChange={(e) => update("targetUrl", e.target.value)} placeholder="https://example.com/resource" className={inputClass} /></div> : <div>
            <label htmlFor="create-asset-search" className={labelClass}>搜索素材</label>
            <input id="create-asset-search" type="search" value={assetOptions.query} onChange={(event) => assetOptions.setQuery(event.target.value)} disabled={!canReadAssets} placeholder="按素材名称或路径搜索" className={inputClass} />
            <label htmlFor="create-asset" className={`${labelClass} mt-2`}>私有素材</label>
            <select id="create-asset" value={form.assetId} onChange={(event) => { const id = event.target.value; setSelectedAsset(assets.find((asset) => asset.assetId === id) || null); update("assetId", id); }} className={inputClass}><option value="">请选择素材</option>{form.assetId && !assets.some((asset) => asset.assetId === form.assetId) && <option value={form.assetId}>当前素材</option>}{assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>[{asset.businessId}] {asset.fileName || asset.path}</option>)}</select>
            {!canReadAssets ? <p role="status" className="text-[11px] text-[var(--ink-3)] mt-1.5">当前账号没有读取素材的权限。已带入的素材仍可提交校验。</p> : <>
              {assetOptions.loading && <p role="status" className="text-[11px] text-[var(--ink-3)] mt-1.5">正在加载素材…</p>}
              {assetOptions.error && <div role="alert" className="text-[11px] text-[var(--err)] mt-1.5">素材加载失败：{assetOptions.error} <button type="button" disabled={assetOptions.loading} onClick={assetOptions.retry} className="underline">重试素材</button></div>}
              {!assetOptions.loading && !assetOptions.error && assetOptions.loaded && assetOptions.items.length === 0 && <p role="status" className="text-[11px] text-[var(--ink-3)] mt-1.5">{assetOptions.query.trim() ? "没有匹配的素材。" : "暂无可选素材。"}{selectedAsset && "已选素材保留。"}</p>}
              {assetOptions.hasMore && !assetOptions.error && <button type="button" disabled={assetOptions.loading} onClick={assetOptions.loadMore} className="stub-btn stub-btn-ghost w-full py-1.5 mt-1.5">{assetOptions.loading ? "加载中…" : "加载更多素材"}</button>}
            </>}
          </div>}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            <div><label htmlFor="create-code-mode" className={labelClass}>短码生成方式</label><select id="create-code-mode" value={form.codeMode} onChange={(e) => update("codeMode", e.target.value as CreateLinkForm["codeMode"])} className={inputClass}><option value="generated">随机短码</option><option value="custom">自定义短码</option></select></div>
            <div><label htmlFor="create-expire" className={labelClass}>有效期时长</label><select id="create-expire" value={form.expirationMode === "source" ? "source" : form.expireHours} onChange={(e) => setForm((prev) => ({ ...prev, expirationMode: e.target.value === "source" ? "source" : "hours", expireHours: e.target.value === "source" ? prev.expireHours : e.target.value }))} className={inputClass}>
              <option value="" disabled>请选择新有效期</option>
              {sourceLink && (!form.sourceExpiresAt || Date.parse(form.sourceExpiresAt) > Date.now()) && <option value="source">{form.sourceExpiresAt ? `沿用至 ${formatDateTime(form.sourceExpiresAt)}` : "沿用永不过期"}</option>}
              <option value="1">1 小时后过期</option><option value="24">24 小时后过期</option><option value="72">3 天后过期</option><option value="168">7 天后过期</option><option value="720">30 天后过期</option><option value="0">永不过期</option>
            </select></div>
          </div>
          {form.codeMode === "custom" && <div><label htmlFor="create-code" className={labelClass}>自定义短码（4–64 位字母、数字、连字符）</label><input id="create-code" value={form.customCode} onChange={(e) => update("customCode", e.target.value)} className={inputClass} autoCapitalize="none" /></div>}
          <div className="space-y-2.5 p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
            <div className="font-bold">定时开放窗口（可选）</div>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-1.5">
              <div><label htmlFor="create-active-from" className={labelClass}>开放开始（本机时区）</label><input id="create-active-from" type="datetime-local" step="1" value={form.activeFrom} onChange={(e) => update("activeFrom", e.target.value)} className={inputClass} /></div>
              <div><label htmlFor="create-active-until" className={labelClass}>开放结束（本机时区）</label><input id="create-active-until" type="datetime-local" step="1" value={form.activeUntil} onChange={(e) => update("activeUntil", e.target.value)} className={inputClass} /></div>
            </div>
            <p className="text-[11px] text-[var(--ink-3)]">开放区间为 [开始, 结束)，留空表示不限制；实际截止取开放结束与短链到期的较早者。当前时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            {(form.activeFrom || form.activeUntil) && <button type="button" onClick={() => setForm((prev) => ({ ...prev, activeFrom: "", activeUntil: "" }))} className="stub-btn stub-btn-ghost w-full py-1.5">清除时间窗</button>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" aria-pressed={form.ruleSource === "inline"} onClick={() => switchRules("inline")} className={`stub-btn py-2 ${form.ruleSource === "inline" ? "stub-btn-primary" : "stub-btn-ghost"}`}>独立内联规则</button>
            <button type="button" disabled={!canUseTemplates} aria-pressed={form.ruleSource === "template"} onClick={() => switchRules("template")} className={`stub-btn py-2 ${form.ruleSource === "template" ? "stub-btn-primary" : "stub-btn-ghost"}`}>绑定规则模板</button>
          </div>
          {form.ruleSource === "inline" ? <div className="space-y-2.5 p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
            <div><label htmlFor="create-visits" className={labelClass}>访问上限（空或 -1 不限，0 禁止访问）</label><input id="create-visits" type="number" min={-1} step={1} value={form.maxVisits} onChange={(e) => update("maxVisits", e.target.value)} placeholder="留空不限次数" className={inputClass} /></div>
            <div><label htmlFor="create-ips" className={labelClass}>IP CIDR 白名单（逗号分隔，空表示不限）</label><input id="create-ips" value={form.allowedIps} onChange={(e) => update("allowedIps", e.target.value)} className={inputClass} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.requirePassword} onChange={(e) => setForm((prev) => ({ ...prev, requirePassword: e.target.checked, password: "" }))} />要求访问口令{sourceLink?.rules.requirePassword && "（复制后需设置新口令）"}</label>
            {form.requirePassword && <div><label htmlFor="create-policy" className={labelClass}>输错冷却策略</label><select id="create-policy" value={form.cooldownStrategy} onChange={(e) => update("cooldownStrategy", e.target.value as CreateLinkForm["cooldownStrategy"])} className={inputClass}><option value="progressive_cooldown">渐进冷却</option><option value="fixed_cooldown">固定冷却</option></select></div>}
          </div> : <div className="space-y-2.5 p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)]">
            <div><label htmlFor="create-template-search" className={labelClass}>搜索模板</label><input id="create-template-search" type="search" value={templateOptions.query} disabled={!canUseTemplates} onChange={(event) => templateOptions.setQuery(event.target.value)} placeholder="按模板名称搜索" className={inputClass} /></div>
            <div><label htmlFor="create-template" className={labelClass}>规则模板</label><select id="create-template" value={form.templateId} onChange={(event) => {
              const id = event.target.value;
              const option = templates.find((template) => template.templateId === id) || null;
              setSelectedTemplateOption(option);
              setForm((prev) => ({ ...prev, templateId: id, templateVersion: String(option?.latestVersion || 1), password: "" }));
            }} className={inputClass}><option value="">请选择规则模板</option>{form.templateId && !templates.some((template) => template.templateId === form.templateId) && <option value={form.templateId}>当前模板</option>}{templates.map((template) => <option key={template.templateId} value={template.templateId}>{template.name}（最新 v{template.latestVersion}）</option>)}</select></div>
            {!canUseTemplates ? <p role="status">当前账号没有使用模板的权限。</p> : <>
              {templateOptions.loading && <p role="status">正在加载模板…</p>}
              {templateOptions.error && <div role="alert">模板加载失败：{templateOptions.error} <button type="button" disabled={templateOptions.loading} onClick={templateOptions.retry} className="underline">重试模板列表</button></div>}
              {!templateOptions.loading && !templateOptions.error && templateOptions.loaded && templateOptions.items.length === 0 && <p role="status">{templateOptions.query.trim() ? "没有匹配的模板。" : "暂无可选模板。"}{selectedTemplateOption && "当前模板保留。"}</p>}
              {templateOptions.hasMore && !templateOptions.error && <button type="button" disabled={templateOptions.loading} onClick={templateOptions.loadMore} className="stub-btn stub-btn-ghost w-full py-1.5">{templateOptions.loading ? "加载中…" : "加载更多模板"}</button>}
            </>}
            <div><label htmlFor="create-template-mode" className={labelClass}>模板版本</label><select id="create-template-mode" value={form.templateMode} onChange={(e) => setForm((prev) => ({ ...prev, templateMode: e.target.value as CreateLinkForm["templateMode"], password: "" }))} className={inputClass}><option value="latest">使用当前最新版本（创建后固定）</option><option value="version">指定版本</option></select></div>
            {form.templateMode === "version" && <div><label htmlFor="create-template-version" className={labelClass}>指定版本号</label><input id="create-template-version" type="number" min={1} step={1} value={form.templateVersion} onChange={(e) => setForm((prev) => ({ ...prev, templateVersion: e.target.value, password: "" }))} className={inputClass} /></div>}
            {templateError ? <div role="alert">{templateError} <button type="button" className="underline" onClick={() => setTemplateRetry((n) => n + 1)}>重试模板版本</button></div> : form.templateId && !selectedTemplate ? <p role="status">正在加载选中版本规则…</p> : selectedTemplate && <p role="status">已加载 v{selectedTemplate.version}：{needsPassword ? "必须设置访问口令" : "无需口令，不发送口令字段"}</p>}
          </div>}
          {needsPassword && <div><label htmlFor="create-password" className={labelClass}>新的访问口令（最多 1024 字节，请妥善保存）</label><input id="create-password" type="text" autoComplete="off" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="请输入新口令" className={inputClass} /></div>}
        </fieldset>
        {!canCreateTarget && <p role="alert">当前账号没有创建此类短链的权限。</p>}
        <button type="button" disabled={submitting || !canCreateTarget || sourceGroupUnconfirmed || (form.ruleSource === "template" && !selectedTemplate)} onClick={handleSubmit} className="stub-btn stub-btn-accent w-full py-2.5 text-sm">{submitting ? "签发中…" : "签发短链并复制"}</button>
      </div>
    </BottomSheet>
    <MobileQRModal open={!!createdLink} onClose={() => setCreatedLink(null)} code={createdLink?.code || ""} shortUrl={createdLink ? buildPublicShortUrl(createdLink.code, createdLink.url) : ""} targetLabel={createdLink?.target.url || createdLink?.target.assetId || ""} />
  </>;
}
