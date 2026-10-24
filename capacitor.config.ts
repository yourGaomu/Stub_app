import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "wiki.mikasa.stub.app",
  appName: "Stub 短链",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#f2eee4",
    },
  },
};

export default config;
