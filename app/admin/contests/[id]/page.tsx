"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { getPokemonStaticIcon } from "@/app/lib/utils/helpers";
import { TYPE_COLORS } from "@/app/lib/utils/constants";
import ThemeToggle from "@/app/components/ThemeToggle";
import { apiFetch } from "@/app/lib/api/fetch";
import { toPng } from "html-to-image";
import { Header, HomeButton } from "@/app/components/Header";
import { HeaderButton } from "@/app/components/HeaderButton";
import type {
  AdminContest,
  PokemonSearchResult,
  PriceTier,
} from "@/app/types/draft";

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<AdminContest | null>(null);
  const [loading, setLoading] = useState(true);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleExportImage = useCallback(async () => {
    if (!resultsRef.current) return;

    try {
      const dataUrl = await toPng(resultsRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#f9fafb",
        style: {
          minWidth: "1200px", // Force wide layout for export
          padding: "40px",
        },
      });
      const link = document.createElement("a");
      link.download = `${contest?.name || "contest"}-选秀结果.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      alert("导出图片失败，请重试");
    }
  }, [contest]);

  // Add Pokemon Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PokemonSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 删除宝可梦确认弹窗：仅比赛开始前可删；若已加入分级则提示
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    item: AdminContest["pokemonPool"][number];
    tierNames: string[];
  } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Auction base price adjustment
  const [updatingBasePrice, setUpdatingBasePrice] = useState(false);

  // Tab state for tiered display (SNAKE mode)
  const [activeTier, setActiveTier] = useState<number | null>(null);

  const updateBasePrice = async (newPrice: number) => {
    setUpdatingBasePrice(true);
    try {
      const res = await apiFetch(`/api/admin/contests/${id}/base-price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePrice: newPrice }),
      });
      if (res.ok) {
        setContest((prev) =>
          prev ? { ...prev, auctionBasePrice: newPrice } : null,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingBasePrice(false);
    }
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await apiFetch(`/api/admin/pokemon/search?q=${q}`);
      if (res.ok) {
        const data = await res.json();
        const poolIds = new Set(
          contest?.pokemonPool.map((p) => p.pokemon.id) || [],
        );
        setSearchResults(
          data.map((p: PokemonSearchResult) => ({
            ...p,
            isInPool: poolIds.has(p.id),
          })),
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddPokemon = async (pokemon: PokemonSearchResult) => {
    if (pokemon.isInPool) return;

    try {
      const res = await apiFetch(`/api/admin/contests/${id}/pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pokemonId: pokemon.id }),
      });

      if (res.ok) {
        const newPoolItem = await res.json();
        setContest((prev) =>
          prev
            ? {
                ...prev,
                pokemonPool: [...prev.pokemonPool, newPoolItem],
              }
            : null,
        );
        setSearchResults((prev) =>
          prev.map((p) => (p.id === pokemon.id ? { ...p, isInPool: true } : p)),
        );
      } else {
        const err = await res.json();
        alert(err.error || "添加失败");
      }
    } catch {
      alert("网络错误");
    }
  };

  const loadContest = useCallback(() => {
    apiFetch(`/api/admin/contests/${id}`)
      .then((res) => res.json())
      .then((data: AdminContest) => {
        setContest(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    document.title = "宝可梦选秀系统-比赛详情";
  }, []);
  useEffect(() => {
    loadContest();
  }, [id, loadContest]);

  const startDraft = async () => {
    if (!confirm("确定要启动选秀吗？这将随机化选手顺序并开始选秀流程。"))
      return;

    try {
      const res = await apiFetch(`/api/admin/contests/${id}/start-draft`, {
        method: "POST",
      });
      if (res.ok) {
        alert("选秀已启动！");
        loadContest();
      } else {
        const err = await res.json();
        let failureReason = err.error || "启动失败";

        // DP Validation Details
        if (err.details) {
          if (
            err.details.problematicTiers &&
            Array.isArray(err.details.problematicTiers)
          ) {
            failureReason += `\n\n问题分档: ${err.details.problematicTiers.join(", ")}`;
          }
          if (err.details.reason) {
            failureReason += `\n\n详情: ${err.details.reason}`;
          }
          if (
            err.details.suggestions &&
            Array.isArray(err.details.suggestions) &&
            err.details.suggestions.length > 0
          ) {
            failureReason += `\n\n具体修改建议:`;
            err.details.suggestions.forEach((s: any) => {
              if (s.action === "add" && s.delta != null) {
                failureReason += `\n  · 分档 ${s.tierName} 增加 ${s.delta} 只：${s.reason}`;
              } else if (
                s.action === "lower_price" &&
                s.suggestedPrice != null
              ) {
                failureReason += `\n  · 分档 ${s.tierName} 价格降至 ${s.suggestedPrice}：${s.reason}`;
              } else {
                failureReason += `\n  · ${s.reason}`;
              }
            });
          }
        }

        alert(failureReason);
      }
    } catch {
      alert("网络错误");
    }
  };

  // Pool Sorting Logic
  const [typePriority, setTypePriority] = useState<string[]>([]);

  useEffect(() => {
    // Randomize Type Priority on component mount
    const types = Object.keys(TYPE_COLORS);
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    setTypePriority(types);
  }, []);

  const sortedPool = useMemo(() => {
    if (!contest?.pokemonPool) return [];
    return [...contest.pokemonPool].sort((a: any, b: any) => {
      const typeA = a.pokemon.types[0];
      const typeB = b.pokemon.types[0];
      const priorityA = typePriority.indexOf(typeA);
      const priorityB = typePriority.indexOf(typeB);

      // 1. Sort by Type Priority
      if (priorityA !== priorityB) return priorityA - priorityB;

      // 2. Sort by BST (Descending)
      return b.pokemon.bst - a.pokemon.bst;
    });
  }, [contest?.pokemonPool, typePriority]);

  const allTiers = useMemo(() => {
    if (Array.isArray(contest?.priceTiers)) {
      return contest.priceTiers as any[];
    }
    return ((contest?.priceTiers as any)?.tiers || []) as any[];
  }, [contest?.priceTiers]);

  const pricedIds = useMemo(() => {
    return new Set(allTiers?.flatMap((t: any) => t.pokemonIds || []) || []);
  }, [allTiers]);

  // For SNAKE mode: split into priced/unpriced pools
  // For AUCTION mode: use unified pool
  const pricedPool = useMemo(() => {
    if (contest?.draftMode !== "SNAKE") return [];
    return sortedPool.filter((p) => pricedIds.has(p.pokemon.id));
  }, [contest?.draftMode, sortedPool, pricedIds]);

  const unpricedPool = useMemo(() => {
    if (contest?.draftMode !== "SNAKE") return [];
    return sortedPool.filter((p) => !pricedIds.has(p.pokemon.id));
  }, [contest?.draftMode, sortedPool, pricedIds]);

  const unifiedPool = useMemo(() => {
    if (contest?.draftMode !== "AUCTION") return [];
    return sortedPool;
  }, [contest?.draftMode, sortedPool]);

  // Group priced pool by price tiers for SNAKE mode
  const tieredGroups = useMemo(() => {
    if (contest?.draftMode !== "SNAKE" || !allTiers) return [];

    const tierMap = new Map<number, { name: string; color: string }>();
    allTiers.forEach((t: any) => {
      tierMap.set(t.price, { name: t.name, color: t.color });
    });

    const groups: Record<number, typeof pricedPool> = {};
    pricedPool.forEach((p) => {
      const price = p.basePrice || 0;
      if (!groups[price]) groups[price] = [];
      groups[price].push(p);
    });

    return Object.entries(groups)
      .sort((a, b) => Number(b[0]) - Number(a[0])) // Descending price
      .map(([priceStr, items]) => {
        const price = Number(priceStr);
        const meta = tierMap.get(price) || {
          name: `${price} G`,
          color: "#3b82f6", // Default blue
        };
        return { price, items, ...meta };
      });
  }, [contest?.draftMode, allTiers, pricedPool]);

  // Initialize active tier
  useEffect(() => {
    if (
      contest?.draftMode === "SNAKE" &&
      tieredGroups.length > 0 &&
      activeTier === null
    ) {
      const saved = localStorage.getItem("adminActivePriceTier");
      if (saved) {
        const found = tieredGroups.find((t) => t.price === Number(saved));
        if (found) {
          setActiveTier(found.price);
          return;
        }
      }
      // Default to highest tier
      setActiveTier(tieredGroups[0].price);
    }
  }, [tieredGroups, contest?.draftMode, activeTier]);

  if (loading)
    return <div className="p-12 text-center text-gray-400">加载详情中...</div>;
  if (!contest)
    return <div className="p-12 text-center text-red-500">未找到相关比赛</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans dark:bg-gray-950">
      <Header
        variant="admin"
        title={contest.name}
        leftSlot={<HomeButton href="/admin/dashboard" />}
        rightSlot={
          <>
            {contest.draftMode === "SNAKE" &&
              (contest.status === "PENDING" ? (
                <HeaderButton
                  as="link"
                  href={`/admin/contests/${id}/price-tiers`}
                  variant="purple"
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
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  }
                >
                  <span className="hidden md:inline">设置价格分档</span>
                  <span className="md:hidden">分档</span>
                </HeaderButton>
              ) : (
                <HeaderButton
                  variant="secondary"
                  disabled
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
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                  }
                >
                  <span className="hidden md:inline">设置价格分档</span>
                  <span className="md:hidden">分档</span>
                </HeaderButton>
              ))}
            <HeaderButton
              as="link"
              href={`/admin/contests/${id}/tokens`}
              variant="success"
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
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.5 17.5 14 20l-2.257 2.257a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414l3.257-3.257A6 6 0 1121 9z"
                  />
                </svg>
              }
            >
              <span className="hidden md:inline">选手密钥</span>
              <span className="md:hidden">密钥</span>
            </HeaderButton>
            {contest.status === "PENDING" ? (
              <HeaderButton
                onClick={startDraft}
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
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              >
                <span className="hidden md:inline">启动选秀</span>
                <span className="md:hidden">启动</span>
              </HeaderButton>
            ) : contest.status === "ACTIVE" ? (
              <HeaderButton
                as="link"
                href={`/admin/contests/${id}/spectate`}
                variant="warning"
                icon={<span className="animate-pulse">👀</span>}
              >
                <span className="hidden md:inline">选秀进行中 - 点击观战</span>
                <span className="md:hidden">观战</span>
              </HeaderButton>
            ) : (
              <HeaderButton
                as="link"
                href={`/admin/contests/${id}/spectate`}
                variant="success"
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                }
              >
                <span className="hidden md:inline">查看结果</span>
                <span className="md:hidden">结果</span>
              </HeaderButton>
            )}
            <ThemeToggle />
          </>
        }
      />

      <main className="mx-auto max-w-7xl p-8">
        {/* Statistics Header */}
        <div className="mb-12 grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { label: "规则集", value: contest.ruleSet },
            {
              label: "初始代币",
              value: contest.playerTokens,
              // In AUCTION mode, we consolidate Base Price here
              subValue:
                contest.draftMode === "AUCTION" ? (
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
                    <span className="text-[10px] font-black tracking-widest text-gray-400 uppercase">
                      起拍底价
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (contest.status !== "PENDING" || updatingBasePrice)
                            return;
                          const currentPrice = contest.auctionBasePrice ?? 10;
                          const newPrice = Math.max(1, currentPrice - 1);
                          await updateBasePrice(newPrice);
                        }}
                        disabled={
                          contest.status !== "PENDING" || updatingBasePrice
                        }
                        className="flex h-5 w-5 items-center justify-center rounded bg-gray-50 text-xs font-black transition hover:bg-gray-100 disabled:opacity-50 dark:bg-gray-800"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={contest.auctionBasePrice ?? 10}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setContest((prev: any) => ({
                            ...prev,
                            auctionBasePrice: isNaN(val) ? 0 : val,
                          }));
                        }}
                        onBlur={async (e) => {
                          const val = Math.max(
                            1,
                            parseInt(e.target.value) ?? 10,
                          );
                          await updateBasePrice(val);
                        }}
                        disabled={
                          contest.status !== "PENDING" || updatingBasePrice
                        }
                        className="w-12 [appearance:textfield] bg-transparent text-center font-black text-gray-800 focus:outline-none dark:text-gray-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (contest.status !== "PENDING" || updatingBasePrice)
                            return;
                          const currentPrice = contest.auctionBasePrice ?? 10;
                          const newPrice = currentPrice + 1;
                          await updateBasePrice(newPrice);
                        }}
                        disabled={
                          contest.status !== "PENDING" || updatingBasePrice
                        }
                        className="flex h-5 w-5 items-center justify-center rounded bg-gray-50 text-xs font-black transition hover:bg-gray-100 disabled:opacity-50 dark:bg-gray-800"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null,
            },
            { label: "限制捉捕", value: contest.maxPokemonPerPlayer },
            {
              label: "模式",
              value:
                contest.draftMode === "SNAKE"
                  ? "蛇形选秀"
                  : contest.draftMode === "AUCTION"
                    ? "提名竞价"
                    : "盲选",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="mb-1 text-xs font-bold tracking-widest text-gray-400 uppercase">
                {stat.label}
              </p>
              <p className="text-lg font-black text-gray-800 dark:text-gray-100">
                {stat.value}
              </p>
              {stat.subValue}
            </div>
          ))}
        </div>

        {/* Draft Results (Completed) */}
        {contest.status === "COMPLETED" && (
          <div className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-3 text-2xl font-black text-gray-800 dark:text-gray-100">
                <span className="text-green-600">🏆</span>
                选秀结果
              </h2>
              <button
                onClick={handleExportImage}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
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
                一键导出图片
              </button>
            </div>
            <div
              ref={resultsRef}
              className="-m-4 space-y-4 rounded-3xl bg-white p-4 dark:bg-gray-900"
            >
              {contest.players?.map((player) => {
                const totalSpent = player.ownedPokemon.reduce(
                  (sum, p) => sum + (p.purchasePrice || 0),
                  0,
                );
                const budget = contest.playerTokens;
                const spentPercent = Math.min(100, (totalSpent / budget) * 100);

                return (
                  <div
                    key={player.id}
                    className="flex flex-col items-start gap-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:flex-row md:items-center dark:border-gray-800 dark:bg-gray-900"
                  >
                    {/* Player Info Summary */}
                    <div className="w-full flex-shrink-0 md:w-48">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-lg font-black text-gray-800 dark:text-gray-100">
                          {player.username}
                        </h3>
                        <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500">
                          {player.ownedPokemon?.length || 0} /{" "}
                          {contest.maxPokemonPerPlayer}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold whitespace-nowrap text-gray-500">
                          <span>花费: {totalSpent} G</span>
                          <span>预算: {budget} G</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${spentPercent > 90 ? "bg-red-500" : "bg-green-500"}`}
                            style={{ width: `${spentPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Horizontal Pokemon List */}
                    <div className="custom-scrollbar w-full flex-1 overflow-x-auto pb-2">
                      <div className="flex gap-4">
                        {player.ownedPokemon.map((owned) => (
                          <div
                            key={owned.id}
                            className="flex min-w-[60px] flex-col items-center gap-1"
                          >
                            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">
                              <span
                                className="picon"
                                style={
                                  getPokemonStaticIcon(
                                    owned.pokemon.num,
                                    owned.pokemon.name,
                                  ) as React.CSSProperties
                                }
                              ></span>
                            </div>
                            <div className="text-center">
                              <p className="h-5 w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 text-center text-[10px] leading-tight font-bold text-gray-600">
                                {owned.pokemon.nameCn || owned.pokemon.name}
                              </p>
                              {contest.draftMode === "AUCTION" &&
                                owned.purchasePrice != null &&
                                owned.purchasePrice !== undefined && (
                                  <p className="mt-0.5 inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-black text-green-600 dark:bg-green-900/20">
                                    {owned.purchasePrice} G
                                  </p>
                                )}
                            </div>
                          </div>
                        ))}
                        {player.ownedPokemon.length === 0 && (
                          <div className="py-4 text-xs font-bold text-gray-400 italic">
                            暂无宝可梦
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unpriced Pool (SNAKE mode only) */}
        {contest.draftMode === "SNAKE" && unpricedPool.length > 0 && (
          <div className="mb-12">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-red-600 dark:text-red-400">
                  未定价宝可梦 ({unpricedPool.length})
                </h2>
                <p className="mt-1 text-xs font-bold text-gray-500">
                  ⚠️ 警告：启动比赛时，未分配到价格档位的宝可梦将被自动剔除。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap content-start gap-1 rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-900/20 dark:bg-red-900/10">
              {unpricedPool.map((item) => {
                const tiers = Array.isArray(contest.priceTiers)
                  ? (contest.priceTiers as any[])
                  : (((contest.priceTiers as any)?.tiers || []) as any[]);
                const inTierNames = tiers
                  ? tiers
                      .filter((t: any) =>
                        t.pokemonIds?.includes(item.pokemon.id),
                      )
                      .map((t: any) => t.name)
                  : [];
                return (
                  <div
                    key={item.id}
                    className="group relative flex h-10 w-10 cursor-help items-center justify-center rounded border border-red-100 bg-white transition-all hover:z-20 hover:scale-125 hover:border-red-500 hover:shadow-lg dark:border-red-900/20 dark:bg-white/5"
                    title={`${item.pokemon.nameCn || item.pokemon.name} (#${item.pokemon.num})\n属性: ${item.pokemon.types.join("/")}\nHP:${item.pokemon.hp} 物攻:${item.pokemon.atk} 物防:${item.pokemon.def} 特攻:${item.pokemon.spa} 特防:${item.pokemon.spd} 速度:${item.pokemon.spe}`}
                  >
                    {contest.status === "PENDING" && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteConfirmModal({
                            item,
                            tierNames: inTierNames,
                          });
                        }}
                        className="absolute -top-2 -right-2 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition group-hover:opacity-100"
                        title="从池中移除"
                      >
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                    <span
                      className="picon"
                      style={
                        getPokemonStaticIcon(
                          item.pokemon.num,
                          item.pokemon.name,
                        ) as React.CSSProperties
                      }
                    ></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Priced Pool (SNAKE mode) / Unified Pool (AUCTION mode) */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100">
            {contest.draftMode === "AUCTION"
              ? `宝可梦池 (${unifiedPool.length})`
              : `已分配宝可梦 (${pricedPool.length})`}
          </h2>
          {(contest.draftMode === "AUCTION" || unpricedPool.length === 0) && (
            <button
              onClick={() => {
                setShowAddModal(true);
                setSearchQuery("");
                setSearchResults([]);
              }}
              disabled={contest.status !== "PENDING"}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-900"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              添加宝可梦
            </button>
          )}
        </div>

        {/* Tier Tabs for SNAKE mode */}
        {contest.draftMode === "SNAKE" && tieredGroups.length > 0 && (
          <>
            {/* Mobile Tabs Only - 网页模式下不显示 Tab，直接显示所有档位 */}
            <div className="no-scrollbar mb-4 overflow-x-auto border-b border-gray-200 md:hidden dark:border-white/5">
              <div className="flex gap-2 py-2">
                {tieredGroups.map((tier) => (
                  <button
                    key={tier.price}
                    onClick={() => {
                      setActiveTier(tier.price);
                      localStorage.setItem(
                        "adminActivePriceTier",
                        String(tier.price),
                      );
                    }}
                    className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                      activeTier === tier.price
                        ? "text-white shadow-sm"
                        : "border-transparent bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                    style={
                      activeTier === tier.price
                        ? {
                            backgroundColor: tier.color || "#3b82f6",
                            borderColor: tier.color || "#3b82f6",
                            color: "#ffffff",
                          }
                        : {}
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      {activeTier !== tier.price && (
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: tier.color }}
                        ></div>
                      )}
                      <span>
                        {tier.name} ({tier.price} G)
                      </span>
                      <span className="ml-0.5 text-[10px] opacity-60">
                        ({tier.items.length})
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tiered Pokemon Display */}
            <div className="space-y-6">
              {tieredGroups.map((tier) => (
                <div
                  key={tier.price}
                  className={`${activeTier === tier.price ? "block" : "hidden md:block"} animate-in fade-in space-y-3 duration-300`}
                >
                  <div className="mb-2 hidden pl-1 text-xs font-bold tracking-widest text-gray-400 uppercase md:block">
                    {tier.name} ({tier.price} G) - {tier.items.length} 只
                  </div>
                  <div className="flex flex-wrap content-start gap-1">
                    {tier.items.map((item) => {
                      const tiers = Array.isArray(contest.priceTiers)
                        ? (contest.priceTiers as any[])
                        : (((contest.priceTiers as any)?.tiers || []) as any[]);
                      const inTierNames = tiers
                        ? tiers
                            .filter((t: any) =>
                              t.pokemonIds?.includes(item.pokemon.id),
                            )
                            .map((t: any) => t.name)
                        : [];
                      return (
                        <div
                          key={item.id}
                          className="group relative flex h-10 w-10 cursor-help items-center justify-center rounded border border-gray-100 bg-white transition-all hover:z-20 hover:scale-125 hover:border-blue-500 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
                          title={`${item.pokemon.nameCn || item.pokemon.name} (#${item.pokemon.num})\n属性: ${item.pokemon.types.join("/")}\nHP:${item.pokemon.hp} 物攻:${item.pokemon.atk} 物防:${item.pokemon.def} 特攻:${item.pokemon.spa} 特防:${item.pokemon.spd} 速度:${item.pokemon.spe}`}
                        >
                          {contest.status === "PENDING" && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteConfirmModal({
                                  item,
                                  tierNames: inTierNames,
                                });
                              }}
                              className="absolute -top-2 -right-2 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition group-hover:opacity-100"
                              title="从池中移除"
                            >
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="3"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                          <span
                            className="picon"
                            style={
                              getPokemonStaticIcon(
                                item.pokemon.num,
                                item.pokemon.name,
                              ) as React.CSSProperties
                            }
                          ></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Unified Pool Display for AUCTION mode */}
        {contest.draftMode === "AUCTION" && (
          <div className="flex flex-wrap content-start gap-1">
            {unifiedPool.map((item) => {
              const tiers = Array.isArray(contest.priceTiers)
                ? (contest.priceTiers as any[])
                : (((contest.priceTiers as any)?.tiers || []) as any[]);
              const inTierNames = tiers
                ? tiers
                    .filter((t: any) => t.pokemonIds?.includes(item.pokemon.id))
                    .map((t: any) => t.name)
                : [];
              return (
                <div
                  key={item.id}
                  className="group relative flex h-10 w-10 cursor-help items-center justify-center rounded border border-gray-100 bg-white transition-all hover:z-20 hover:scale-125 hover:border-blue-500 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
                  title={`${item.pokemon.nameCn || item.pokemon.name} (#${item.pokemon.num})\n属性: ${item.pokemon.types.join("/")}\nHP:${item.pokemon.hp} 物攻:${item.pokemon.atk} 物防:${item.pokemon.def} 特攻:${item.pokemon.spa} 特防:${item.pokemon.spd} 速度:${item.pokemon.spe}`}
                >
                  {contest.status === "PENDING" && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteConfirmModal({ item, tierNames: inTierNames });
                      }}
                      className="absolute -top-2 -right-2 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-sm transition group-hover:opacity-100"
                      title="从池中移除"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                  <span
                    className="picon"
                    style={
                      getPokemonStaticIcon(
                        item.pokemon.num,
                        item.pokemon.name,
                      ) as React.CSSProperties
                    }
                  ></span>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 删除宝可梦确认弹窗 */}
      {deleteConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm dark:bg-black/60"
          onClick={() => !deleteSubmitting && setDeleteConfirmModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-black text-gray-900 dark:text-white">
              确认移除
            </h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              {deleteConfirmModal.tierNames.length > 0 ? (
                <>
                  该宝可梦已加入分级「
                  {deleteConfirmModal.tierNames.join("」「")}
                  」，删除后将从这些分级中移除。确定删除{" "}
                  <span className="font-bold text-gray-900 dark:text-white">
                    {deleteConfirmModal.item.pokemon.nameCn ||
                      deleteConfirmModal.item.pokemon.name}
                  </span>{" "}
                  吗？
                </>
              ) : (
                <>
                  确定要移除{" "}
                  <span className="font-bold text-gray-900 dark:text-white">
                    {deleteConfirmModal.item.pokemon.nameCn ||
                      deleteConfirmModal.item.pokemon.name}
                  </span>{" "}
                  吗？
                </>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => !deleteSubmitting && setDeleteConfirmModal(null)}
                className="rounded-xl bg-gray-100 px-4 py-2 font-bold text-gray-700 transition hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={async () => {
                  setDeleteSubmitting(true);
                  try {
                    const res = await apiFetch(
                      `/api/admin/contests/${id}/pool?poolId=${deleteConfirmModal!.item.id}`,
                      { method: "DELETE" },
                    );
                    if (res.ok) {
                      setDeleteConfirmModal(null);
                      loadContest();
                    } else {
                      const err = await res.json();
                      alert(err.error || "移除失败");
                    }
                  } catch {
                    alert("网络错误");
                  } finally {
                    setDeleteSubmitting(false);
                  }
                }}
                className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleteSubmitting ? "删除中…" : "确定删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Pokemon Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-gray-50 p-6">
              <h3 className="text-xl font-black text-gray-800">添加宝可梦</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-200"
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
            <div className="border-b bg-white p-6">
              <input
                type="text"
                placeholder="搜索宝可梦名称 (支持中文)..."
                className="w-full rounded-2xl border-none bg-gray-100 p-4 font-bold text-gray-800 transition outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
              {isSearching ? (
                <div className="py-10 text-center text-gray-400">搜索中...</div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-4 gap-3">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddPokemon(p)}
                      disabled={p.isInPool}
                      className={`group relative flex flex-col items-center rounded-2xl border p-3 transition-all ${
                        p.isInPool
                          ? "cursor-not-allowed border-gray-200 bg-gray-100 opacity-50"
                          : "border-gray-200 bg-white hover:-translate-y-1 hover:border-blue-500 hover:shadow-lg"
                      }`}
                    >
                      {p.isInPool && (
                        <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white">
                          ✓
                        </div>
                      )}
                      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
                        <span
                          className="picon"
                          style={
                            getPokemonStaticIcon(
                              p.num,
                              p.name,
                            ) as React.CSSProperties
                          }
                        ></span>
                      </div>
                      <p
                        className="w-full truncate text-center text-xs font-bold text-gray-800"
                        title={p.name}
                      >
                        {p.nameCn || p.name}
                      </p>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length > 1 ? (
                <div className="py-10 text-center text-gray-400">
                  未找到相关宝可梦
                </div>
              ) : (
                <div className="py-10 text-center text-gray-400">
                  输入关键词开始搜索
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .pixelated {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
      `}</style>
    </div>
  );
}
