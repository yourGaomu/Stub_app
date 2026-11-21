import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "../hooks/use-notifications";
import type { NotificationSettings } from "../services/notification-api";
import { BottomSheet } from "./bottom-sheet";

export function NotificationCenter({ token, onOpenLink }: { token: string; onOpenLink: (linkId: string) => void }) {
  const inbox = useNotifications(token);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(inbox.settings), [inbox.settings]);

  const patch: Partial<NotificationSettings> = {};
  if (draft && inbox.settings) {
    if (draft.expiryEnabled !== inbox.settings.expiryEnabled) patch.expiryEnabled = draft.expiryEnabled;
    if (draft.visitsEnabled !== inbox.settings.visitsEnabled) patch.visitsEnabled = draft.visitsEnabled;
  }
  const hasUnread = inbox.unreadCount > 0 || inbox.items.some((item) => !item.readAt);
  const refreshError = inbox.error || inbox.countError || inbox.settingsError;

  return <>
    <button type="button" aria-label={`通知，${inbox.unreadCount} 条未读`} onClick={() => { setOpen(true); inbox.refresh(unreadOnly); }} className="stub-btn stub-btn-ghost px-2 py-1.5 text-xs">
      <Bell className="h-4 w-4" /><span>{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>
    </button>
    {open && createPortal(<BottomSheet open onClose={() => setOpen(false)} title="通知与提醒">
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={unreadOnly} disabled={inbox.busy} onChange={(event) => { setUnreadOnly(event.target.checked); inbox.refresh(event.target.checked); }} />仅未读</label>
          <button type="button" disabled={inbox.loading || inbox.busy} onClick={() => inbox.refresh(unreadOnly)} className="stub-btn stub-btn-ghost px-2 py-1">刷新</button>
          <button type="button" disabled={inbox.busy || !hasUnread} onClick={() => void inbox.readAll()} className="stub-btn stub-btn-ghost px-2 py-1">全部已读</button>
        </div>
        {refreshError && <p role="alert" className="text-[var(--err)]">{refreshError} <button type="button" className="underline" disabled={inbox.loading || inbox.busy} onClick={inbox.retry}>重试加载</button></p>}
        {inbox.operationError && <p role="alert" className="text-[var(--err)]">{inbox.operationError}</p>}
        {inbox.loading && <p role="status">正在加载通知…</p>}
        {!inbox.loading && !inbox.error && inbox.items.length === 0 && <p className="py-5 text-center text-[var(--ink-3)]">{unreadOnly ? "暂无未读通知" : "暂无通知"}</p>}
        <ul className="space-y-2">
          {inbox.items.map((item) => {
            const linkId = item.linkId;
            return <li key={item.notificationId} className="rounded-sm border border-[var(--line)] bg-[var(--bg-elev)] p-2.5">
              <div className="flex items-start justify-between gap-2"><b className="break-words">{item.title}</b>{!item.readAt && <span className="shrink-0 text-[var(--accent)]">未读</span>}</div>
              <p className="mt-1 break-words text-[var(--ink-2)]">{item.summary}</p>
              <time dateTime={item.createdAt} className="mt-1 block text-[10px] text-[var(--ink-3)]">{new Date(item.createdAt).toLocaleString()}</time>
              <div className="mt-2 flex flex-wrap gap-2">
                {!item.readAt && <button type="button" disabled={inbox.busy} onClick={() => void inbox.markRead(item)} className="stub-btn stub-btn-ghost px-2 py-1">标为已读</button>}
                {linkId && <button type="button" disabled={inbox.busy} onClick={async () => {
                  if (await inbox.markRead(item)) {
                    setOpen(false);
                    onOpenLink(linkId);
                  }
                }} className="stub-btn stub-btn-primary px-2 py-1">查看短链</button>}
              </div>
            </li>;
          })}
        </ul>
        {inbox.hasMore && <button type="button" disabled={!!inbox.error || inbox.loading || inbox.busy} onClick={inbox.loadMore} className="stub-btn stub-btn-ghost w-full py-2">加载更多通知</button>}
        {draft && <fieldset disabled={inbox.busy} className="space-y-2 rounded-sm border border-[var(--line)] p-2.5">
          <legend className="px-1 font-bold">站内提醒设置</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.expiryEnabled} onChange={(event) => { setSaved(false); setDraft({ ...draft, expiryEnabled: event.target.checked }); }} />截止前 24 小时提醒</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft.visitsEnabled} onChange={(event) => { setSaved(false); setDraft({ ...draft, visitsEnabled: event.target.checked }); }} />次数使用达到 80% 提醒</label>
          <button type="button" disabled={inbox.busy || !Object.keys(patch).length} onClick={async () => { if (await inbox.updateSettings(patch)) setSaved(true); }} className="stub-btn stub-btn-primary px-3 py-1.5">保存设置</button>
          {saved && <p role="status" className="text-[var(--ok)]">提醒设置已保存</p>}
          <p className="text-[10px] text-[var(--ink-3)]">关闭提醒后，历史通知仍可查阅。</p>
        </fieldset>}
      </div>
    </BottomSheet>, document.body)}
  </>;
}
