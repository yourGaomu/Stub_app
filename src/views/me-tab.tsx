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
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { adminApi, apiKeysApi, authApi, invitesApi } from "../services/api";
import type {
  AdminUserItem,
  APIKeyDTO,
  BusinessDTO,
  CreateAPIKeyRequest,
  InviteDTO,
  RegistrationSettings,
  Session,
  UnknownShortCodeEvent,
} from "../services/api/types";
import { useAuthStore } from "../stores/auth-store";
import { useThemeStore } from "../stores/theme-store";
import { bytesToMB, formatDateTime, formatMB, formatRelative, mbToBytes } from "../lib/format";
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
  { code: "api_keys.manage", label: "管理 API Key 机器凭证" },
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

  // Machine API Keys
  const [apiKeys, setApiKeys] = useState<APIKeyDTO[]>([]);
  const [newPlainKey, setNewPlainKey] = useState<string>("");
  const [apiKeySheetOpen, setApiKeySheetOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyDesc, setKeyDesc] = useState("");
  const [keyBizId, setKeyBizId] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>([
    "links.read",
    "links.create_url",
    "links.create_asset",
    "assets.read",
    "assets.upload",
  ]);
  const [keyAccountAccess, setKeyAccountAccess] = useState(false);
  const [keyRateLimit, setKeyRateLimit] = useState("60");
  const [keyMaxUploadMB, setKeyMaxUploadMB] = useState("");
  const [keyMaxLinks, setKeyMaxLinks] = useState("");
  const [keyMaxRequests, setKeyMaxRequests] = useState("");
  const [keyExpirePreset, setKeyExpirePreset] = useState<"never" | "30d" | "90d" | "1y">("never");

  // Edit existing API Key sheet
  const [editingApiKey, setEditingApiKey] = useState<APIKeyDTO | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyDesc, setEditKeyDesc] = useState("");
  const [editKeyBizId, setEditKeyBizId] = useState("");
  const [editKeyScopes, setEditKeyScopes] = useState<string[]>([]);
  const [editKeyAccountAccess, setEditKeyAccountAccess] = useState(false);
  const [editKeyRateLimit, setEditKeyRateLimit] = useState("60");
  const [editKeyMaxUploadMB, setEditKeyMaxUploadMB] = useState("");
  const [editKeyMaxLinks, setEditKeyMaxLinks] = useState("");
  const [editKeyMaxRequests, setEditKeyMaxRequests] = useState("");
  const [editKeyExpirePreset, setEditKeyExpirePreset] = useState<
    "keep" | "never" | "30d" | "90d" | "1y"
  >("keep");
  const [savingEditKey, setSavingEditKey] = useState(false);

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
  const [editApiKeyQuota, setEditApiKeyQuota] = useState("5");
  const [userApiKeys, setUserApiKeys] = useState<APIKeyDTO[]>([]);

  // Admin create business sheet
  const [bizSheetOpen, setBizSheetOpen] = useState(false);
  const [newBizId, setNewBizId] = useState("");
  const [newBizName, setNewBizName] = useState("");

  const loadPersonal = async () => {
    try {
      const [sessRes, invRes, keysRes] = await Promise.all([
        authApi.listSessions(1, 20).catch(() => ({ items: [] })),
        invitesApi.list({ page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
        apiKeysApi.list({ page: 1, pageSize: 50 }).catch(() => ({ items: [] })),
      ]);
      setSessions(sessRes.items || []);
      setInvites(invRes.items || []);
      setApiKeys(keysRes.items || []);
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
      const [permsRes, bizRes, quotasRes, keysRes] = await Promise.all([
        adminApi.getUserPermissions(u.userId),
        adminApi.getUserBusinesses(u.userId),
        adminApi.getUserQuotas(u.userId),
        adminApi.listUserAPIKeys(u.userId).catch(() => ({ items: [] })),
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
      setEditApiKeyQuota(String(quotasRes.apiKeyQuota ?? u.apiKeyQuota ?? 5));
      setUserApiKeys(keysRes.items || []);
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
          apiKeyQuota: Number(editApiKeyQuota) || 0,
        }),
      ]);
      message.success("用户权限、业务桶与配额已保存");
      setEditingUser(null);
      loadAdmin();
    } catch (err: any) {
      message.error(err?.message || "保存用户配置失败");
    }
  };

  const handleAdminRevokeUserKey = async (k: APIKeyDTO) => {
    if (!editingUser) return;
    if (!window.confirm(`确认永久吊销用户「${editingUser.email}」的 API Key「${k.name}」？`)) {
      return;
    }
    try {
      await adminApi.revokeAPIKey(k.apiKeyId);
      message.success("已吊销该用户的 API Key");
      const res = await adminApi.listUserAPIKeys(editingUser.userId).catch(() => ({ items: [] }));
      setUserApiKeys(res.items || []);
      loadAdmin();
    } catch (err: any) {
      message.error(err?.message || "吊销失败");
    }
  };

  const handleCreateApiKey = async () => {
    if (!keyName.trim()) {
      message.warning("请输入 API Key 名称");
      return;
    }
    const biz = keyBizId || myBusinesses[0]?.businessId;
    if (!biz) {
      message.warning("请选择绑定的业务桶");
      return;
    }
    if (keyScopes.length === 0) {
      message.warning("请至少勾选一项功能权限");
      return;
    }

    let expiresAt: string | null = null;
    if (keyExpirePreset === "30d") expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    else if (keyExpirePreset === "90d") expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    else if (keyExpirePreset === "1y") expiresAt = new Date(Date.now() + 365 * 86400000).toISOString();

    const payload: CreateAPIKeyRequest = {
      name: keyName.trim(),
      description: keyDesc.trim() || undefined,
      businessId: biz,
      scopes: keyScopes,
      rateLimitPerMin: Math.min(600, Math.max(1, Number(keyRateLimit) || 60)),
      maxUploadBytes: keyMaxUploadMB.trim() ? mbToBytes(Number(keyMaxUploadMB)) : null,
      maxCreatedLinks: keyMaxLinks.trim() ? Number(keyMaxLinks) : null,
      maxRequests: keyMaxRequests.trim() ? Number(keyMaxRequests) : null,
      expiresAt,
      allowAccountAccess: keyAccountAccess,
    };

    try {
      const res = await apiKeysApi.create(payload);
      setApiKeySheetOpen(false);
      setNewPlainKey(res.secretKey);
      await copy(res.secretKey, "API Key 已生成并复制到剪贴板");
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "创建 API Key 失败");
    }
  };

  const handleOpenEditKey = (k: APIKeyDTO) => {
    const kq = k.quotas || k;
    setEditingApiKey(k);
    setEditKeyName(k.name);
    setEditKeyDesc(k.description || "");
    setEditKeyBizId(k.businessId);
    setEditKeyScopes(k.scopes || []);
    setEditKeyAccountAccess(Boolean(k.allowAccountAccess));
    setEditKeyRateLimit(String(k.rateLimitPerMin || 60));
    setEditKeyMaxUploadMB(kq.maxUploadBytes ? String(bytesToMB(kq.maxUploadBytes)) : "");
    setEditKeyMaxLinks(kq.maxCreatedLinks ? String(kq.maxCreatedLinks) : "");
    setEditKeyMaxRequests(kq.maxRequests ? String(kq.maxRequests) : "");
    setEditKeyExpirePreset("keep");
  };

  const handleSaveEditKey = async () => {
    if (!editingApiKey) return;
    if (!editKeyName.trim()) {
      message.warning("请输入 API Key 名称");
      return;
    }
    if (editKeyScopes.length === 0) {
      message.warning("请至少保留一项功能权限");
      return;
    }

    const eq = editingApiKey.quotas || editingApiKey;
    if (editKeyMaxUploadMB.trim() && mbToBytes(Number(editKeyMaxUploadMB)) < eq.uploadedBytesUsed) {
      message.error(`累计上传上限不能低于当前已用量 (${formatMB(eq.uploadedBytesUsed)})`);
      return;
    }
    if (editKeyMaxLinks.trim() && Number(editKeyMaxLinks) < eq.createdLinksUsed) {
      message.error(`累计建链上限不能低于当前已用条数 (${eq.createdLinksUsed} 条)`);
      return;
    }
    if (editKeyMaxRequests.trim() && Number(editKeyMaxRequests) < eq.requestsUsed) {
      message.error(`累计请求上限不能低于当前已请求次数 (${eq.requestsUsed} 次)`);
      return;
    }

    let nextExpiresAt: string | null = editingApiKey.expiresAt || null;
    if (editKeyExpirePreset === "never") nextExpiresAt = null;
    else if (editKeyExpirePreset === "30d") nextExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    else if (editKeyExpirePreset === "90d") nextExpiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    else if (editKeyExpirePreset === "1y") nextExpiresAt = new Date(Date.now() + 365 * 86400000).toISOString();

    const payload = {
      name: editKeyName.trim(),
      description: editKeyDesc.trim() || undefined,
      businessId: editKeyBizId,
      scopes: editKeyScopes,
      rateLimitPerMin: Math.min(600, Math.max(1, Number(editKeyRateLimit) || 60)),
      maxUploadBytes: editKeyMaxUploadMB.trim() ? mbToBytes(Number(editKeyMaxUploadMB)) : null,
      maxCreatedLinks: editKeyMaxLinks.trim() ? Number(editKeyMaxLinks) : null,
      maxRequests: editKeyMaxRequests.trim() ? Number(editKeyMaxRequests) : null,
      expiresAt: nextExpiresAt,
      allowAccountAccess: editKeyAccountAccess,
    };

    setSavingEditKey(true);
    try {
      await apiKeysApi.update(editingApiKey.apiKeyId, payload);
      message.success("已更新该 API Key 配置");
      setEditingApiKey(null);
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "更新配置失败");
    } finally {
      setSavingEditKey(false);
    }
  };

  const handleToggleApiKeyStatus = async (k: APIKeyDTO) => {
    try {
      if (k.status === "active") {
        await apiKeysApi.disable(k.apiKeyId);
        message.success("已暂停该 API Key");
      } else {
        await apiKeysApi.enable(k.apiKeyId);
        message.success("已重新启用该 API Key");
      }
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "操作失败");
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!window.confirm("确认永久吊销此 API Key？吊销后依赖此凭证的外部服务或脚本将立即无法访问。")) {
      return;
    }
    try {
      await apiKeysApi.revoke(id);
      message.success("已吊销该 API Key");
      loadPersonal();
    } catch (err: any) {
      message.error(err?.message || "吊销失败");
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

      {/* Machine API Keys Card */}
      <div className="m-ticket">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-extrabold flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" /> 机器凭证 · API Keys (stub_sk_)
          </div>
          <button
            type="button"
            onClick={() => {
              setKeyName("");
              setKeyDesc("");
              setKeyBizId(myBusinesses[0]?.businessId || "");
              setKeyScopes([
                "links.read",
                "links.create_url",
                "links.create_asset",
                "assets.read",
                "assets.upload",
              ]);
              setKeyAccountAccess(false);
              setKeyRateLimit("60");
              setKeyMaxUploadMB("");
              setKeyMaxLinks("");
              setKeyMaxRequests("");
              setKeyExpirePreset("never");
              setApiKeySheetOpen(true);
            }}
            className="stub-btn stub-btn-primary px-2.5 py-1 text-[11px]"
          >
            <Plus className="w-3 h-3" /> 新建 Key
          </button>
        </div>

        {/* 明确规则说明条 (用户重点要求) */}
        <div className="p-2 mb-2 rounded-sm border border-[var(--accent)]/40 bg-[var(--accent-soft)] flex items-start gap-1.5 text-[11px] leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
          <div>
            <b>额度消耗特别说明（累计消耗制 · 只增不减）：</b>
            仅统计通过该 Key 累计上传的流量与累计创建的短链数，后续删除素材或停用短链
            <b>不会退还该 Key 的已用额度</b>。
          </div>
        </div>

        {newPlainKey && (
          <div className="p-2 mb-2 rounded-sm border border-[var(--accent)] bg-[var(--accent-soft)] flex items-center justify-between gap-2">
            <div className="text-xs font-mono min-w-0">
              <div className="text-[10px] text-[var(--accent)] font-bold">
                明文 API Key（仅展示一次，已复制）：
              </div>
              <div className="font-extrabold truncate select-all">{newPlainKey}</div>
            </div>
            <button
              type="button"
              onClick={() => copy(newPlainKey, "API Key 已复制")}
              className="stub-btn stub-btn-accent px-2.5 py-1 text-xs shrink-0"
            >
              <Copy className="w-3 h-3" /> 复制
            </button>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {apiKeys.map((k) => {
            const kq = k.quotas || k;
            const isExpired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
            return (
              <div
                key={k.apiKeyId}
                className={`p-2.5 rounded-sm border ${
                  k.status === "active" && !isExpired
                    ? "border-[var(--line-strong)] bg-[var(--bg-card)]"
                    : "border-[var(--line)] bg-[var(--bg-card)] opacity-60"
                } text-xs`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold flex items-center gap-1.5">
                      <span className="truncate">{k.name}</span>
                      <span
                        className={`stub-pill ${
                          k.status === "revoked"
                            ? "stub-pill-err"
                            : isExpired
                            ? "stub-pill-err"
                            : k.status === "active"
                            ? "stub-pill-ok"
                            : ""
                        }`}
                      >
                        {k.status === "revoked" ? "revoked" : isExpired ? "expired" : k.status}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--ink-3)] truncate">
                      前缀: {k.keyPrefix} · 桶: {k.businessId}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {k.status !== "revoked" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditKey(k)}
                          className="stub-btn stub-btn-ghost px-2 py-0.5 text-[11px]"
                        >
                          配置
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleApiKeyStatus(k)}
                          className="stub-btn stub-btn-ghost px-2 py-0.5 text-[11px]"
                        >
                          {k.status === "active" ? "暂停" : "启用"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeApiKey(k.apiKeyId)}
                          className="stub-btn stub-btn-ghost px-2 py-0.5 text-[11px] text-[var(--err)]"
                        >
                          吊销
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 累计额度消耗指示 */}
                <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-[var(--line)] font-mono text-[10px] text-[var(--ink-2)]">
                  <div>
                    <span className="text-[var(--ink-3)] block">累计上传:</span>
                    {formatMB(kq.uploadedBytesUsed)} /{" "}
                    {kq.maxUploadBytes ? formatMB(kq.maxUploadBytes, 0) : "不限"}
                    {kq.maxUploadBytes && kq.maxUploadBytes > 0 && (
                      <div className="mt-1 h-1 bg-[var(--line)] rounded overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{
                            width: `${Math.min(
                              100,
                              (kq.uploadedBytesUsed / kq.maxUploadBytes) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[var(--ink-3)] block">累计建链:</span>
                    {kq.createdLinksUsed} / {kq.maxCreatedLinks ?? "不限"}
                    {kq.maxCreatedLinks && kq.maxCreatedLinks > 0 && (
                      <div className="mt-1 h-1 bg-[var(--line)] rounded overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{
                            width: `${Math.min(
                              100,
                              (kq.createdLinksUsed / kq.maxCreatedLinks) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[var(--ink-3)] block">累计请求:</span>
                    {kq.requestsUsed} / {kq.maxRequests ?? "不限"}
                    {kq.maxRequests && kq.maxRequests > 0 && (
                      <div className="mt-1 h-1 bg-[var(--line)] rounded overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{
                            width: `${Math.min(
                              100,
                              (kq.requestsUsed / kq.maxRequests) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {apiKeys.length === 0 && (
            <div className="text-center py-3 text-xs font-mono text-[var(--ink-3)]">
              尚未创建任何机器调用 API Key
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
        subtitle="14项细粒度权限 · 业务桶授权 · 十进制 MB 配额"
      >
        {editingUser && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
              <div>
                <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                  API Key 上限 (个)
                </label>
                <input
                  type="number"
                  value={editApiKeyQuota}
                  onChange={(e) => setEditApiKeyQuota(e.target.value)}
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
                细粒度功能权限 ({editPerms.length} / 14)
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

            {/* 用户名下 API Key 列表与治理 */}
            {userApiKeys.length > 0 && (
              <div className="space-y-1.5 border-t border-[var(--line)] pt-2">
                <div className="text-[11px] font-mono text-[var(--ink-3)]">
                  该用户名下的 API Key 列表 ({userApiKeys.length})
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {userApiKeys.map((k) => {
                    const kq = k.quotas || k;
                    return (
                      <div
                        key={k.apiKeyId}
                        className="p-1.5 rounded border border-[var(--line)] bg-[var(--bg-card)] flex items-center justify-between text-[11px]"
                      >
                        <div className="min-w-0">
                          <div className="font-bold truncate">
                            {k.name} ({k.keyPrefix})
                          </div>
                          <div className="text-[10px] font-mono text-[var(--ink-3)]">
                            上传: {formatMB(kq.uploadedBytesUsed)} · 建链: {kq.createdLinksUsed} · 状态: {k.status}
                          </div>
                        </div>
                        {k.status !== "revoked" && (
                          <button
                            type="button"
                            onClick={() => handleAdminRevokeUserKey(k)}
                            className="stub-btn stub-btn-ghost px-2 py-0.5 text-[10px] text-[var(--err)] shrink-0"
                          >
                            吊销
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

      {/* User Create API Key Sheet */}
      <BottomSheet
        open={apiKeySheetOpen}
        onClose={() => setApiKeySheetOpen(false)}
        title="创建 API Key · 机器凭证"
        subtitle="面向自动化脚本、爬虫与工作流集成"
      >
        <div className="space-y-3 text-xs">
          {myBusinesses.length === 0 && (
            <div className="p-2 rounded border border-[var(--err)] bg-[var(--err)]/10 text-[11px] text-[var(--err)]">
              当前账号尚未被授予任何 MinIO 业务桶，无法创建机器 Key。请联系管理员在用户治理中分配业务桶。
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              凭证名称 *
            </label>
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="例如: 画布自动备份脚本"
              className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              绑定 MinIO 业务桶 *
            </label>
            <select
              value={keyBizId || (myBusinesses[0]?.businessId ?? "")}
              onChange={(e) => setKeyBizId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
            >
              {myBusinesses.map((b) => (
                <option key={b.businessId} value={b.businessId}>
                  {b.displayName} ({b.businessId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
              用途描述 (选填)
            </label>
            <input
              value={keyDesc}
              onChange={(e) => setKeyDesc(e.target.value)}
              placeholder="部署服务器或自动化任务说明"
              className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]"
            />
          </div>

          {/* 累计额度限制 (只增不减特别说明) */}
          <div className="p-2 rounded border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px]">累计额度限制 (只增不减制)</span>
              <span className="text-[10px] text-[var(--accent)] font-mono">删除不退还</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">上传MB上限</label>
                <input
                  type="number"
                  value={keyMaxUploadMB}
                  onChange={(e) => setKeyMaxUploadMB(e.target.value)}
                  placeholder="留空不限"
                  className="w-full px-1.5 py-1 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">建链条数上限</label>
                <input
                  type="number"
                  value={keyMaxLinks}
                  onChange={(e) => setKeyMaxLinks(e.target.value)}
                  placeholder="留空不限"
                  className="w-full px-1.5 py-1 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">总请求上限</label>
                <input
                  type="number"
                  value={keyMaxRequests}
                  onChange={(e) => setKeyMaxRequests(e.target.value)}
                  placeholder="留空不限"
                  className="w-full px-1.5 py-1 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-[11px]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                频控 (次/分钟)
              </label>
              <input
                type="number"
                value={keyRateLimit}
                onChange={(e) => setKeyRateLimit(e.target.value)}
                min={1}
                max={600}
                className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                有效期
              </label>
              <select
                value={keyExpirePreset}
                onChange={(e) => setKeyExpirePreset(e.target.value as any)}
                className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] text-xs"
              >
                <option value="never">永久有效</option>
                <option value="30d">30 天</option>
                <option value="90d">90 天</option>
                <option value="1y">1 年</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded border border-[var(--line)] bg-[var(--bg-card)]">
            <div>
              <div className="font-bold">允许读取账号信息</div>
              <div className="text-[10px] text-[var(--ink-3)]">
                开启后可调用 /me 接口查询权限与用量
              </div>
            </div>
            <button
              type="button"
              onClick={() => setKeyAccountAccess(!keyAccountAccess)}
              className={`stub-pill cursor-pointer ${
                keyAccountAccess ? "stub-pill-ok" : "stub-pill-err"
              }`}
            >
              {keyAccountAccess ? "已允许" : "禁止"}
            </button>
          </div>

          <div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] mb-1">
              授权功能范围 ({keyScopes.length} 项)
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto p-1">
              {[
                { code: "links.read", label: "读短链" },
                { code: "links.create_url", label: "创URL短链" },
                { code: "links.create_asset", label: "创素材短链" },
                { code: "links.manage", label: "管理短链" },
                { code: "links.reset_visits", label: "清零访问" },
                { code: "assets.read", label: "读素材" },
                { code: "assets.upload", label: "传素材" },
                { code: "assets.delete", label: "软删素材" },
                { code: "assets.restore", label: "恢复素材" },
                { code: "templates.read_use", label: "用模板" },
                { code: "templates.manage", label: "管模板" },
              ].map((opt) => {
                const canGrant =
                  isAdmin ||
                  Boolean(permissionItems.find((p) => p.code === opt.code)?.enabled);
                const checked = keyScopes.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={`p-1.5 rounded-sm border flex items-center gap-1.5 text-[11px] ${
                      !canGrant
                        ? "opacity-35 cursor-not-allowed border-[var(--line)]"
                        : checked
                        ? "cursor-pointer border-[var(--ink)] bg-[var(--bg-card)] font-bold"
                        : "cursor-pointer border-[var(--line)] opacity-70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked && canGrant}
                      disabled={!canGrant}
                      onChange={(e) => {
                        if (e.target.checked) setKeyScopes((prev) => [...prev, opt.code]);
                        else setKeyScopes((prev) => prev.filter((c) => c !== opt.code));
                      }}
                    />
                    <span className="truncate">
                      {opt.label} {!canGrant && "(无权)"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateApiKey}
            className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
          >
            立即生成 API Key
          </button>
        </div>
      </BottomSheet>

      {/* User Edit API Key Sheet */}
      <BottomSheet
        open={Boolean(editingApiKey)}
        onClose={() => setEditingApiKey(null)}
        title={`配置 API Key · ${editingApiKey?.name || ""}`}
        subtitle={`前缀: ${editingApiKey?.keyPrefix || ""}`}
      >
        {editingApiKey && (() => {
          const eq = editingApiKey.quotas || editingApiKey;
          const uploadBelow =
            Boolean(editKeyMaxUploadMB.trim()) &&
            mbToBytes(Number(editKeyMaxUploadMB)) < eq.uploadedBytesUsed;
          const linksBelow =
            Boolean(editKeyMaxLinks.trim()) &&
            Number(editKeyMaxLinks) < eq.createdLinksUsed;
          const reqBelow =
            Boolean(editKeyMaxRequests.trim()) &&
            Number(editKeyMaxRequests) < eq.requestsUsed;

          return (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  凭证名称 *
                </label>
                <input
                  value={editKeyName}
                  onChange={(e) => setEditKeyName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  绑定 MinIO 业务桶 *
                </label>
                <select
                  value={editKeyBizId}
                  onChange={(e) => setEditKeyBizId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
                >
                  {myBusinesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.displayName} ({b.businessId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  用途描述 (选填)
                </label>
                <input
                  value={editKeyDesc}
                  onChange={(e) => setEditKeyDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]"
                />
              </div>

              {/* 累计额度限制 (只增不减说明) */}
              <div className="p-2 rounded border border-[var(--line)] bg-[var(--bg-card)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px]">累计额度限制 (只增不减制)</span>
                  <span className="text-[10px] text-[var(--ink-3)] font-mono">
                    已用: {formatMB(eq.uploadedBytesUsed)} · {eq.createdLinksUsed} 条
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">上传MB上限</label>
                    <input
                      type="number"
                      value={editKeyMaxUploadMB}
                      onChange={(e) => setEditKeyMaxUploadMB(e.target.value)}
                      placeholder="留空不限"
                      className={`w-full px-1.5 py-1 rounded-sm border bg-[var(--bg-elev)] font-mono text-[11px] ${
                        uploadBelow ? "border-[var(--err)] text-[var(--err)]" : "border-[var(--line-strong)]"
                      }`}
                    />
                    {uploadBelow && (
                      <span className="text-[9px] text-[var(--err)] block mt-0.5">
                        &lt;已用{formatMB(eq.uploadedBytesUsed)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">建链条数上限</label>
                    <input
                      type="number"
                      value={editKeyMaxLinks}
                      onChange={(e) => setEditKeyMaxLinks(e.target.value)}
                      placeholder="留空不限"
                      className={`w-full px-1.5 py-1 rounded-sm border bg-[var(--bg-elev)] font-mono text-[11px] ${
                        linksBelow ? "border-[var(--err)] text-[var(--err)]" : "border-[var(--line-strong)]"
                      }`}
                    />
                    {linksBelow && (
                      <span className="text-[9px] text-[var(--err)] block mt-0.5">
                        &lt;已用{eq.createdLinksUsed}条
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--ink-3)] mb-0.5">总请求上限</label>
                    <input
                      type="number"
                      value={editKeyMaxRequests}
                      onChange={(e) => setEditKeyMaxRequests(e.target.value)}
                      placeholder="留空不限"
                      className={`w-full px-1.5 py-1 rounded-sm border bg-[var(--bg-elev)] font-mono text-[11px] ${
                        reqBelow ? "border-[var(--err)] text-[var(--err)]" : "border-[var(--line-strong)]"
                      }`}
                    />
                    {reqBelow && (
                      <span className="text-[9px] text-[var(--err)] block mt-0.5">
                        &lt;已用{eq.requestsUsed}次
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                    频控 (次/分钟)
                  </label>
                  <input
                    type="number"
                    value={editKeyRateLimit}
                    onChange={(e) => setEditKeyRateLimit(e.target.value)}
                    min={1}
                    max={600}
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-[var(--ink-3)] mb-1">
                    有效期调整
                  </label>
                  <select
                    value={editKeyExpirePreset}
                    onChange={(e) => setEditKeyExpirePreset(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] text-xs"
                  >
                    <option value="keep">保持现有到期时间</option>
                    <option value="never">设为永久有效</option>
                    <option value="30d">延长至 30 天</option>
                    <option value="90d">延长至 90 天</option>
                    <option value="1y">延长至 1 年</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded border border-[var(--line)] bg-[var(--bg-card)]">
                <div>
                  <div className="font-bold">允许读取账号信息</div>
                  <div className="text-[10px] text-[var(--ink-3)]">
                    开启后可调用 /me 接口查询权限与用量
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditKeyAccountAccess(!editKeyAccountAccess)}
                  className={`stub-pill cursor-pointer ${
                    editKeyAccountAccess ? "stub-pill-ok" : "stub-pill-err"
                  }`}
                >
                  {editKeyAccountAccess ? "已允许" : "禁止"}
                </button>
              </div>

              <div>
                <div className="text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  授权功能范围 ({editKeyScopes.length} 项)
                </div>
                <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto p-1">
                  {[
                    { code: "links.read", label: "读短链" },
                    { code: "links.create_url", label: "创URL短链" },
                    { code: "links.create_asset", label: "创素材短链" },
                    { code: "links.manage", label: "管理短链" },
                    { code: "links.reset_visits", label: "清零访问" },
                    { code: "assets.read", label: "读素材" },
                    { code: "assets.upload", label: "传素材" },
                    { code: "assets.delete", label: "软删素材" },
                    { code: "assets.restore", label: "恢复素材" },
                    { code: "templates.read_use", label: "用模板" },
                    { code: "templates.manage", label: "管模板" },
                  ].map((opt) => {
                    const canGrant =
                      isAdmin ||
                      Boolean(permissionItems.find((p) => p.code === opt.code)?.enabled);
                    const checked = editKeyScopes.includes(opt.code);
                    return (
                      <label
                        key={opt.code}
                        className={`p-1.5 rounded-sm border flex items-center gap-1.5 text-[11px] ${
                          !canGrant
                            ? "opacity-35 cursor-not-allowed border-[var(--line)]"
                            : checked
                            ? "cursor-pointer border-[var(--ink)] bg-[var(--bg-card)] font-bold"
                            : "cursor-pointer border-[var(--line)] opacity-70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked && canGrant}
                          disabled={!canGrant}
                          onChange={(e) => {
                            if (e.target.checked)
                              setEditKeyScopes((prev) => [...prev, opt.code]);
                            else
                              setEditKeyScopes((prev) =>
                                prev.filter((c) => c !== opt.code)
                              );
                          }}
                        />
                        <span className="truncate">
                          {opt.label} {!canGrant && "(无权)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                disabled={savingEditKey}
                onClick={handleSaveEditKey}
                className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
              >
                {savingEditKey ? "保存中…" : "保存配置"}
              </button>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}
