import { useEffect, useState } from "react";
import { App } from "antd";
import {
  Smartphone,
  Monitor,
  Palette,
  Ticket,
  ShieldAlert,
  Users,
  Database,
  LogOut,
  Plus,
  Copy,
  Sun,
  Moon,
} from "lucide-react";
import { adminApi, authApi, invitesApi } from "../services/api";
import type {
  AdminUserItem,
  BusinessDTO,
  InviteDTO,
  RegistrationSettings,
  Session,
  UnknownShortCodeEvent,
} from "../services/api/types";
import { useAuthStore } from "../stores/auth-store";
import { useThemeStore } from "../stores/theme-store";
import { bytesToMB, formatDateTime, formatRelative, mbToBytes } from "../lib/format";
import { useCopy } from "../hooks/use-copy";
import { BottomSheet } from "../components/bottom-sheet";

const ALL_PERMISSION_OPTIONS: { code: string; label: string }[] = [
  { code: "links.read", label: "读取短链与趋势" },
  { code: "links.create_url", label: "创建 URL 短链" },
  { code: "links.create_asset", label: "创建素材短链" },
  { code: "links.manage", label: "管理/续期/换码" },
  { code: "links.reset_visits", label: "清零访问计数" },
  { code: "assets.read", label: "读取素材" },
  { code: "assets.upload", label: "上传素材" },
  { code: "assets.delete", label: "软删素材" },
  { code: "assets.restore", label: "恢复素材" },
  { code: "templates.read_use", label: "使用规则模板" },
  { code: "templates.manage", label: "管理规则模板" },
  { code: "invites.create_revoke", label: "签发/吊销邀请码" },
  { code: "logs.read_own", label: "查看访问与审计日志" },
];

