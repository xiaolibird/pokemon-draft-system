"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api/fetch";
import AuthLayout from "@/app/components/AuthLayout";
import {
  AuthInput,
  AuthButton,
  BackButton,
} from "@/app/components/AuthComponents";

export default function PlayerLogin() {
  const [accessKey, setAccessKey] = useState("");
  const [username, setUsername] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.title = "宝可梦选秀系统-选手登录";

    // Handle forced logout via query param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("logout") === "true") {
      localStorage.removeItem("playerId");
      localStorage.removeItem("contestId");
      router.replace("/player/login");
      return;
    }

    // 从 room 被踢回（401/403/404）：确保缓存已清，显示对应提示
    const reason = urlParams.get("reason");
    if (reason === "session_expired" || reason === "contest_not_found") {
      localStorage.removeItem("playerId");
      localStorage.removeItem("contestId");
      setError(
        reason === "session_expired"
          ? "登录已过期，请重新输入密钥"
          : "比赛不存在或已结束，请重新登录",
      );
      router.replace("/player/login");
      return;
    }

    // 如果 localStorage 有值但用户仍在登录页，可能是 room 跳转失败（比赛不存在/已结束）
    // 延迟检查：如果 2 秒后还在登录页且有 localStorage，清除缓存避免循环
    const storedPlayerId = localStorage.getItem("playerId");
    const storedContestId = localStorage.getItem("contestId");
    if (storedPlayerId && storedContestId) {
      const timeoutId = setTimeout(() => {
        // 如果还在登录页（说明 room 跳转失败），清除缓存
        if (window.location.pathname === "/player/login") {
          localStorage.removeItem("playerId");
          localStorage.removeItem("contestId");
          setError("检测到无效的登录状态，已自动清除缓存，请重新登录");
        }
      }, 2000);
      router.push("/player/room");
      return () => clearTimeout(timeoutId);
    }
  }, [router]);

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/player/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });

      if (res.ok) {
        const data = await res.json();

        if (data.username.startsWith("选手")) {
          setShowNameInput(true);
        } else {
          localStorage.setItem("playerId", data.playerId);
          localStorage.setItem("contestId", data.contestId);
          router.push("/player/room");
        }
      } else {
        const err = await res.json();
        setError(err.error || "验证失败");
      }
    } catch (err) {
      setError("网络连接异常");
    } finally {
      setLoading(false);
    }
  };

  const handleSetName = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError("请输入昵称");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/player/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey, username: username.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("playerId", data.playerId);
        localStorage.setItem("contestId", data.contestId);
        router.push("/player/room");
      } else {
        const err = await res.json();
        setError(err.error || "设置失败");
      }
    } catch (err) {
      setError("网络连接异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="animate-in fade-in slide-in-from-bottom-4 relative w-full max-w-md duration-500">
        <BackButton />

        <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl md:p-10">
          <div className="mb-10 text-center">
            <h1 className="mb-2 bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-400 bg-clip-text text-4xl font-black text-transparent">
              {showNameInput ? "设置昵称" : "选手登场"}
            </h1>
            <p className="text-sm text-slate-400">
              {showNameInput
                ? "请设置你的显示昵称"
                : "请输入比赛组织者分发的邀请密钥"}
            </p>
          </div>

          {error && (
            <div className="mb-8 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-400">
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          {!showNameInput ? (
            <form onSubmit={handleVerifyKey} className="space-y-8">
              <div>
                <div className="group relative">
                  <AuthInput
                    type="text"
                    placeholder="在此输入您的密钥..."
                    className="text-center font-mono text-xl tracking-widest uppercase"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value.toUpperCase())}
                    required
                    maxLength={8}
                  />
                </div>
              </div>

              <AuthButton
                type="submit"
                isLoading={loading}
                loadingText="正在验证..."
                gradient="brand"
              >
                验证并继续
              </AuthButton>
            </form>
          ) : (
            <form onSubmit={handleSetName} className="space-y-8">
              <div>
                <div className="group relative">
                  <AuthInput
                    type="text"
                    placeholder="输入你的昵称..."
                    className="text-center text-xl font-bold"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    maxLength={20}
                  />
                </div>
              </div>

              <AuthButton
                type="submit"
                isLoading={loading}
                loadingText="正在进入..."
                gradient="brand"
              >
                进入选秀室
              </AuthButton>
            </form>
          )}

          <div className="mt-10 border-t border-white/5 pt-6 text-center">
            <p className="text-xs leading-loose text-slate-500">
              没有密钥？请联系您的比赛管理员。
              <br />
              或在首页选择管理员模式创建自己的比赛。
            </p>

            <div className="mt-4">
              <a
                href="/api/player/logout"
                className="text-xs text-slate-400 underline hover:text-slate-300"
                onClick={(e) => {
                  e.preventDefault();
                  localStorage.removeItem("playerId");
                  localStorage.removeItem("contestId");
                  window.location.href = "/api/player/logout";
                }}
              >
                清除缓存并重新登录
              </a>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
