import { Capacitor } from "@capacitor/core";
import { create } from "zustand";
import { authApi } from "@/services/api";
import { ApiError, getStoredToken, setStoredToken } from "@/services/api/client";
import type { BusinessItem, PermissionState, UsageResponse, User } from "@/services/api/types";

const DEVICE_ID_KEY = "stub_app_device_instance_id";

export function getAppDeviceInfo() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `app_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  const capPlatform = Capacitor.getPlatform();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform =
    capPlatform === "android" || ua.includes("Android")
      ? "Android"
      : capPlatform === "ios" || /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : "Mobile";
  return {
    deviceInstanceId: id,
    deviceName: `Stub App · ${platform}`,
    platform,
  };
}

let bootstrapInFlight: { token: string; promise: Promise<void> } | null = null;

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  isAdmin: boolean;
  permissions: Record<string, boolean>;
  permissionItems: PermissionState[];
  businesses: BusinessItem[];
  usage: UsageResponse | null;
  loading: boolean;
  initialized: boolean;
  bootstrapError: string | null;
  setLoginResult: (token: string, user: User, expiresAt?: string) => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  logout: () => Promise<void>;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  expiresAt: localStorage.getItem("stub_app_token_expires_at"),
  user: null,
  isAdmin: false,
  permissions: {},
  permissionItems: [],
  businesses: [],
  usage: null,
  loading: false,
  initialized: false,
  bootstrapError: null,

  setLoginResult: async (token, user, expiresAt) => {
    setStoredToken(token);
    if (expiresAt) {
      localStorage.setItem("stub_app_token_expires_at", expiresAt);
    } else {
      localStorage.removeItem("stub_app_token_expires_at");
    }
    set({
      token, user, expiresAt: expiresAt || null, isAdmin: user.role === "admin",
      permissions: {}, permissionItems: [], businesses: [], usage: null,
      initialized: false, bootstrapError: null,
    });
    await get().refreshBootstrap();
  },

  refreshBootstrap: async () => {
    const token = getStoredToken();
    if (!token) {
      get().clearSession();
      return;
    }
    if (bootstrapInFlight?.token === token) return bootstrapInFlight.promise;
    const promise = (async () => {
      set({ loading: true, bootstrapError: null });
      try {
        const [user, perms, biz, usage] = await Promise.all([
          authApi.me(),
          authApi.myPermissions(),
          authApi.myBusinesses(),
          authApi.myUsage(),
        ]);
        if (getStoredToken() !== token || get().token !== token) return;
        const permMap: Record<string, boolean> = {};
        perms.items.forEach((p) => { permMap[p.code] = p.enabled; });
        set({
          token, user,
          isAdmin: user.role === "admin" || perms.isAdmin,
          permissions: permMap, permissionItems: perms.items,
          businesses: biz.items, usage, loading: false,
          initialized: true, bootstrapError: null,
        });
      } catch (err) {
        if (getStoredToken() !== token || get().token !== token) return;
        if (err instanceof ApiError && err.status === 401) {
          get().clearSession();
        } else {
          set({ loading: false, bootstrapError: err instanceof Error ? err.message : "账号信息加载失败，请重试" });
        }
      }
    })();
    bootstrapInFlight = { token, promise };
    try { await promise; } finally {
      if (bootstrapInFlight?.promise === promise) bootstrapInFlight = null;
    }
  },

  refreshUsage: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const usage = await authApi.myUsage();
      if (get().token === token && getStoredToken() === token) set({ usage });
    } catch {
      // ignore
    }
  },

  hasPermission: (code: string) => {
    const { isAdmin, permissions } = get();
    if (isAdmin) return true;
    return Boolean(permissions[code]);
  },

  logout: async () => {
    try {
      if (get().token) {
        await authApi.logout();
      }
    } catch {
      // ignore
    } finally {
      get().clearSession();
    }
  },

  clearSession: () => {
    setStoredToken(null);
    localStorage.removeItem("stub_app_token_expires_at");
    set({
      token: null,
      expiresAt: null,
      user: null,
      isAdmin: false,
      permissions: {},
      permissionItems: [],
      businesses: [],
      usage: null,
      loading: false,
      initialized: true,
      bootstrapError: null,
    });
  },
}));

window.addEventListener("stub:unauthorized", () => {
  if (!getStoredToken()) useAuthStore.getState().clearSession();
});
