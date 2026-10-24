# Stub Mobile App (`shortlink_app`)

Stub 短链与私有素材服务的移动端项目（Android & iOS），基于 **React 18 + TypeScript + Tailwind CSS + Capacitor** 构建，请求头默认携带 `X-Client-App: shortlink_app`。

## 核心特性

- **五栏拇指底部导航 (`短链` / `素材` / 中央信号橙 `＋` / `统计` / `我的`)**：专为手机单手操作设计的齿孔票根 (Perforated Ticket) 界面。
- **剪贴板 HTTPS 链接感知 (`@capacitor/clipboard`)**：打开 App 自动识别剪贴板长链，一键弹出抽屉转短链。
- **快捷场景预设**：支持「🔥 阅后即焚（1次有效 + 随机口令 + 24h）」、「📦 客户交付」、「🌐 公开分享」及票据二维码生成保存。
- **手机相册与文件直传 MinIO**：支持按业务桶上传素材、生成素材短链、7 天回收站恢复。
- **完整管理员治理专区 (Admin Console)**：支持在手机端审批并调整用户 13 项细粒度权限、十进制 MB 配额、注册 MinIO 业务桶、控制全局注册开关及查看未知短码探测告警。
- **暖纸浅色 / 暗夜票根深色双主题**：一键切换并持久化。

## 快速开始（本地开发）

```bash
cd D:\Go_All\short_links\app
npm install
npm run dev
```

默认本地开发端口为 `http://localhost:5174`，也可在登录页右上角点击「节点」自由切换后端 API 地址（默认指向 `https://stubapi.mikasa.wiki`）。

## 打包 Android APK / iOS 原生工程

1. 构建前端静态产物：
   ```bash
   npm run build
   ```
2. 初始化原生平台（首次执行一次即可）：
   ```bash
   npx cap add android
   npx cap add ios
   ```
3. 同步前端产物到原生工程：
   ```bash
   npx cap sync
   ```
4. 打开 Android Studio 编译 APK 或真机调试：
   ```bash
   npx cap open android
   ```
   （iOS 在 macOS 下执行 `npx cap open ios` 使用 Xcode 签名构建）
