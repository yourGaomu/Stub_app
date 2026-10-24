import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

export function getAntThemeConfig(dark = false): ThemeConfig {
  if (dark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorPrimary: "#ff5929",
        colorBgBase: "#141310",
        colorBgContainer: "#22201b",
        colorBgElevated: "#22201b",
        colorTextBase: "#f2eee4",
        colorBorder: "#403c33",
        borderRadius: 6,
      },
    };
  }
  return {
    algorithm: antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#17150f",
      colorBgBase: "#f2eee4",
      colorBgContainer: "#fbf9f4",
      colorBgElevated: "#fbf9f4",
      colorTextBase: "#17150f",
      colorBorder: "#c6bca5",
      borderRadius: 6,
    },
  };
}
