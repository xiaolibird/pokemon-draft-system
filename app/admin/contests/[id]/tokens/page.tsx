"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/app/lib/api/fetch";
import { Header, HomeButton } from "@/app/components/Header";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function ContestTokens() {
  const { id } = useParams();
  const [tokens, setTokens] = useState<any[]>([]);
  const [playerCount, setPlayerCount] = useState(4);
  const [loading, setLoading] = useState(true);
  const [generated, setGenerated] = useState(false);

  const [contest, setContest] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (player: any) => {
    setEditingId(player.id);
    setEditName(player.username || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await apiFetch(`/api/admin/players/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editName }),
      });
      if (res.ok) {
        setTokens((prev) =>
          prev.map((p) =>
            p.id === editingId ? { ...p, username: editName } : p,
          ),
        );
        setEditingId(null);
      } else {
        alert("保存失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  const downloadCSV = () => {
    const headers = ["Username", "Access Key", "Tokens", "Contest ID"];
    const rows = tokens.map((t) => [
      `"${t.username || ""}"`,
      `"${t.accessKey}"`,
      t.tokens,
      `"${t.contestId}"`,
    ]);
    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `contest_tokens_${id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    document.title = "宝可梦选秀系统-选手密钥";
  }, []);
  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      // Load contest details for status
      const contestRes = await apiFetch(`/api/admin/contests/${id}`);
      if (contestRes.ok) {
        const contestData = await contestRes.json();
        setContest(contestData);
      }

      // Load existing players
      const playersRes = await apiFetch(`/api/admin/contests/${id}/players`);
      if (playersRes.ok) {
        const data = await playersRes.json();
        if (data.length > 0) {
          setTokens(data);
          setGenerated(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateTokens = async () => {
    if (generated && !confirm("重新生成将使所有旧密钥失效，确定要继续吗？"))
      return;

    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/contests/${id}/generate-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerCount }),
      });

      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens);
        setGenerated(true);
      } else {
        const err = await res.json();
        alert(err.error || "生成失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async (token: string) => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(token);
        alert("已复制到剪贴板");
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = token;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, token.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        alert("已复制到剪贴板");
      } else {
        alert("复制失败，请手动选择密钥复制");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = token;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, token.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      alert(ok ? "已复制到剪贴板" : "复制失败，请手动选择密钥复制");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 transition-colors dark:bg-gray-950">
      <div className="mx-auto max-w-4xl">
        <Header
          variant="admin"
          title={
            <div>
              <h1 className="text-xl leading-tight font-black break-words whitespace-normal text-gray-800 md:text-2xl">
                选手密钥管理
              </h1>
              {contest && (
                <p
                  className={`mt-1 text-xs font-bold md:text-sm ${contest.status === "PENDING" ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}
                >
                  状态:{" "}
                  {contest.status === "PENDING"
                    ? "未开始 (可重新生成)"
                    : "已开始 (只读)"}
                </p>
              )}
            </div>
          }
          leftSlot={<HomeButton href="/admin/dashboard" />}
          rightSlot={<ThemeToggle />}
          className="mb-8 border-b-0 bg-transparent p-0 shadow-none"
        />

        {/* Generation Form */}
        {(!generated || contest?.status === "PENDING") && (
          <div className="mb-8 rounded-2xl border bg-white p-8 shadow-sm dark:border-white/5 dark:bg-gray-900">
            <h2 className="mb-4 text-xl font-black dark:text-white">
              {generated ? "重新生成密钥" : "生成新密钥"}
            </h2>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-sm font-bold text-gray-600 dark:text-gray-400">
                  选手数量
                </label>
                <input
                  type="number"
                  min="2"
                  max="16"
                  value={playerCount}
                  onChange={(e) => setPlayerCount(+e.target.value)}
                  className="w-full rounded-xl border bg-white p-3 font-mono text-lg outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                />
              </div>
              <button
                onClick={generateTokens}
                disabled={loading}
                className={`h-[52px] rounded-xl px-8 py-3 font-bold text-white transition ${
                  generated
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {loading ? "载入中" : generated ? "重新生成" : "生成密钥"}
              </button>
            </div>
            {generated && (
              <p className="mt-2 text-xs font-bold text-red-500">
                ⚠️ 重新生成将删除现有选手并使旧密钥失效
              </p>
            )}
          </div>
        )}

        {/* Token List */}
        {generated && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4 font-bold text-green-800 dark:border-green-800/30 dark:bg-green-900/10 dark:text-green-400">
              <span>✓ 当前有效密钥: {tokens.length} 个</span>
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition hover:bg-green-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                下载 CSV
              </button>
            </div>

            <div className="grid gap-4">
              {tokens.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border bg-white p-6 shadow-sm dark:border-white/5 dark:bg-gray-900"
                >
                  <div className="flex-1">
                    {editingId === t.id ? (
                      <div className="mb-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded border bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                          placeholder="输入昵称"
                          autoFocus
                        />
                        <button
                          onClick={saveEdit}
                          className="text-green-600 hover:text-green-700"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="group mb-1 flex items-center gap-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t.username || "未设置昵称"}
                        </p>
                        <button
                          onClick={() => startEdit(t)}
                          className="text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-blue-500"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                    <p className="font-mono text-2xl font-black tracking-widest text-blue-600 select-all dark:text-blue-400">
                      {t.accessKey}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToken(t.accessKey)}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
                  >
                    复制
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800/30 dark:bg-yellow-900/10 dark:text-yellow-400">
              <strong>提示：</strong>{" "}
              请将这些密钥分发给对应的选手。选手首次登录时可以设置自己的昵称。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
