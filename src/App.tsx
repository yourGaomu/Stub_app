import { useEffect, useState } from "react";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { Link2, FolderArchive, BarChart3, User, Plus } from "lucide-react";
import { getAntThemeConfig } from "./lib/app-theme";
import { useAuthStore } from "./stores/auth-store";
import { useThemeStore } from "./stores/theme-store";
import { authApi } from "./services/api";
import type { AssetDTO } from "./services/api/types";
import { AuthView } from "./views/auth-view";
import { LinksTab } from "./views/links-tab";
import { AssetsTab } from "./views/assets-tab";
import { StatsTab } from "./views/stats-tab";
import { MeTab } from "./views/me-tab";
import { MobileCreateSheet } from "./components/mobile-create-sheet";

function MobileShell() {
  const { token, user, isAdmin, refreshBootstrap } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"links" | "assets" | "stats" | "me">("links");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [presetUrl, setPresetUrl] = useState<string | undefined>(undefined);
  const [presetAsset, setPresetAsset] = useState<AssetDTO | null>(null);

  // Sync /me bootstrap and 5-minute session heartbeat
  useEffect(() => {
    if (!token) return;
    refreshBootstrap();

    authApi.heartbeat().catch(() => {});
    const timer = setInterval(() => {
      authApi.heartbeat().catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token]);

  if (!token) {
    return <AuthView />;
  }

  return (
    <div className="m-app-shell">
      {/* Top App Bar */}
      <header className="m-topbar">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="Stub" className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-sm font-extrabold leading-tight">Stub 票据短链</div>
            <div className="text-[10px] font-mono text-[var(--ink-3)]">
              {user?.email || "shortlink_app"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="stub-pill stub-pill-ok">● 7d Token</span>
          {isAdmin && <span className="stub-pill stub-pill-accent">Admin</span>}
        </div>
      </header>

      {/* Scrollable Tab Viewport */}
      <main className="m-scroll">
        {activeTab === "links" && (
          <LinksTab
            refreshTrigger={refreshTrigger}
            onOpenCreateWithUrl={(url) => {
              setPresetAsset(null);
              setPresetUrl(url);
              setCreateOpen(true);
            }}
          />
        )}
        {activeTab === "assets" && (
          <AssetsTab
            refreshTrigger={refreshTrigger}
            onCreateAssetLink={(asset) => {
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
          onClick={() => {
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
