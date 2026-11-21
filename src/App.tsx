import { useCallback, useEffect, useState } from "react";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Link2, FolderArchive, BarChart3, User, Plus } from "lucide-react";
import { getAntThemeConfig } from "./lib/app-theme";
import { useAuthStore } from "./stores/auth-store";
import { useThemeStore } from "./stores/theme-store";
import { authApi } from "./services/api";
import type { AssetDTO, LinkDTO } from "./services/api/types";
import { AuthView } from "./views/auth-view";
import { LinksTab } from "./views/links-tab";
import { AssetsTab } from "./views/assets-tab";
import { StatsTab } from "./views/stats-tab";
import { MeTab } from "./views/me-tab";
import { MobileCreateSheet } from "./components/mobile-create-sheet";
import { NotificationCenter } from "./components/notification-center";

function MobileShell() {
  const { token, user, isAdmin, initialized, loading, bootstrapError, hasPermission, refreshBootstrap } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"links" | "assets" | "stats" | "me">("links");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [pendingLink, setPendingLink] = useState<{ token: string; linkId: string } | null>(null);
  const onOpenedLink = useCallback(() => setPendingLink(null), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [presetUrl, setPresetUrl] = useState<string | undefined>(undefined);
  const [presetAsset, setPresetAsset] = useState<AssetDTO | null>(null);
  const [sourceLink, setSourceLink] = useState<LinkDTO | null>(null);
  const [clipboardChecked, setClipboardChecked] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState("");
  const canCreate = initialized && (hasPermission("links.create_url") || hasPermission("links.create_asset"));

  // Sync /me bootstrap and 5-minute session heartbeat
  useEffect(() => {
    if (!token) return;
    refreshBootstrap();

    authApi.heartbeat().catch(() => {});
    const timer = setInterval(() => {
      authApi.heartbeat().catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token, refreshBootstrap]);

  useEffect(() => {
    setCreateOpen(false);
    setPendingLink(null);
    setPresetUrl(undefined);
    setPresetAsset(null);
    setSourceLink(null);
    setClipboardChecked(false);
    setClipboardUrl("");
  }, [token]);

  if (!token) {
    return <AuthView />;
  }

  if (!initialized) {
    return <div className="m-app-shell p-6 space-y-3 text-sm">
      <p role={bootstrapError ? "alert" : "status"}>{bootstrapError ? `账号信息加载失败：${bootstrapError}` : "正在加载账号权限…"}</p>
      {bootstrapError && <button type="button" disabled={loading} onClick={() => void refreshBootstrap()} className="stub-btn py-2">{loading ? "重试中…" : "重试加载账号"}</button>}
    </div>;
  }

  return (
    <div className="m-app-shell">
      {/* Top App Bar */}
      <header className="m-topbar">
        <div className="flex min-w-0 items-center gap-2">
          <img src="/favicon.svg" alt="Stub" className="w-7 h-7 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold leading-tight">Stub 票据短链</div>
            <div className="truncate text-[10px] font-mono text-[var(--ink-3)]">
              {user?.email || "shortlink_app"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="stub-pill stub-pill-ok">● 7d Token</span>
          {isAdmin && <span className="stub-pill stub-pill-accent">Admin</span>}
          <NotificationCenter key={token} token={token} onOpenLink={(linkId) => {
            setPendingLink({ token, linkId });
            setActiveTab("links");
          }} />
        </div>
      </header>

      {/* Scrollable Tab Viewport */}
      <main className="m-scroll">
        {activeTab === "links" && (
          <LinksTab
            key={token}
            refreshTrigger={refreshTrigger}
            openLinkId={pendingLink?.token === token ? pendingLink.linkId : undefined}
            onOpenedLink={onOpenedLink}
            clipboardChecked={clipboardChecked}
            clipboardUrl={clipboardUrl}
            onClipboardChecked={() => setClipboardChecked(true)}
            onClipboardUrlChange={setClipboardUrl}
            onOpenCreateWithUrl={(url) => {
              if (!hasPermission("links.create_url")) return;
              setSourceLink(null);
              setPresetAsset(null);
              setPresetUrl(url);
              setCreateOpen(true);
            }}
            onCopyConfiguration={(link) => {
              if (!hasPermission(link.target.type === "url" ? "links.create_url" : "links.create_asset")) return;
              setPresetUrl(undefined);
              setPresetAsset(null);
              setSourceLink(link);
              setCreateOpen(true);
            }}
          />
        )}
        {activeTab === "assets" && (
          <AssetsTab
            refreshTrigger={refreshTrigger}
            onCreateAssetLink={(asset) => {
              if (!hasPermission("links.create_asset")) return;
              setSourceLink(null);
              setPresetUrl(undefined);
              setPresetAsset(asset);
              setCreateOpen(true);
            }}
          />
        )}
        {activeTab === "stats" && <StatsTab />}
        {activeTab === "me" && <MeTab />}
      </main>

      {/* 5-Slot Bottom Tab Bar with Center Signal-Orange FAB */}
      <nav className="m-tabbar">
        <button
          type="button"
          onClick={() => setActiveTab("links")}
          className={`m-tab ${activeTab === "links" ? "active" : ""}`}
        >
          <Link2 className="w-4 h-4" />
          <span>短链</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("assets")}
          className={`m-tab ${activeTab === "assets" ? "active" : ""}`}
        >
          <FolderArchive className="w-4 h-4" />
          <span>素材</span>
        </button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => {
            setSourceLink(null);
            setPresetUrl(undefined);
            setPresetAsset(null);
            setCreateOpen(true);
          }}
          className="m-fab"
          aria-label="新建短链"
        >
          <Plus className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`m-tab ${activeTab === "stats" ? "active" : ""}`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>统计</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("me")}
          className={`m-tab ${activeTab === "me" ? "active" : ""}`}
        >
          <User className="w-4 h-4" />
          <span>我的</span>
        </button>
      </nav>

      {/* Global Create Short Link Sheet */}
      <MobileCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        presetUrl={presetUrl}
        presetAsset={presetAsset}
        sourceLink={sourceLink}
        onCreated={() => {
          setRefreshTrigger((n) => n + 1);
          setActiveTab("links");
        }}
      />
    </div>
  );
}

export default function App() {
  const dark = useThemeStore((s) => s.dark);
  return (
    <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
      <AntdApp>
        <MobileShell />
      </AntdApp>
    </ConfigProvider>
  );
}