export function MeTab() {
  const { message } = App.useApp();
  const copy = useCopy();
  const { user, isAdmin, expiresAt, permissionItems, businesses: myBusinesses, logout } =
    useAuthStore();
  const { dark, toggleTheme } = useThemeStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [invites, setInvites] = useState<InviteDTO[]>([]);
  const [inviteTTL, setInviteTTL] = useState<"1h" | "1d" | "3d" | "7d">("7d");
  const [newPlainInvite, setNewPlainInvite] = useState<string>("");

  const [adminTab, setAdminTab] = useState<"users" | "businesses" | "security">("users");
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [businesses, setBusinesses] = useState<BusinessDTO[]>([]);
  const [regSettings, setRegSettings] = useState<RegistrationSettings | null>(null);
  const [unknownEvents, setUnknownEvents] = useState<UnknownShortCodeEvent[]>([]);

  // Admin user detail sheet
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [initialPerms, setInitialPerms] = useState<string[]>([]);
  const [editBizIds, setEditBizIds] = useState<string>("");
  const [initialBizIds, setInitialBizIds] = useState<string[]>([]);
  const [editUrlQuota, setEditUrlQuota] = useState("100");
  const [editAssetQuota, setEditAssetQuota] = useState("50");
  const [editStorageMB, setEditStorageMB] = useState("500");

  // Admin create business sheet
  const [bizSheetOpen, setBizSheetOpen] = useState(false);
  const [newBizId, setNewBizId] = useState("");
  const [newBizName, setNewBizName] = useState("");

  const loadPersonal = async () => {
    try {
      const [sessRes, invRes] = await Promise.all([
        authApi.listSessions(1, 20).catch(() => ({ items: [] })),
        invitesApi.list({ page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
      ]);
      setSessions(sessRes.items || []);
      setInvites(invRes.items || []);
    } catch {}
  };

  const loadAdmin = async () => {
    if (!isAdmin) return;
    try {
      const [uRes, bRes, rRes, eRes] = await Promise.all([
        adminApi.listUsers({ page: 1, pageSize: 50 }),
        adminApi.listBusinesses({ page: 1, pageSize: 50 }),
        adminApi.getRegistrationSettings(),
        adminApi.listUnknownShortCodes({ page: 1, pageSize: 20 }),
      ]);
      setUsers(uRes.items || []);
      setBusinesses(bRes.items || []);
      setRegSettings(rRes);
      setUnknownEvents(eRes.items || []);
    } catch (err: any) {
      message.error(err?.message || "加载管理员治理数据失败");
    }
  };

  useEffect(() => {
    loadPersonal();
    loadAdmin();
  }, [isAdmin]);

  const handleRevokeSession = async (id: string) => {
    try {
      await authApi.revokeSession(id);
      message.success("已踢下线该设备");
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "踢下线失败");
    }
  };

  const handleCreateInvite = async () => {
    const hoursMap: Record<string, number> = { "1h": 1, "1d": 24, "3d": 72, "7d": 168 };
    const hours = hoursMap[inviteTTL] || 168;
    try {
      const res = await invitesApi.create({
        assignedRole: "user",
        expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
      });
      if (res.code) {
        setNewPlainInvite(res.code);
        await copy(res.code, `邀请码已复制：${res.code}`);
      }
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "签发邀请码失败");
    }
  };

  const handleRevokeInvite = async (id: string) => {
    try {
      await invitesApi.revoke(id);
      message.success("已吊销该邀请码");
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "吊销失败");
    }
  };

  const handleOpenUserDetail = async (u: AdminUserItem) => {
    try {
      const [permsRes, bizRes, quotasRes] = await Promise.all([
        adminApi.getUserPermissions(u.userId),
        adminApi.getUserBusinesses(u.userId),
        adminApi.getUserQuotas(u.userId),
      ]);
      const enabledPerms = (permsRes.items || [])
        .filter((p) => p.enabled)
        .map((p) => p.code);
      const bizList = (bizRes.items || []).map((b) => b.businessId);

      setEditingUser(u);
      setEditPerms(enabledPerms);
      setInitialPerms(enabledPerms);
      setEditBizIds(bizList.join(", "));
      setInitialBizIds(bizList);
      setEditUrlQuota(String(quotasRes.urlLinkQuota ?? u.urlLinkQuota ?? 100));
      setEditAssetQuota(String(quotasRes.minioAssetLinkQuota ?? u.minioAssetLinkQuota ?? 50));
      setEditStorageMB(String(bytesToMB(quotasRes.storageQuotaBytes ?? u.storageQuotaBytes)));
    } catch (err: any) {
      message.error(err?.message || "获取用户详情失败");
    }
  };

  const handleSaveUserGovernance = async () => {
    if (!editingUser) return;
    const uid = editingUser.userId;
    try {
      const toGrantPerms = editPerms.filter((c) => !initialPerms.includes(c));
      const toRevokePerms = initialPerms.filter((c) => !editPerms.includes(c));

      const nextBizIds = editBizIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const toGrantBiz = nextBizIds.filter((b) => !initialBizIds.includes(b));
      const toRevokeBiz = initialBizIds.filter((b) => !nextBizIds.includes(b));

      await Promise.all([
        ...toGrantPerms.map((code) => adminApi.grantPermission(uid, code)),
        ...toRevokePerms.map((code) => adminApi.revokePermission(uid, code)),
        ...toGrantBiz.map((bid) => adminApi.grantBusiness(uid, bid)),
        ...toRevokeBiz.map((bid) => adminApi.revokeBusiness(uid, bid)),
        adminApi.updateUserQuotas(uid, {
          urlLinkQuota: Number(editUrlQuota) || 0,
          minioAssetLinkQuota: Number(editAssetQuota) || 0,
          storageQuotaBytes: mbToBytes(Number(editStorageMB) || 0),
        }),
      ]);
      message.success("用户权限、业务桶与配额已保存");
      setEditingUser(null);
      loadAdmin();
    } catch (err: any) {
      message.error(err?.message || "保存用户配置失败");
    }
  };

  const handleCreateBusiness = async () => {
    const id = newBizId.trim();
    if (!id || !newBizName.trim()) {
      message.warning("请填写业务 ID 与名称");
      return;
    }
    try {
      const created = await adminApi.createBusiness({
        businessId: id,
        displayName: newBizName.trim(),
        bucketName: id,
      });
      message.success(`业务桶 ${created.bucketName} 已注册并完成 MinIO 预检`);
      setBizSheetOpen(false);
      setNewBizId("");
      setNewBizName("");
      loadAdmin();
    } catch (err: any) {
      message.error(err?.message || "创建业务桶失败");
    }
  };

  const handleToggleBusinessStatus = async (b: BusinessDTO) => {
    try {
      const next = b.status === "active" ? "disabled" : "active";
      await adminApi.updateBusiness(b.businessId, { status: next });
      message.success(`业务桶 ${b.businessId} 已${next === "active" ? "启用" : "停用"}`);
      loadAdmin();
    } catch (err: any) {
      message.error(err?.message || "操作失败");
    }
  };

  const handleToggleRegSetting = async (
    key: "allowPublicRegistration" | "allowInviteRegistration"
  ) => {
    if (!regSettings) return;
    try {
      const updated = await adminApi.updateRegistrationSettings({
        allowPublicRegistration:
          key === "allowPublicRegistration"
            ? !regSettings.allowPublicRegistration
            : regSettings.allowPublicRegistration,
        allowInviteRegistration:
          key === "allowInviteRegistration"
            ? !regSettings.allowInviteRegistration
            : regSettings.allowInviteRegistration,
      });
      setRegSettings(updated);
      message.success("全局注册策略已更新");
    } catch (err: any) {
      message.error(err?.message || "更新失败");
    }
  };

  return (
    <div className="space-y-3">
      {/* User Identity Card */}
      <div className="m-ticket">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold">{user?.email}</span>
              {isAdmin && <span className="stub-pill stub-pill-accent">ADMIN</span>}
            </div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] mt-0.5">
              当前令牌到期：{expiresAt ? formatDateTime(expiresAt) : "-"}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="stub-btn stub-btn-ghost px-2.5 py-1.5 text-xs"
          >
            {dark ? (
              <>
                <Sun className="w-3.5 h-3.5" /> 暖纸浅色
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" /> 暗夜票根
              </>
            )}
          </button>
        </div>

        <div className="m-ticket-meta">
          <span>
            已授权限{" "}
            <strong>{permissionItems.filter((p) => p.enabled).length}</strong> 项 · 业务桶{" "}
            <strong>{myBusinesses.length}</strong> 个
          </span>
          <button
            type="button"
            onClick={() => logout()}
            className="stub-btn stub-btn-ghost px-2.5 py-1 text-xs text-[var(--err)]"
          >
            <LogOut className="w-3.5 h-3.5" /> 退出登录
          </button>
        </div>
      </div>

      {/* Multi-device Sessions */}
      <div className="m-ticket">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-extrabold">在线设备会话 · Active Sessions</div>
          <span className="stub-pill">5分钟心跳保活</span>
        </div>
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {s.clientAppId === "shortlink_app" ? (
                  <Smartphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
                ) : s.clientAppId === "canvas_app" ? (
                  <Palette className="w-4 h-4 text-[var(--warn)] shrink-0" />
                ) : (
                  <Monitor className="w-4 h-4 text-[var(--ink-2)] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-mono font-bold flex items-center gap-1">
                    {s.clientAppId}
                    {s.isCurrent && (
                      <span className="stub-pill stub-pill-ok text-[9px]">本机</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--ink-3)] truncate">
                    {s.deviceName || s.platform || "-"} · 活跃于 {formatRelative(s.lastSeenAt)}
                  </div>
                </div>
              </div>
              {!s.isCurrent && !s.revokedAt && (
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.sessionId)}
                  className="stub-btn stub-btn-ghost px-2 py-1 text-[11px] text-[var(--err)] shrink-0"
                >
                  踢下线
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Single-use Invites */}
      <div className="m-ticket">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-extrabold flex items-center gap-1">
            <Ticket className="w-3.5 h-3.5 text-[var(--accent)]" /> 单次邀请码 · Invites
          </div>
          <div className="flex items-center gap-1">
            <select
              value={inviteTTL}
              onChange={(e) => setInviteTTL(e.target.value as any)}
              className="px-1.5 py-1 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-[11px]"
            >
              <option value="1h">1h</option>
              <option value="1d">1d</option>
              <option value="3d">3d</option>
              <option value="7d">7d</option>
            </select>
            <button
              type="button"
              onClick={handleCreateInvite}
              className="stub-btn stub-btn-primary px-2.5 py-1 text-[11px]"
            >
              <Plus className="w-3 h-3" /> 签发
            </button>
          </div>
        </div>

        {newPlainInvite && (
          <div className="p-2 mb-2 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] flex items-center justify-between gap-2">
            <div className="text-xs font-mono">
              <div className="text-[10px] text-[var(--accent)] font-bold">
                单次明文邀请码（仅展示一次）：
              </div>
              <div className="font-extrabold">{newPlainInvite}</div>
            </div>
            <button
              type="button"
              onClick={() => copy(newPlainInvite, "邀请码已复制")}
              className="stub-btn stub-btn-accent px-2.5 py-1 text-xs"
            >
              <Copy className="w-3 h-3" /> 复制
            </button>
          </div>
        )}

        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {invites.map((inv) => (
            <div
              key={inv.inviteId}
              className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between text-[11px] font-mono"
            >
              <div>
                <span className="font-bold">#{inv.inviteId.slice(0, 8)}</span> · 到期{" "}
                {formatRelative(inv.expiresAt)}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`stub-pill ${
                    inv.status === "active"
                      ? "stub-pill-ok"
                      : inv.status === "redeemed"
                      ? ""
                      : "stub-pill-err"
                  }`}
                >
                  {inv.status}
                </span>
                {inv.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(inv.inviteId)}
                    className="text-[var(--err)] underline"
                  >
                    吊销
                  </button>
                )}
              </div>
            </div>
          ))}
          {invites.length === 0 && (
            <div className="text-center py-3 text-xs font-mono text-[var(--ink-3)]">
              尚未签发过邀请码
            </div>
          )}
        </div>
      </div>

      {/* Administrator Governance Console */}
      {isAdmin && (
        <div className="m-ticket border-2 border-[var(--ink)]">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <div className="text-sm font-extrabold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[var(--accent)]" /> 管理员治理专区 · Admin
              </div>
              <div className="text-[10px] font-mono text-[var(--ink-3)]">
                手机端随时审批用户权限、注册 MinIO 业务桶与安全监控
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] mb-3 text-xs">
            <button
              type="button"
              onClick={() => setAdminTab("users")}
              className={`py-1.5 rounded-sm font-bold flex items-center justify-center gap-1 ${
                adminTab === "users"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              <Users className="w-3.5 h-3.5" /> 用户 ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab("businesses")}
              className={`py-1.5 rounded-sm font-bold flex items-center justify-center gap-1 ${
                adminTab === "businesses"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              <Database className="w-3.5 h-3.5" /> 业务桶 ({businesses.length})
            </button>
            <button
              type="button"
              onClick={() => setAdminTab("security")}
              className={`py-1.5 rounded-sm font-bold flex items-center justify-center gap-1 ${
                adminTab === "security"
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-3)]"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" /> 安全与注册
            </button>
          </div>

          {adminTab === "users" && (
            <div className="space-y-1.5">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate flex items-center gap-1">
                      {u.email}
                      {u.role === "admin" && (
                        <span className="stub-pill stub-pill-accent">Admin</span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--ink-3)]">
                      权限 {u.enabledPermissionCount} 项 · 业务桶 {u.businessAccessCount} 个
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenUserDetail(u)}
                      className="stub-btn stub-btn-primary px-2.5 py-1 text-[11px]"
                    >
                      配额/权限
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === "businesses" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setBizSheetOpen(true)}
                className="stub-btn stub-btn-accent w-full py-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> 注册新业务桶 (bucketName = businessId)
              </button>
              {businesses.map((b) => (
                <div
                  key={b.businessId}
                  className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold font-mono">{b.businessId}</div>
                    <div className="text-[10px] text-[var(--ink-3)]">
                      {b.displayName} · Bucket: {b.bucketName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleBusinessStatus(b)}
                    className={`stub-pill cursor-pointer ${
                      b.status === "active" ? "stub-pill-ok" : "stub-pill-err"
                    }`}
                  >
                    {b.status}
                  </button>
                </div>
              ))}
            </div>
          )}

          {adminTab === "security" && (
            <div className="space-y-2.5 text-xs">
              {regSettings && (
                <div className="p-2.5 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
                  <div className="font-bold">全局注册入口控制</div>
                  <div className="flex items-center justify-between">
                    <span>允许公开邮箱注册 (无需邀请码)</span>
                    <button
                      type="button"
                      onClick={() => handleToggleRegSetting("allowPublicRegistration")}
                      className={`stub-pill cursor-pointer ${
                        regSettings.allowPublicRegistration ? "stub-pill-ok" : "stub-pill-err"
                      }`}
                    >
                      {regSettings.allowPublicRegistration ? "已开启" : "已关闭"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>允许单次邀请码注册</span>
                    <button
                      type="button"
                      onClick={() => handleToggleRegSetting("allowInviteRegistration")}
                      className={`stub-pill cursor-pointer ${
                        regSettings.allowInviteRegistration ? "stub-pill-ok" : "stub-pill-err"
                      }`}
                    >
                      {regSettings.allowInviteRegistration ? "已开启" : "已关闭"}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  const res = await adminApi.revokeUnusedInvites({ confirmAll: true });
                  message.success(`已批量吊销全站 ${res.revokedCount} 个未使用邀请码`);
                }}
                className="stub-btn stub-btn-ghost w-full py-2 text-xs text-[var(--err)]"
              >
                一键吊销全站所有未使用邀请码
              </button>

              <div className="space-y-1.5">
                <div className="font-bold">未知短码探测告警 ({unknownEvents.length})</div>
                {unknownEvents.slice(0, 10).map((ev) => (
                  <div
                    key={ev.eventId}
                    className="p-2 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between font-mono text-[11px]"
                  >
                    <div>
                      <span className="text-[var(--err)] font-bold">{ev.codeFingerprint}</span> ·{" "}
                      {ev.sourceIp} ({ev.eventCount}次)
                    </div>
                    <span className="text-[10px] text-[var(--ink-3)]">
                      {formatRelative(ev.lastOccurredAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin Edit User Sheet */}
      <BottomSheet
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={editingUser ? `治理用户 · ${editingUser.email}` : ""}
        subtitle="13项细粒度权限 · 业务桶授权 · 十进制 MB 配额"
      >
        {editingUser && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                  URL短链上限
                </label>
                <input
                  type="number"
                  value={editUrlQuota}
                  onChange={(e) => setEditUrlQuota(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                  素材短链上限
                </label>
                <input
                  type="number"
                  value={editAssetQuota}
                  onChange={(e) => setEditAssetQuota(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                  存储配额 (MB)
                </label>
                <input
                  type="number"
                  value={editStorageMB}
                  onChange={(e) => setEditStorageMB(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                授权业务桶 ID（多个用英文逗号分隔）
              </label>
              <input
                value={editBizIds}
                onChange={(e) => setEditBizIds(e.target.value)}
                placeholder="例如: canvas-assets, client-delivery"
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
              />
            </div>

            <div>
              <div className="text-[11px] font-mono text-[var(--ink-3)] mb-1.5">
                细粒度功能权限 ({editPerms.length} / 13)
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1">
                {ALL_PERMISSION_OPTIONS.map((opt) => {
                  const checked = editPerms.includes(opt.code);
                  return (
                    <label
                      key={opt.code}
                      className={`p-1.5 rounded-sm border flex items-center gap-1.5 cursor-pointer ${
                        checked
                          ? "border-[var(--ink)] bg-[var(--bg-card)] font-bold"
                          : "border-[var(--line)] opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditPerms((prev) => [...prev, opt.code]);
                          } else {
                            setEditPerms((prev) => prev.filter((p) => p !== opt.code));
                          }
                        }}
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveUserGovernance}
              className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
            >
              保存用户权限与配额
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Admin Create Business Sheet */}
      <BottomSheet
        open={bizSheetOpen}
        onClose={() => setBizSheetOpen(false)}
        title="注册新业务桶 · New Business Bucket"
        subtitle="POST /api/v1/admin/businesses"
      >
        <div className="space-y-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              业务 ID (同时作为 MinIO 桶名，符合 S3 小写命名规范)
            </label>
            <input
              value={newBizId}
              onChange={(e) => setNewBizId(e.target.value)}
              placeholder="例如: studio-assets"
              className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              业务显示名称
            </label>
            <input
              value={newBizName}
              onChange={(e) => setNewBizName(e.target.value)}
              placeholder="设计工作室私有素材桶"
              className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateBusiness}
            className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
          >
            确认注册并自动建桶
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
