"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api/fetch";
import { Header } from "@/app/components/Header";
import { HeaderButton } from "@/app/components/HeaderButton";
import ThemeToggle from "@/app/components/ThemeToggle";

declare global {
  interface Window {
    __BUILD_VERSION__: string;
  }
}

export default function AdminDashboard() {
  const router = useRouter();

  // Data State
  const [contests, setContests] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 1,
    current: 1,
    limit: 12,
  });
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PENDING" | "ACTIVE" | "COMPLETED" | "PAUSED"
  >("ACTIVE");

  // Initialize build version from window object
  const [buildVersion] = useState(() => {
    if (typeof window !== "undefined") {
      return window.__BUILD_VERSION__ || "dev";
    }
    return "dev";
  });

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (searchQuery !== debouncedSearch) {
        setPagination((prev) => ({ ...prev, current: 1 })); // Reset to page 1 on new search
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Data
  useEffect(() => {
    document.title = "宝可梦选秀系统-后台管理";
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const params = new URLSearchParams({
        page: pagination.current.toString(),
        limit: pagination.limit.toString(),
        status: statusFilter,
        search: debouncedSearch,
      });

      try {
        const res = await apiFetch(
          `/api/admin/contests/list?${params.toString()}`,
        );
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
          setContests(data.data);
          setPagination((prev) => ({ ...prev, ...data.pagination }));
        } else {
          setContests([]);
        }
      } catch {
        setContests([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [pagination.current, pagination.limit, statusFilter, debouncedSearch]);

  // Reset to page 1 when filter changes
  const handleStatusChange = (status: any) => {
    setStatusFilter(status);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, current: page }));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans transition-colors dark:bg-gray-950">
      <Header
        variant="admin"
        title={
          <div className="flex flex-col">
            <h1 className="text-2xl leading-tight font-black tracking-tight break-words whitespace-normal text-gray-800 dark:text-white">
              后台管理中心
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-500 dark:bg-blue-500/20 dark:text-blue-400">
                VER: {buildVersion}
              </span>
            </div>
          </div>
        }
        rightSlot={
          <>
            <HeaderButton
              variant="link"
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch("/api/auth/logout", { method: "POST" });
                  router.push("/admin/login");
                } catch {
                  window.location.href = "/api/auth/logout";
                }
              }}
            >
              退出
            </HeaderButton>
            <ThemeToggle />
            <HeaderButton
              as="link"
              href="/admin/contests/create"
              variant="primary"
              icon={
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              }
            >
              创建新比赛
            </HeaderButton>
          </>
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats Overview */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              label: "搜索结果",
              value: pagination.total,
              color: "text-gray-800",
              bg: "bg-white",
            },
            // Note: Quick stats below might be inaccurate if we only fetch paginated data.
            // For accurate global stats, we'd need a separate stats API endpoint.
            // Keeping them as placeholders or removing for now to avoid confusion.
            // Ideally, we fetch global stats separately.
            // Reusing pagination total for now as "Found Items"
          ].map((stat, idx) => (
            <div
              key={idx}
              className={`${stat.bg} col-span-2 rounded-2xl border border-transparent p-4 shadow-sm transition hover:border-gray-200 md:col-span-4 dark:border-white/5 dark:bg-gray-900 dark:hover:border-white/10`}
            >
              <p className="mb-1 text-xs font-bold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {stat.label}
              </p>
              <h3
                className={`text-2xl font-black ${stat.color} dark:text-white`}
              >
                {stat.value}
              </h3>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Status Tabs */}
          <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-gray-200/50 p-1">
            {(["ACTIVE", "ALL", "PENDING", "PAUSED", "COMPLETED"] as const).map(
              (status) => {
                const labelMap: Record<string, string> = {
                  ALL: "全部",
                  ACTIVE: "进行中",
                  PENDING: "待启动",
                  PAUSED: "暂停中",
                  COMPLETED: "已结束",
                };
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`rounded-lg px-4 py-1.5 text-sm font-bold whitespace-nowrap transition-all ${isActive ? "bg-white text-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"} `}
                  >
                    {labelMap[status]}
                  </button>
                );
              },
            )}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-80">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="搜索比赛名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pr-4 pl-10 text-gray-900 transition focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="grid animate-pulse grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl bg-gray-200 dark:bg-white/5"
              ></div>
            ))}
          </div>
        ) : contests.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center dark:border-white/10 dark:bg-gray-900">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-400 dark:bg-white/5">
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-500 dark:text-gray-400">
              暂无符合条件的比赛
            </p>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              尝试调整筛选条件或搜索关键词
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                handleStatusChange("ACTIVE");
              }}
              className="mt-4 font-bold text-blue-600 hover:underline dark:text-blue-400"
            >
              清除所有筛选
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {contests.map((contest: any) => {
              const isSnake = contest.draftMode === "SNAKE";
              const theme = isSnake
                ? {
                    bg: "from-gray-100 to-gray-300",
                    accent: "text-gray-700",
                    img: "/images/968Orthworm.webp",
                    badge: "bg-gray-800 text-white",
                  }
                : {
                    bg: "from-amber-100 to-yellow-200",
                    accent: "text-amber-800",
                    img: "/images/gimmighoul-bg.webp",
                    badge: "bg-yellow-600 text-white",
                  };

              return (
                <Link
                  key={contest.id}
                  href={`/admin/contests/${contest.id}`}
                  className="group relative flex aspect-[4/3] flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white px-6 pt-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:border-white/5 dark:bg-gray-900"
                >
                  {/* Background Image & Gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${theme.bg} opacity-30 transition-opacity group-hover:opacity-40`}
                  ></div>
                  <img
                    src={theme.img}
                    className="absolute -right-8 -bottom-8 h-64 w-64 object-contain opacity-40 mix-blend-multiply blur-[1px] filter transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 group-hover:opacity-60"
                    alt=""
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent dark:from-gray-900/90"></div>

                  {/* Content */}
                  <div className="relative z-10 flex h-full flex-col">
                    {/* Header Tags */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex gap-2">
                        <span
                          className={`rounded-md px-2 py-1 text-[10px] font-black tracking-wide ${theme.badge}`}
                        >
                          {isSnake ? "蛇形选秀" : "竞价选秀"}
                        </span>
                        <span
                          className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                            contest.status === "PENDING"
                              ? "bg-orange-100 text-orange-600"
                              : contest.status === "ACTIVE"
                                ? "bg-green-100 text-green-600"
                                : contest.status === "PAUSED"
                                  ? "bg-yellow-100 text-yellow-600"
                                  : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {contest.status === "PENDING"
                            ? "待启动"
                            : contest.status === "ACTIVE"
                              ? "进行中"
                              : contest.status === "PAUSED"
                                ? "暂停中"
                                : "已结束"}
                        </span>
                      </div>
                      {/* Date */}
                      <span className="rounded-full bg-white/50 px-2 py-1 text-[10px] font-bold text-gray-400 backdrop-blur dark:bg-black/30">
                        {
                          new Date(contest.createdAt)
                            .toISOString()
                            .split("T")[0]
                        }
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="mb-2 line-clamp-2 text-xl leading-tight font-black text-gray-900 transition group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
                      {contest.name}
                    </h3>

                    {/* Stats Grid */}
                    <div className="mt-auto mb-6 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/50 bg-white/60 p-2 backdrop-blur-sm dark:border-white/5 dark:bg-black/20">
                        <div className="text-[10px] font-bold text-gray-500 uppercase dark:text-gray-400">
                          玩家数
                        </div>
                        <div className="text-lg font-black text-gray-800 dark:text-gray-200">
                          {contest._count.players}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/50 bg-white/60 p-2 backdrop-blur-sm dark:border-white/5 dark:bg-black/20">
                        <div className="text-[10px] font-bold text-gray-500 uppercase dark:text-gray-400">
                          宝可梦池
                        </div>
                        <div className="text-lg font-black text-gray-800 dark:text-gray-200">
                          {contest._count.pokemonPool}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Hint */}
                  <div className="absolute right-6 bottom-4 translate-x-4 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
                    <span className="flex items-center gap-1 text-sm font-black text-blue-600 dark:text-blue-400">
                      管理比赛{" "}
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
                          d="M17 8l4 4m0 0l-4 4m4-4H3"
                        />
                      </svg>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() =>
                handlePageChange(Math.max(1, pagination.current - 1))
              }
              disabled={pagination.current === 1}
              className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="no-scrollbar flex max-w-[200px] gap-1 overflow-x-auto md:max-w-none">
              {Array.from({ length: pagination.pages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => handlePageChange(i + 1)}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold transition ${
                    pagination.current === i + 1
                      ? "bg-blue-600 text-white shadow-md"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/10"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                handlePageChange(
                  Math.min(pagination.pages, pagination.current + 1),
                )
              }
              disabled={pagination.current === pagination.pages}
              className="rounded-lg p-2 transition hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/5"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
