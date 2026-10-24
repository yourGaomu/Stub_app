import { Capacitor } from "@capacitor/core";
import { create } from "zustand";
import { authApi } from "@/services/api";
import { getStoredToken, setStoredToken } from "@/services/api/client";
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

  setLoginResult: async (token, user, expiresAt) => {
    setStoredToken(token);
    if (expiresAt) {
      localStorage.setItem("stub_app_token_expires_at", expiresAt);
    }
    set({ token, user, expiresAt: expiresAt || null, isAdmin: user.role === "admin" });
    await get().refreshBootstrap();
  },

  refreshBootstrap: async () => {
    const token = getStoredToken();
    if (!token) {
      set({
        token: null,
        user: null,
        isAdmin: false,
        permissions: {},
        permissionItems: [],
        businesses: [],
        usage: null,
        initialized: true,
      });
      return;
    }
    set({ loading: true });
    try {
      const [user, perms, biz, usage] = await Promise.all([
        authApi.me(),
        authApi.myPermissions(),
        authApi.myBusinesses(),
        authApi.myUsage(),
      ]);
      const permMap: Record<string, boolean> = {};
      perms.items.forEach((p) => {
        permMap[p.code] = p.enabled;
      });
      set({
        token,
        user,
        isAdmin: user.role === "admin" || perms.isAdmin,
        permissions: permMap,
        permissionItems: perms.items,
        businesses: biz.items,
        usage,
        loading: false,
        initialized: true,
      });
    } catch {
      setStoredToken(null);
      set({
        token: null,
        user: null,
        isAdmin: false,
        permissions: {},
        permissionItems: [],
        businesses: [],
        usage: null,
        loading: false,
        initialized: true,
      });
    }
  },

  refreshUsage: async () => {
    if (!get().token) return;
    try {
      const usage = await authApi.myUsage();
      set({ usage });
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
      initialized: true,
    });
  },
}));
