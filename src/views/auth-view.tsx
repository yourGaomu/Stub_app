import { useEffect, useState } from "react";
import { App } from "antd";
import { Server, Sun, Moon } from "lucide-react";
import { authApi } from "../services/api";
import { getAppDeviceInfo, useAuthStore } from "../stores/auth-store";
import { useThemeStore } from "../stores/theme-store";
import { getServerBaseURL, setServerBaseURL } from "../lib/format";

export function AuthView() {
  const { message } = App.useApp();
  const setLoginResult = useAuthStore((s) => s.setLoginResult);
  const { dark, toggleTheme } = useThemeStore();

  const [tab, setTab] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);

  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getServerBaseURL());

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendCode = async (purpose: "register" | "password_reset") => {
    if (!email.trim()) {
      message.warning("请先填写邮箱地址");
      return;
    }
    try {
      await authApi.requestEmailCode({
        email: email.trim(),
        purpose,
        inviteCode: purpose === "register" && inviteCode.trim() ? inviteCode.trim() : undefined,
      });
      setCountdown(60);
      message.success("验证码已发送至邮箱（有效期 10 分钟）");
    } catch (err: any) {
      message.error(err?.message || "发送验证码失败");
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      message.warning("请输入邮箱与密码");
      return;
    }
    setLoading(true);
    try {
      const device = getAppDeviceInfo();
      const res = await authApi.login({
        email: email.trim(),
        password,
        ...device,
      });
      await setLoginResult(res.accessToken, res.user, res.expiresAt);
      message.success("登录成功");
    } catch (err: any) {
      message.error(err?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password || !verificationCode.trim()) {
      message.warning("请完整填写邮箱、密码与邮箱验证码");
      return;
    }
    setLoading(true);
    try {
      await authApi.register({
        email: email.trim(),
        password,
        verificationCode: verificationCode.trim(),
        inviteCode: inviteCode.trim() || undefined,
      });
      const device = getAppDeviceInfo();
      const loginRes = await authApi.login({
        email: email.trim(),
        password,
        ...device,
      });
      await setLoginResult(loginRes.accessToken, loginRes.user, loginRes.expiresAt);
      message.success("注册并登录成功");
    } catch (err: any) {
      message.error(err?.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim() || !verificationCode.trim() || !newPassword) {
      message.warning("请填写邮箱、验证码与新密码");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({
        email: email.trim(),
        verificationCode: verificationCode.trim(),
        newPassword,
      });
      message.success("密码已重置，所有旧设备会话已失效，请重新登录");
      setTab("login");
      setPassword("");
    } catch (err: any) {
      message.error(err?.message || "重置密码失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServer = () => {
    setServerBaseURL(serverUrl);
    message.success(`服务端地址已更新为 ${getServerBaseURL()}`);
    setShowServerConfig(false);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 bg-[var(--bg)] text-[var(--ink)]">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="Stub" className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-sm font-extrabold leading-tight">Stub Mobile</div>
            <div className="text-[10px] font-mono text-[var(--ink-3)]">
              X-Client-App: shortlink_app
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowServerConfig((v) => !v)}
            className="stub-pill cursor-pointer"
          >
            <Server className="w-3 h-3" /> 节点
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="stub-pill cursor-pointer"
            title="切换深浅色"
          >
            {dark ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="my-auto py-6">
        {showServerConfig && (
          <div className="m-ticket mb-3">
            <div className="text-xs font-extrabold mb-1">API 服务端地址配置</div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] mb-2">
              打包 APK / iOS 真机运行时指向线上后端域名
            </div>
            <div className="flex gap-1.5">
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://stubapi.mikasa.wiki"
                className="flex-1 px-2.5 py-1.5 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleSaveServer}
                className="stub-btn stub-btn-primary text-xs px-3 py-1.5"
              >
                保存
              </button>
            </div>
          </div>
        )}

        <div className="m-ticket">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-extrabold">短链与私有素材工作台</div>
              <div className="text-[11px] font-mono text-[var(--ink-3)]">
                7天免登令牌 · 剪贴板感知 · 移动管理端
              </div>
            </div>
            <span className="stub-pill stub-pill-accent">v1</span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-sm border border-[var(--line)] bg-[var(--bg-card)] mb-3 text-xs">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`py-1.5 rounded-sm font-bold ${
                tab === "login" ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--ink-3)]"
              }`}
            >
              账号登录
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`py-1.5 rounded-sm font-bold ${
                tab === "register" ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--ink-3)]"
              }`}
            >
              邀请码注册
            </button>
            <button
              type="button"
              onClick={() => setTab("reset")}
              className={`py-1.5 rounded-sm font-bold ${
                tab === "reset" ? "bg-[var(--ink)] text-[var(--bg)]" : "text-[var(--ink-3)]"
              }`}
            >
              找回密码
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                邮箱地址 · EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mikasa.wiki"
                className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg)] font-mono text-xs"
              />
            </div>

            {tab !== "reset" && (
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  登录密码 · PASSWORD (8~72位)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg)] font-mono text-xs"
                />
              </div>
            )}

            {tab === "register" && (
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  单次邀请码 · INVITE CODE（公开注册关闭时必填）
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="INV-XXXX-XXXX"
                  className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg)] font-mono text-xs"
                />
              </div>
            )}

            {(tab === "register" || tab === "reset") && (
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  邮箱 6 位验证码 · CODE
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="6 位数字验证码"
                    className="flex-1 px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg)] font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={countdown > 0}
                    onClick={() =>
                      handleSendCode(tab === "register" ? "register" : "password_reset")
                    }
                    className="stub-btn stub-btn-ghost px-2.5 text-xs whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : "发送验证码"}
                  </button>
                </div>
              </div>
            )}

            {tab === "reset" && (
              <div>
                <label className="block text-[11px] font-mono text-[var(--ink-3)] mb-1">
                  设置新密码 · NEW PASSWORD (8~72位)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                  className="w-full px-2.5 py-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg)] font-mono text-xs"
                />
              </div>
            )}

            <div className="pt-1">
              {tab === "login" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleLogin}
                  className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
                >
                  {loading ? "正在签发会话..." : "立即登录 · 签发 7 天令牌"}
                </button>
              )}
              {tab === "register" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRegister}
                  className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
                >
                  {loading ? "正在注册..." : "验证并注册账号"}
                </button>
              )}
              {tab === "reset" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResetPassword}
                  className="stub-btn stub-btn-accent w-full py-2.5 text-sm"
                >
                  {loading ? "重置中..." : "确认重置并吊销旧设备"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] font-mono text-[var(--ink-3)] pb-2">
        Server: {getServerBaseURL()}
      </div>
    </div>
  );
}
