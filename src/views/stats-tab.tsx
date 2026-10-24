import { useEffect, useState } from "react";
import { App } from "antd";
import { Plus, Layers, Power, Trash2 } from "lucide-react";
import { logsApi, templatesApi } from "../services/api";
import type {
  AccessEvent,
  AnalyticsResponse,
  AuditEvent,
  LinkRulesInput,
  TemplateListItem,
} from "../services/api/types";
import { useAuthStore } from "../stores/auth-store";
import { formatDateTime, formatReasonLabel } from "../lib/format";
import { BottomSheet } from "../components/bottom-sheet";

export function StatsTab() {
  const { message } = App.useApp();
  const user = useAuthStore((s) => s.user);

  const [section, setSection] = useState<"analytics" | "templates">("analytics");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [overview, setOverview] = useState<AnalyticsResponse | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [logMode, setLogMode] = useState<"access" | "audit">("access");

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [includeDeletedTpl, setIncludeDeletedTpl] = useState(false);
  const [tplSheetOpen, setTplSheetOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<TemplateListItem | null>(null);

  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplMaxVisits, setTplMaxVisits] = useState("20");
  const [tplRequirePassword, setTplRequirePassword] = useState(false);
  const [tplAllowedIps, setTplAllowedIps] = useState("");

  const loadAnalytics = async () => {
    try {
      const [ov, acc, aud] = await Promise.all([
        logsApi.analyticsSummary({ range }),
        logsApi.access({ page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
        logsApi.audit({ page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
      ]);
      setOverview(ov);
      setAccessLogs(acc.items || []);
      setAuditLogs(aud.items || []);
    } catch (err: any) {
      message.error(err?.message || "加载统计数据失败");
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await templatesApi.list({
        includeDeleted: includeDeletedTpl,
        page: 1,
        pageSize: 50,
      });
      setTemplates(res.items || []);
    } catch (err: any) {
      message.error(err?.message || "加载规则模板失败");
    }
  };

  useEffect(() => {
    if (section === "analytics") {
      loadAnalytics();
    } else {
      loadTemplates();
    }
  }, [section, range, includeDeletedTpl]);

  const handleSaveTemplate = async () => {
    if (!editingTpl && !tplName.trim()) {
      message.warning("请填写规则模板名称");
      return;
    }
    const visits = tplMaxVisits.trim() ? Number(tplMaxVisits) : 0;
    const rules: LinkRulesInput = {
      maxVisits: visits > 0 ? visits : 0,
      allowedIpCidrs: tplAllowedIps
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      requirePassword: tplRequirePassword,
      wrongPasswordPolicy: tplRequirePassword
        ? { strategy: "progressive_cooldown" }
        : undefined,
    };

    try {
      if (editingTpl) {
        const ver = await templatesApi.createVersion(editingTpl.templateId, {
          changeNote: tplDesc.trim() || undefined,
          rules,
        });
        message.success(`已发布不可变新版本 v${ver.version}`);
      } else {
        const created = await templatesApi.create({
          workspaceId: user?.defaultWorkspaceId || "default",
          name: tplName.trim(),
          description: tplDesc.trim() || undefined,
          rules,
        });
        message.success(`模板「${created.name}」已创建 (v${created.latestVersion})`);
      }
      setTplSheetOpen(false);
      setEditingTpl(null);
      loadTemplates();
    } catch (err: any) {
      message.error(err?.message || "保存规则模板失败");
    }
  };

  const handleToggleTpl = async (tpl: TemplateListItem) => {
    try {
      if (tpl.status === "active") {
        await templatesApi.disable(tpl.templateId);
        message.success("已停用模板");
      } else {
        await templatesApi.enable(tpl.templateId);
        message.success("已启用模板");
      }
      loadTemplates();
    } catch (err: any) {
      message.error(err?.message || "操作失败");
    }
  };

  const handleDeleteTpl = async (tpl: TemplateListItem) => {
    try {
      await templatesApi.remove(tpl.templateId);
      message.success("已移入 7 天回收站");
      loadTemplates();
    } catch (err: any) {
      message.error(err?.message || "操作失败");
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Top Sub-Switch: 统计与日志 vs 规则模板 */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] text-xs">
        <button
          type="button"
          onClick={() => setSection("analytics")}
          className={`py-1.5 rounded-sm font-bold ${
            section === "analytics"
              ? "bg-[var(--ink)] text-[var(--bg)]"
              : "text-[var(--ink-3)]"
          }`}
        >
          访问统计与审计日志
        </button>
        <button
          type="button"
          onClick={() => setSection("templates")}
          className={`py-1.5 rounded-sm font-bold ${
            section === "templates"
              ? "bg-[var(--ink)] text-[var(--bg)]"
              : "text-[var(--ink-3)]"
          }`}
        >
          规则模板版本库
        </button>
      </div>

      {section === "analytics" ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold">放行 vs 拦截趋势</span>
            <div className="flex gap-1">
              {(["24h", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`stub-pill cursor-pointer ${
                    range === r ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : ""
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {overview && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">成功放行 · REDIRECT</div>
                <div className="text-lg font-extrabold font-mono text-[var(--ok)] mt-0.5">
                  {overview.totals.redirectCount}
                </div>
              </div>
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">规则拦截 · FAILURE</div>
                <div className="text-lg font-extrabold font-mono text-[var(--err)] mt-0.5">
                  {overview.totals.failureCount}
                </div>
              </div>
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">总请求数 · REQUESTS</div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {overview.totals.requestCount}
                </div>
              </div>
              <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-elev)]">
                <div className="text-[10px] font-mono text-[var(--ink-3)]">访问尝试 · ATTEMPTS</div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {overview.totals.visitAttemptCount}
                </div>
              </div>
            </div>
          )}

          {overview && overview.failureReasons && overview.failureReasons.length > 0 && (
            <div className="m-ticket">
              <div className="text-xs font-extrabold mb-2">拦截原因分布 · Failure Reasons</div>
              <div className="space-y-1.5">
                {overview.failureReasons.map((fr) => (
                  <div
                    key={fr.reason}
                    className="flex items-center justify-between text-xs font-mono"
                  >
                    <span>{formatReasonLabel(fr.reason)}</span>
                    <span className="stub-pill stub-pill-err">{fr.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="m-ticket">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold">实时流水 · Logs</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setLogMode("access")}
                  className={`stub-pill cursor-pointer ${
                    logMode === "access"
                      ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                      : ""
                  }`}
                >
                  访问日志 ({accessLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogMode("audit")}
                  className={`stub-pill cursor-pointer ${
                    logMode === "audit"
                      ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                      : ""
                  }`}
                >
                  操作审计 ({auditLogs.length})
                </button>
              </div>
            </div>

            {logMode === "access" ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {accessLogs.slice(0, 20).map((log) => (
                  <div
                    key={log.eventId}
                    className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <div className="min-w-0">
                      <div className="font-bold truncate">
                        {log.linkId} · {log.sourceIp || "-"}
                      </div>
                      <div className="text-[10px] text-[var(--ink-3)]">
                        {formatDateTime(log.accessedAt)}
                      </div>
                    </div>
                    <span
                      className={`stub-pill shrink-0 ${
                        log.result === "allowed" ? "stub-pill-ok" : "stub-pill-err"
                      }`}
                    >
                      {formatReasonLabel(log.reason || log.result)}
                    </span>
                  </div>
                ))}
                {accessLogs.length === 0 && (
                  <div className="text-center py-4 text-xs font-mono text-[var(--ink-3)]">
                    暂无访问记录
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {auditLogs.slice(0, 20).map((log) => (
                  <div
                    key={log.eventId}
                    className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <div className="min-w-0">
                      <div className="font-bold truncate">{log.action}</div>
                      <div className="text-[10px] text-[var(--ink-3)]">
                        {log.resourceType || "-"}:{log.resourceId || "-"} ·{" "}
                        {formatDateTime(log.occurredAt)}
                      </div>
                    </div>
                    <span className="stub-pill shrink-0">{log.sourceIp || "-"}</span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="text-center py-4 text-xs font-mono text-[var(--ink-3)]">
                    暂无审计日志
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Rule Templates View */
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIncludeDeletedTpl((v) => !v)}
              className={`stub-pill cursor-pointer ${
                includeDeletedTpl ? "stub-pill-warn" : ""
              }`}
            >
              {includeDeletedTpl ? "含回收站模板" : "显示 7 天回收站"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTpl(null);
                setTplName("");
                setTplDesc("");
                setTplSheetOpen(true);
              }}
              className="stub-btn stub-btn-accent px-3 py-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> 新建模板
            </button>
          </div>

          {templates.map((tpl) => (
            <div key={tpl.templateId} className="m-ticket">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                    {tpl.name}
                    <span className="stub-pill stub-pill-accent">v{tpl.latestVersion}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5">
                    关联短链：{tpl.referencedLinkCount} 条
                  </div>
                </div>
                <span
                  className={`stub-pill ${
                    tpl.status === "active" ? "stub-pill-ok" : "stub-pill-warn"
                  }`}
                >
                  {tpl.status}
                </span>
              </div>

              <div className="m-ticket-meta">
                <span>更新于 {formatDateTime(tpl.updatedAt)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTpl(tpl);
                      setTplDesc("");
                      setTplSheetOpen(true);
                    }}
                    className="stub-btn stub-btn-primary px-2 py-1 text-[11px]"
                  >
                    发新版本 v{tpl.latestVersion + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTpl(tpl)}
                    className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"
                  >
                    <Power className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTpl(tpl)}
                    className="stub-btn stub-btn-ghost px-2 py-1 text-[11px]"
                  >
                    <Trash2 className="w-3 h-3 text-[var(--err)]" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="m-ticket text-center py-8 text-xs font-mono text-[var(--ink-3)]">
              暂无规则模板，点击右上角「新建模板」复用交付策略
            </div>
          )}
        </div>
      )}

      {/* Create / Publish Version Sheet */}
      <BottomSheet
        open={tplSheetOpen}
        onClose={() => setTplSheetOpen(false)}
        title={
          editingTpl
            ? `发布新版本 · ${editingTpl.name} -> v${editingTpl.latestVersion + 1}`
            : "新建规则模板 (v1)"
        }
        subtitle="每次修改生成不可变新版本号"
      >
        <div className="space-y-2.5 text-xs">
          {!editingTpl && (
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                模板名称
              </label>
              <input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="例如：外包交付统一规则"
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              版本变更备注（可选）
            </label>
            <input
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="备注本次规则调整说明"
              className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                访问上限 (次，0为不限)
              </label>
              <input
                type="number"
                value={tplMaxVisits}
                onChange={(e) => setTplMaxVisits(e.target.value)}
                placeholder="0 为不限次数"
                className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                IP CIDR 白名单（可选）
              </label>
              <input
                value={tplAllowedIps}
                onChange={(e) => setTplAllowedIps(e.target.value)}
                placeholder="逗号分隔"
                className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={tplRequirePassword}
              onChange={(e) => setTplRequirePassword(e.target.checked)}
            />
            <span>要求短链创建时必须配置访问口令 (requirePassword)</span>
          </label>
          <button
            type="button"
            onClick={handleSaveTemplate}
            className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
          >
            {editingTpl ? `确认发布 v${editingTpl.latestVersion + 1}` : "确认创建模板 v1"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
