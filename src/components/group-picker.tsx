import { useEffect, useRef, useState } from "react";
import { groupsApi } from "../services/api";
import type { GroupDTO } from "../services/api/types";
import { useAuthStore } from "../stores/auth-store";
import { usePagedOptions } from "../hooks/use-paged-options";

const groupId = (group: GroupDTO) => group.groupId;
const fetchGroups = (_query: string, page: number, pageSize: number) => groupsApi.list({ page, pageSize });
const inputClass = "w-full min-w-0 px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs";

export function useLinkGroups(enabled: boolean, scopeKey: string) {
  return usePagedOptions({ enabled, scopeKey, fetchPage: fetchGroups, getId: groupId, pageSize: 50 });
}

type GroupOptions = ReturnType<typeof useLinkGroups>;

export function GroupPicker({ id, value, fallbackName, onChange, options, canRead, canManage, disabled, scopeKey }: {
  id: string;
  value: string | null;
  fallbackName?: string | null;
  onChange: (groupId: string | null) => void;
  options: GroupOptions;
  canRead: boolean;
  canManage: boolean;
  disabled?: boolean;
  scopeKey: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdGroup, setCreatedGroup] = useState<GroupDTO | null>(null);
  const operation = useRef(0);
  const lock = useRef(false);
  const currentScope = useRef(scopeKey);
  if (currentScope.current !== scopeKey) {
    currentScope.current = scopeKey;
    operation.current++;
    lock.current = false;
  }
  useEffect(() => {
    setCreating(false);
    setName("");
    setBusy(false);
    setError("");
    setCreatedGroup(null);
    return () => { operation.current++; lock.current = false; };
  }, [scopeKey]);

  const create = async () => {
    if (lock.current || disabled) return;
    if (!useAuthStore.getState().hasPermission("links.manage")) { setError("当前账号没有新建分组的权限"); return; }
    const normalizedName = name.trim();
    if (!normalizedName) { setError("请输入分组名称"); return; }
    const version = ++operation.current;
    const token = useAuthStore.getState().token;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const group = await groupsApi.create({ name: normalizedName });
      if (operation.current !== version || useAuthStore.getState().token !== token) return;
      options.upsert(group);
      setCreatedGroup(group);
      onChange(group.groupId);
      setName("");
      setCreating(false);
    } catch (err: unknown) {
      if (operation.current === version) setError(err instanceof Error ? err.message : "新建分组失败，请重试");
    } finally {
      if (operation.current === version) { lock.current = false; setBusy(false); }
    }
  };

  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-[11px] font-mono text-[var(--ink-3)]">所属分组</label>
    <select id={id} value={value ?? ""} disabled={disabled || busy} onChange={(event) => onChange(event.target.value || null)} className={inputClass}>
      <option value="">未分组</option>
      {value && !options.items.some((group) => group.groupId === value) && <option value={value}>{createdGroup?.groupId === value ? createdGroup.name : fallbackName || "当前分组"}</option>}
      {options.items.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
    </select>
    {!canRead ? <p role="status" className="text-[11px] text-[var(--ink-3)]">当前账号没有读取分组的权限。</p>
      : options.loading ? <p role="status" className="text-[11px] text-[var(--ink-3)]">正在加载分组…</p>
      : options.error ? <div role="alert" className="text-[11px] text-[var(--err)]">分组加载失败：{options.error} <button type="button" disabled={disabled} onClick={options.retry} className="underline">重试分组</button></div>
      : options.loaded && options.items.length === 0 && <p role="status" className="text-[11px] text-[var(--ink-3)]">暂无分组，可保持未分组。</p>}
    {canRead && options.hasMore && <button type="button" disabled={options.loading || disabled} onClick={options.loadMore} className="underline text-[11px]">加载更多分组</button>}
    {canManage && (options.total >= 50 ? <p className="text-[11px] text-[var(--ink-3)]">已达到 50 个分组上限。</p> : creating ? <div className="p-2 rounded-sm border border-[var(--line)] space-y-1.5">
      <label htmlFor={`${id}-new`} className="block text-[11px]">新分组名称</label>
      <input id={`${id}-new`} value={name} disabled={disabled || busy} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void create(); } }} className={inputClass} />
      <div className="flex gap-1.5"><button type="button" disabled={disabled || busy || !name.trim()} onClick={() => void create()} className="stub-btn stub-btn-ghost px-2.5 py-1.5">{busy ? "新建中…" : "新建并选中"}</button><button type="button" disabled={disabled || busy} onClick={() => { setCreating(false); setName(""); setError(""); }} className="stub-btn stub-btn-ghost px-2.5 py-1.5">取消</button></div>
    </div> : <button type="button" disabled={disabled || busy} onClick={() => setCreating(true)} className="stub-btn stub-btn-ghost px-2.5 py-1.5 text-[11px]">新建分组</button>)}
    {error && <p role="alert" className="text-[11px] text-[var(--err)]">{error}</p>}
  </div>;
}
