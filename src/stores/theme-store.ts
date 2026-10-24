import { create } from "zustand";

const THEME_STORAGE_KEY = "stub_app_theme_mode";

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const isDark = saved === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  return isDark;
}

interface ThemeState {
  dark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  dark: getInitialDark(),
  toggleTheme: () =>
    set((state) => {
      const next = !state.dark;
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return { dark: next };
    }),
}));
