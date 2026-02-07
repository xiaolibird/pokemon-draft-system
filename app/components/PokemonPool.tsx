/**
 * PokemonPool Component
 *
 * Displays the grid of available Pokemon with integrated filtering logic.
 */

"use client";

import { useState, useEffect, memo, useMemo } from "react";
import { usePokemonFilter } from "@/app/lib/hooks/usePokemonFilter";
import { useSearchHints } from "@/app/lib/hooks/useSearchHints";
import { PokemonCard } from "./PokemonCard";
import { TYPE_COLORS } from "@/app/lib/utils/constants";
import { assignColorsToTiers } from "@/app/lib/utils/color-generator";
import { PoolItem, Contest } from "@/app/types/draft";

// ... Filter Icons ...
function FilterIcon() {
  return (
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
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
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
  );
}

interface PokemonPoolProps {
  pool: PoolItem[];
  contest: Contest;
  myPokemonCount: number;
  isMyTurn: boolean;
  onAction: (pokemonId: string) => void;
  className?: string;
  /** 乐观更新：正在提交的 pool id，对应卡片显示「选集中」 */
  optimisticPendingPoolId?: string | null;
  /** 是否在桌面端显示 Tab 栏（移动端始终显示） */
  showDesktopTabs?: boolean;
}

function PokemonPoolComponent({
  pool,
  contest,
  myPokemonCount,
  isMyTurn,
  onAction,
  className = "",
  optimisticPendingPoolId = null,
  showDesktopTabs = false,
}: PokemonPoolProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const placeholder = useSearchHints();
  const [types, setTypes] = useState<{
    mode: "AND" | "OR";
    include: string[];
    exclude: string[];
  }>({ mode: "AND", include: [], exclude: [] });
  const [gens, setGens] = useState<{
    mode: "OR";
    include: number[];
    exclude: number[];
  }>({ mode: "OR", include: [], exclude: [] });
  const [showFilters, setShowFilters] = useState(false);
  // Initialize random type priority for sorting on mount
  const [typePriority] = useState<string[]>(() => {
    const t = Object.keys(TYPE_COLORS);
    const arr = [...t];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  const availablePool = pool.filter((p) => p.status === "AVAILABLE");

  const { filtered, count, totalCount } = usePokemonFilter({
    pool: availablePool,
    searchTerm,
    types,
    gens,
    sortBy: "type-priority",
    typePriority,
  });

  const [activeTier, setActiveTier] = useState<number>(0);

  const handleTypeClick = (type: string) => {
    setTypes((prev) => {
      if (prev.include.includes(type))
        return {
          ...prev,
          include: prev.include.filter((t) => t !== type),
          exclude: [...prev.exclude, type],
        };
      if (prev.exclude.includes(type))
        return { ...prev, exclude: prev.exclude.filter((t) => t !== type) };
      return {
        ...prev,
        include: [...prev.include, type],
        exclude: prev.exclude.filter((t) => t !== type),
      };
    });
  };

  const handleGenClick = (g: number) => {
    setGens((prev) => {
      if (prev.include.includes(g))
        return {
          ...prev,
          include: prev.include.filter((x) => x !== g),
          exclude: [...prev.exclude, g],
        };
      if (prev.exclude.includes(g))
        return { ...prev, exclude: prev.exclude.filter((x) => x !== g) };
      return {
        ...prev,
        include: [...prev.include, g],
        exclude: prev.exclude.filter((x) => x !== g),
      };
    });
  };

  const canAct =
    isMyTurn && myPokemonCount < (contest?.maxPokemonPerPlayer || 6);
  const { draftMode: mode } = contest;

  // Grouping Logic for Snake Mode
  // Memoize tieredGroups to avoid recalc if filtered is stable
  const tieredGroups = useMemo(() => {
    if (mode !== "SNAKE") return [];

    const groups: Record<number, typeof filtered> = {};
    const tierMap = new Map<number, { name: string; color: string }>();

    const tiersData = contest.priceTiers as any;

    // Use imported function directly
    // const assignColorsToTiers = assignColorsToTiers; // already imported

    // Try to map from contest price tiers if available
    // priceTiers 可能是 { tiers: [...] } 或直接是数组
    if (tiersData) {
      let tierList: any[] = [];

      if (tiersData.tiers && Array.isArray(tiersData.tiers)) {
        tierList = tiersData.tiers;
      } else if (Array.isArray(tiersData)) {
        tierList = tiersData;
      }

      // Debug: Log the actual structure
      if (process.env.NODE_ENV === "development") {
        console.log("[PokemonPool] priceTiers data:", tiersData);
        console.log("[PokemonPool] tierList:", tierList);
      }

      tierList.forEach((t: any) => {
        if (t && t.price != null) {
          const price = Number(t.price);
          const name = t.name || `${price} G`;
          tierMap.set(price, { name, color: t.color || "" });
        }
      });

      // 如果有些 tiers 没有颜色，使用颜色生成器生成
      if (tierList.length > 0 && assignColorsToTiers) {
        const tiersForColorGen = tierList.map((t: any) => ({
          price: Number(t.price),
          color: t.color,
        }));
        const colorsGenerated = assignColorsToTiers(tiersForColorGen);
        colorsGenerated.forEach((cg: { price: number; color: string }) => {
          const existing = tierMap.get(cg.price);
          if (existing) {
            // 如果已有有效颜色，保留；否则使用生成的颜色
            const defaultColors = ["#6b7280", "#3b82f6", "#9ca3af", ""];
            const isValidColor =
              existing.color &&
              !defaultColors.includes(existing.color) &&
              /^#[0-9A-Fa-f]{6}$/.test(existing.color);
            tierMap.set(cg.price, {
              name: existing.name,
              color: isValidColor ? existing.color : cg.color,
            });
          } else {
            tierMap.set(cg.price, { name: `${cg.price} G`, color: cg.color });
          }
        });
      }
    }

    filtered.forEach((p) => {
      const price = p.basePrice || 0;
      if (!groups[price]) groups[price] = [];
      groups[price].push(p);
    });

    return Object.entries(groups)
      .sort((a, b) => Number(b[0]) - Number(a[0])) // Descending price
      .map(([priceStr, items]) => {
        const price = Number(priceStr);
        // 首先尝试从 tierMap 获取（通过 price 直接匹配）
        let meta = tierMap.get(price);

        // 如果 tierMap 中没有，尝试从 tiersData 中查找
        if (!meta && tiersData) {
          const tierList = Array.isArray(tiersData)
            ? tiersData
            : tiersData.tiers;
          if (tierList && Array.isArray(tierList)) {
            const tier = tierList.find((t: any) => Number(t.price) === price);
            if (tier && tier.color) {
              meta = {
                name: tier.name || `${price} G`,
                color: tier.color,
              };
            }
          }
        }

        // 如果还是没有找到，使用默认值
        if (!meta) {
          meta = {
            name: `${price} G`,
            color: "#3b82f6", // Default blue
          };
        }

        // Debug: Log tier info
        if (process.env.NODE_ENV === "development") {
          console.log(`[PokemonPool] Tier ${price}:`, {
            name: meta.name,
            color: meta.color,
            itemsCount: items.length,
          });
        }

        return { price, items, ...meta };
      });
  }, [mode, filtered, contest.priceTiers]);

  // Initialize Active Tier (Mobile Tab)
  useEffect(() => {
    if (mode === "SNAKE" && tieredGroups.length > 0 && activeTier === 0) {
      const saved = localStorage.getItem("activePriceTier");
      if (saved) {
        const found = tieredGroups.find((t) => t.price === Number(saved));
        if (found) {
          setActiveTier(found.price);
          return;
        }
      }
      // Default to highest tier if nothing saved or saved tier not found
      setActiveTier(tieredGroups[0].price);
    }
  }, [tieredGroups, mode, activeTier]);

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/5 dark:bg-gray-900/50 ${className}`}
    >
      {/* Filter Header */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-gray-900">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border-none bg-gray-100 py-2 pr-4 pl-10 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-800"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`rounded-xl p-2 transition ${showFilters ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
          >
            <FilterIcon />
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="animate-in slide-in-from-top-2 mt-4 space-y-4 border-t border-gray-200 pt-4 duration-200 dark:border-white/5">
            {/* Types */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                  属性筛选
                </h4>
                <button
                  onClick={() =>
                    setTypes((prev) => ({
                      ...prev,
                      mode: prev.mode === "AND" ? "OR" : "AND",
                    }))
                  }
                  className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500 hover:text-blue-500 dark:bg-gray-800"
                >
                  模式:{" "}
                  {types.mode === "AND" ? "同时满足 (AND)" : "任一满足 (OR)"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.keys(TYPE_COLORS).map((t) => {
                  const state = types.include.includes(t)
                    ? "include"
                    : types.exclude.includes(t)
                      ? "exclude"
                      : "none";
                  return (
                    <button
                      key={t}
                      onClick={() => handleTypeClick(t)}
                      className={`rounded border px-2 py-1 text-[10px] font-bold transition-all ${
                        state === "include"
                          ? "scale-105 border-blue-600 bg-blue-500 text-white shadow-md"
                          : state === "exclude"
                            ? "border-red-600 bg-red-500 text-white opacity-50"
                            : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                      } `}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gens */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                世代筛选
              </h4>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => {
                  const state = gens.include.includes(g)
                    ? "include"
                    : gens.exclude.includes(g)
                      ? "exclude"
                      : "none";
                  return (
                    <button
                      key={g}
                      onClick={() => handleGenClick(g)}
                      className={`rounded border px-3 py-1 text-[10px] font-bold transition-all ${
                        state === "include"
                          ? "scale-105 border-green-600 bg-green-500 text-white shadow-md"
                          : state === "exclude"
                            ? "border-red-600 bg-red-500 text-white opacity-50"
                            : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                      } `}
                    >
                      Gen {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="mt-2 flex items-center justify-between text-xs font-bold text-gray-400">
          <span>
            显示 {count} / {totalCount} 只宝可梦
          </span>
          {(types.include.length > 0 ||
            types.exclude.length > 0 ||
            gens.include.length > 0 ||
            gens.exclude.length > 0) && (
            <button
              onClick={() => {
                setTypes({ mode: "AND", include: [], exclude: [] });
                setGens({ mode: "OR", include: [], exclude: [] });
                setSearchTerm("");
              }}
              className="text-blue-500 hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* Grid or Tiered View */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-gray-400 opacity-50 md:p-6">
            <svg
              className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-700"
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
            <p className="font-bold">未找到匹配的宝可梦</p>
          </div>
        ) : mode === "SNAKE" ? (
          <>
            {/* Desktop Tabs (if showDesktopTabs is true) */}
            {showDesktopTabs && (
              <div className="no-scrollbar sticky top-0 z-50 mb-4 hidden overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 shadow-md md:flex dark:border-white/5 dark:bg-gray-900">
                <div className="flex gap-2 py-2">
                  {tieredGroups.map((tier) => (
                    <button
                      key={tier.price}
                      onClick={() => {
                        setActiveTier(tier.price);
                        localStorage.setItem(
                          "activePriceTier",
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
            )}

            {/* Mobile Tabs (always shown) */}
            <div className="no-scrollbar sticky top-0 z-50 mb-4 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 shadow-md md:hidden dark:border-white/5 dark:bg-gray-900">
              <div className="flex gap-2 py-2">
                {tieredGroups.map((tier) => (
                  <button
                    key={tier.price}
                    onClick={() => {
                      setActiveTier(tier.price);
                      localStorage.setItem(
                        "activePriceTier",
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

            {/* Desktop: All Tiers (if no desktop tabs) | Active Tier Only (if desktop tabs) | Mobile: Active Tier Only */}
            <div className="space-y-6 p-4 pb-20 md:p-6 md:pb-0">
              {tieredGroups.map((tier) => (
                <div
                  key={tier.price}
                  className={`${
                    // 移动端：只显示当前选中的 tier
                    // 桌面端：如果 showDesktopTabs=true，只显示当前选中的 tier；如果 showDesktopTabs=false，显示所有 tiers
                    activeTier === tier.price
                      ? "block"
                      : showDesktopTabs
                        ? "hidden"
                        : "hidden md:block"
                  } animate-in fade-in space-y-3 duration-300`}
                >
                  <div className="mb-2 hidden pl-1 text-xs font-bold tracking-widest text-gray-400 uppercase md:block">
                    {tier.name} ({tier.price} G) - {tier.items.length} 只
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {tier.items.map((item) => (
                      <PokemonCard
                        key={item.id}
                        item={item}
                        isMyTurn={canAct}
                        onAction={() => onAction(item.id)}
                        mode={mode}
                        hidePrice={true}
                        isPending={item.id === optimisticPendingPoolId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-4 pb-20 sm:grid-cols-4 md:grid-cols-3 md:gap-4 md:p-6 md:pb-0 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((item) => (
              <PokemonCard
                key={item.id}
                item={item}
                isMyTurn={canAct}
                onAction={() => onAction(item.id)}
                mode={mode}
                isPending={item.id === optimisticPendingPoolId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const PokemonPool = memo(PokemonPoolComponent);
