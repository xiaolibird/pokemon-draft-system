"use client";

import { BackButton, Header } from "@/app/components/Header";
import { HeaderButton } from "@/app/components/HeaderButton";
import { Loading } from "@/app/components/Loading";
import ThemeToggle from "@/app/components/ThemeToggle";
import { apiFetch } from "@/app/lib/api/fetch";
import { TYPE_COLORS } from "@/app/lib/utils/constants";
import { usePokemonFilter } from "@/app/lib/hooks/usePokemonFilter";
import { useSearchHints } from "@/app/lib/hooks/useSearchHints";
import { getPokemonStaticIcon } from "@/app/lib/utils/helpers";
import { assignColorsToTiers } from "@/app/lib/utils/color-generator";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

interface Tier {
  id: string;
  name: string;
  price: number;
  color: string;
  pokemonIds: string[];
}

// 默认 tiers，颜色会在加载时自动生成
const DEFAULT_TIERS: Tier[] = [
  { id: "1", name: "S 级", price: 30, color: "#ef4444", pokemonIds: [] },
  { id: "2", name: "A 级", price: 25, color: "#f97316", pokemonIds: [] },
  { id: "3", name: "B 级", price: 20, color: "#eab308", pokemonIds: [] },
  { id: "4", name: "C 级", price: 15, color: "#22c55e", pokemonIds: [] },
  { id: "5", name: "D 级", price: 10, color: "#3b82f6", pokemonIds: [] },
  { id: "6", name: "E 级", price: 5, color: "#8b5cf6", pokemonIds: [] },
];

// 为默认 tiers 生成颜色（如果还没有）
function initializeDefaultTiers(): Tier[] {
  const colors = assignColorsToTiers(DEFAULT_TIERS);
  // 按价格匹配颜色，而不是按索引
  return DEFAULT_TIERS.map((tier) => {
    const colorTier = colors.find((t) => t.price === tier.price);
    return {
      ...tier,
      color: colorTier?.color || tier.color,
    };
  });
}

export default function PriceTiers() {
  const router = useRouter();
  const { id: rawId } = useParams();
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";

  const [contest, setContest] = useState<any>(null);
  const [pokemonPool, setPokemonPool] = useState<any[]>([]);
  const [tiers, setTiers] = useState<Tier[]>(initializeDefaultTiers());
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [selectedUnassigned, setSelectedUnassigned] = useState<string[]>([]);
  const [draggedPokemon, setDraggedPokemon] = useState<{
    pokemon: any;
    sourceTierId?: string;
    items?: any[];
  } | null>(null);
  const [draggedTierIndex, setDraggedTierIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const placeholder = useSearchHints();
  const [playerTokens, setPlayerTokens] = useState(100);
  const [dpTargetMode, setDpTargetMode] = useState<"BEST" | "MINIMUM">("BEST");

  const [dpConstraints, setDpConstraints] = useState<
    Record<string, { min: number; max: number }>
  >({});
  const [dpResults, setDpResults] = useState<any[]>([]);
  const [computingDp, setComputingDp] = useState(false);

  // Mobile & Multi-select States
  const [activeMobileTab, setActiveMobileTab] = useState<
    "unassigned" | "tiers" | "settings"
  >("tiers");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [showLongPressMenu, setShowLongPressMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const hasSlid = useRef(false);
  const longPressTriggered = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  // Filter States
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
  const [typePriority, setTypePriority] = useState<string[]>([]);

  // Initialize random type priority for sorting on mount
  useEffect(() => {
    const t = Object.keys(TYPE_COLORS);
    const arr = [...t];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setTypePriority(arr);
  }, []);

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    document.title = "宝可梦选秀系统-价格分档";
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/contests/${id}`);
      if (res.ok) {
        const data = await res.json();

        // Redirect if auction mode
        if (data.draftMode === "AUCTION") {
          router.push(`/admin/contests/${id}`);
          return;
        }

        setContest(data);
        setPokemonPool(data.pokemonPool || []);
        setPlayerTokens(data.playerTokens || 100);

        const rawTiers = data.priceTiers;
        const loadedTiers = Array.isArray(rawTiers)
          ? rawTiers
          : rawTiers?.tiers;
        if (loadedTiers && loadedTiers.length > 0) {
          // 为没有颜色的 tiers 生成颜色
          const tiersWithColors = assignColorsToTiers(loadedTiers);
          const updatedTiers = loadedTiers.map((tier: Tier) => {
            const colorTier = tiersWithColors.find(
              (t) => t.price === tier.price,
            );
            return {
              ...tier,
              color: colorTier?.color || tier.color || "#3b82f6",
            };
          });

          setTiers(updatedTiers);
          setDpTargetMode(
            rawTiers?.dpTargetMode === "MINIMUM" ? "MINIMUM" : "BEST",
          );
          const assignedIds = new Set<string>();
          updatedTiers.forEach((tier: Tier) => {
            tier.pokemonIds.forEach((pid: string) => assignedIds.add(pid));
          });
          setUnassigned(
            data.pokemonPool.filter((p: any) => !assignedIds.has(p.pokemon.id)),
          );
        } else {
          setUnassigned(data.pokemonPool);
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) loadData();
  }, [id, loadData]);

  // Interaction trackers
  const onPointerDown = (pokemonId: string, e: React.PointerEvent) => {
    // If filter is open, disable selection to prevent fat finger
    if (showFilters) return;

    setIsSelecting(true);
    setIsSelecting(true);
    hasSlid.current = false;
    longPressTriggered.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };

    longPressTimer.current = setTimeout(() => {
      if (!selectedUnassigned.includes(pokemonId)) {
        if (!multiSelectMode) {
          setSelectedUnassigned([pokemonId]);
        } else {
          setSelectedUnassigned((prev) => [...prev, pokemonId]);
        }
      }
      setShowLongPressMenu({ x: e.clientX, y: e.clientY });
      longPressTriggered.current = true;
    }, 600);
  };

  const onPointerMove = (pokemonId: string) => {
    if (!multiSelectMode || !isSelecting) return;
    if (!selectedUnassigned.includes(pokemonId)) {
      setSelectedUnassigned((prev) => [...prev, pokemonId]);
      hasSlid.current = true;
    }
  };

  const handlePointerMoveGlobal = (e: React.PointerEvent) => {
    if (longPressTimer.current && pointerStart.current) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.hypot(dx, dy) > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsSelecting(false);
    pointerStart.current = null;
  };

  const onPointerUp = (pokemonId: string) => {
    setIsSelecting(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // If it was a simple tap (no slide, no long press), and in multi-select mode, then toggle
    if (multiSelectMode && !longPressTriggered.current && !hasSlid.current) {
      if (selectedUnassigned.includes(pokemonId)) {
        setSelectedUnassigned((prev) => prev.filter((p) => p !== pokemonId));
      } else {
        setSelectedUnassigned((prev) => [...prev, pokemonId]);
      }
    }
  };

  const moveSelectedToTier = (targetTierId: string | null) => {
    if (selectedUnassigned.length === 0) return;
    const idsToMove = [...selectedUnassigned];

    if (targetTierId !== null) {
      setTiers((prev) =>
        prev.map((t) =>
          t.id === targetTierId
            ? { ...t, pokemonIds: [...t.pokemonIds, ...idsToMove] }
            : t,
        ),
      );
      setUnassigned((prev) =>
        prev.filter((p) => !idsToMove.includes(p.pokemon.id)),
      );
    }

    setSelectedUnassigned([]);
    setShowLongPressMenu(null);
  };

  const handleImportAllToTier = (targetTierId: string) => {
    if (
      !confirm(
        `确定要将当前筛选的 ${filteredUnassigned.length} 只宝可梦导入该档位吗？`,
      )
    )
      return;
    const idsToMove = filteredUnassigned.map((p) => p.pokemon.id);

    setTiers((prev) =>
      prev.map((t) =>
        t.id === targetTierId
          ? { ...t, pokemonIds: [...t.pokemonIds, ...idsToMove] }
          : t,
      ),
    );
    setUnassigned((prev) =>
      prev.filter((p) => !idsToMove.includes(p.pokemon.id)),
    );
    setSelectedUnassigned([]);
  };

  const handleDragStart = (
    e: React.DragEvent,
    pokemon: any,
    sourceTierId?: string,
  ) => {
    // Cancel any pending long press when dragging starts
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsSelecting(false);

    let items = [pokemon];
    if (sourceTierId === undefined) {
      if (selectedUnassigned.includes(pokemon.pokemon.id)) {
        items = unassigned.filter((p) =>
          selectedUnassigned.includes(p.pokemon.id),
        );
      } else {
        setSelectedUnassigned([pokemon.pokemon.id]);
      }
    }
    setDraggedPokemon({ pokemon, sourceTierId, items });
  };

  const handleDrop = (targetTierId: string | null) => {
    if (!draggedPokemon) return;
    const { items, sourceTierId } = draggedPokemon;
    if (!items || items.length === 0) return;
    const idsToMove = items.map((p: any) => p.pokemon.id);

    if (sourceTierId === undefined || sourceTierId === null) {
      setUnassigned((prev) =>
        prev.filter((p) => !idsToMove.includes(p.pokemon.id)),
      );
      setSelectedUnassigned([]);
    } else if (sourceTierId) {
      setTiers((prev) =>
        prev.map((t) =>
          t.id === sourceTierId
            ? {
                ...t,
                pokemonIds: t.pokemonIds.filter(
                  (id) => !idsToMove.includes(id),
                ),
              }
            : t,
        ),
      );
    }

    if (targetTierId === null) {
      setUnassigned((prev) => [...prev, ...items]);
    } else {
      setTiers((prev) =>
        prev.map((t) =>
          t.id === targetTierId
            ? { ...t, pokemonIds: [...t.pokemonIds, ...idsToMove] }
            : t,
        ),
      );
    }
    setDraggedPokemon(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 保存前确保所有 tiers 都有颜色
      const tiersWithColors = assignColorsToTiers(tiers);
      const finalTiers = tiers.map((tier) => {
        const colorTier = tiersWithColors.find((t) => t.price === tier.price);
        return {
          ...tier,
          color: colorTier?.color || tier.color || "#3b82f6",
        };
      });

      const res = await apiFetch(`/api/admin/contests/${id}/price-tiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: finalTiers, playerTokens, dpTargetMode }),
      });
      if (res.ok) {
        alert("价格分档已成功保存！");
        router.push(`/admin/contests/${id}`);
      } else {
        const err = await res.json();
        alert(`保存失败: ${err.error || "未知"}`);
      }
    } catch (err: any) {
      alert(`网络错误: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (
    tierId: string,
    field: "name" | "price",
    value: string | number,
  ) => {
    setTiers((prev) => {
      const updated = prev.map((t) =>
        t.id === tierId ? { ...t, [field]: value } : t,
      );
      // 如果修改了价格，重新分配颜色以确保颜色阶梯正确
      if (field === "price") {
        const tiersWithColors = assignColorsToTiers(updated);
        return updated.map((tier) => {
          const colorTier = tiersWithColors.find((t) => t.price === tier.price);
          return {
            ...tier,
            color: colorTier?.color || tier.color || "#3b82f6",
          };
        });
      }
      return updated;
    });
  };

  const addTier = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setTiers((prev) => {
      const newTiers = [
        ...prev,
        {
          id: newId,
          name: "新分级",
          price: 1,
          color: "#9ca3af",
          pokemonIds: [],
        },
      ];
      // 为所有 tiers 重新分配颜色（包括新添加的）
      const tiersWithColors = assignColorsToTiers(newTiers);
      return newTiers.map((tier) => {
        const colorTier = tiersWithColors.find((t) => t.price === tier.price);
        return {
          ...tier,
          color: colorTier?.color || tier.color || "#3b82f6",
        };
      });
    });
  };

  const deleteTier = (tierId: string) => {
    if (!confirm("确定要删除这个分级吗？其中包含的宝可梦将回到未分配状态。"))
      return;
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const pokemonToRelease = pokemonPool.filter((p) =>
      tier.pokemonIds.includes(p.pokemon.id),
    );
    setUnassigned((prev) => [...prev, ...pokemonToRelease]);
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
  };

  const sortTiersByPriceDesc = () => {
    setTiers((prev) => [...prev].sort((a, b) => b.price - a.price));
  };

  const handleTierDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/x-tier-index", String(index));
    setDraggedTierIndex(index);
  };

  const handleTierDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData("application/x-tier-index");
    if (raw === "") return;
    const fromIndex = parseInt(raw, 10);
    if (fromIndex === targetIndex) return;

    setTiers((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setDraggedTierIndex(null);
  };

  const removePokemonFromTier = (pokemonId: string, tierId: string) => {
    const pokemon = pokemonPool.find((p) => p.pokemon.id === pokemonId);
    if (!pokemon) return;

    setTiers((prev) =>
      prev.map((t) =>
        t.id === tierId
          ? { ...t, pokemonIds: t.pokemonIds.filter((id) => id !== pokemonId) }
          : t,
      ),
    );
    setUnassigned((prev) => [...prev, pokemon]);
  };

  const getPokemonInTier = (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return [];
    return pokemonPool.filter((p) => tier.pokemonIds.includes(p.pokemon.id));
  };

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

  // Use hook for filtering
  const { filtered: filteredUnassigned } = usePokemonFilter({
    pool: unassigned,
    searchTerm,
    types,
    gens,
    typePriority,
    sortBy: "bst", // Keep BST sort for this view
  });

  const runDpAnalysis = () => {
    setComputingDp(true);
    setDpResults([]);
    setTimeout(() => {
      const teamSize = contest?.maxPokemonPerPlayer || 6;
      const budget = playerTokens;
      const activeTiers = tiers
        .filter((t) => t.price > 0 || t.pokemonIds.length > 0)
        .sort((a, b) => b.price - a.price);
      const results: any[] = [];

      function solve(
        idx: number,
        count: number,
        cost: number,
        comp: Record<string, number>,
      ) {
        if (cost > budget) return;
        if (count === teamSize) {
          results.push({ comp: { ...comp }, cost, remaining: budget - cost });
          return;
        }
        if (idx >= activeTiers.length) return;
        const tier = activeTiers[idx];
        const min = dpConstraints[tier.id]?.min || 0;
        const max =
          dpConstraints[tier.id]?.max !== undefined
            ? dpConstraints[tier.id].max
            : teamSize;
        for (let c = min; c <= max; c++) {
          if (count + c > teamSize) break;
          comp[tier.id] = c;
          solve(idx + 1, count + c, cost + c * tier.price, comp);
          delete comp[tier.id];
        }
      }
      solve(0, 0, 0, {});
      results.sort((a, b) => a.remaining - b.remaining);
      setDpResults(results.slice(0, 50));
      setComputingDp(false);
    }, 100);
  };

  if (loading) return <Loading text="加载分档数据中..." />;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 dark:bg-gray-950 dark:text-white">
      <Header
        variant="admin"
        transparent={true}
        title={contest?.name || ""}
        className="p-4"
        leftSlot={<BackButton href={`/admin/contests/${id}`} />}
        rightSlot={
          <>
            <ThemeToggle />
            <HeaderButton
              onClick={handleSave}
              disabled={saving}
              variant="primary"
              size="lg"
              className="hidden md:flex"
            >
              {saving ? "保存中..." : "提交"}
            </HeaderButton>
            <HeaderButton
              onClick={handleSave}
              disabled={saving}
              variant="primary"
              className="!px-2 md:hidden"
              icon={
                <svg
                  className="h-6 w-6"
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
              }
            >
              <span className="sr-only">保存</span>
            </HeaderButton>
          </>
        }
      />

      <main className="relative flex h-[calc(100dvh-150px)] w-full flex-col gap-4 overflow-hidden p-4 md:h-[calc(100vh-73px)] md:flex-row">
        {/* Left Column: Unassigned */}
        <div
          className={`flex w-full flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 md:w-80 md:flex-none dark:border-white/5 dark:bg-gray-900 ${activeMobileTab === "unassigned" ? "block" : "hidden md:flex"}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(null)}
        >
          <div className="space-y-3 border-b border-gray-200 p-4 dark:border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold tracking-widest text-gray-500 uppercase dark:text-gray-400">
                  未分配 ({filteredUnassigned.length})
                </h3>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`rounded-lg p-1 transition ${
                    showFilters
                      ? "bg-blue-500 text-white"
                      : "text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/10"
                  }`}
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
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  多选
                </span>
                <button
                  onClick={() => {
                    setMultiSelectMode(!multiSelectMode);
                    setSelectedUnassigned([]);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${multiSelectMode ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${multiSelectMode ? "translate-x-5" : "translate-x-1"}`}
                  />
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-gray-50 px-3 py-1.5 text-xs transition outline-none focus:border-blue-500/50 dark:bg-black/20 dark:text-white"
            />
            {showFilters && (
              <div className="animate-in slide-in-from-top-2 space-y-3 pt-2">
                {/* Types */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                      属性
                    </h4>
                    <button
                      onClick={() =>
                        setTypes((prev) => ({
                          ...prev,
                          mode: prev.mode === "AND" ? "OR" : "AND",
                        }))
                      }
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[8px] font-black text-gray-500 hover:text-blue-500 dark:bg-gray-800 dark:text-gray-400"
                    >
                      {types.mode === "AND" ? "AND" : "OR"}
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
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                            state === "include"
                              ? "scale-105 border-blue-600 bg-blue-500 text-white shadow-md"
                              : state === "exclude"
                                ? "border-red-600 bg-red-500 text-white opacity-50"
                                : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                          } `}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Gens */}
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                    世代
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
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold transition-all ${
                            state === "include"
                              ? "scale-105 border-green-600 bg-green-500 text-white shadow-md"
                              : state === "exclude"
                                ? "border-red-600 bg-red-500 text-white opacity-50"
                                : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                          } `}
                        >
                          G{g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Clear */}
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
                    className="w-full rounded bg-gray-100 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    清除所有筛选
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2 pb-32 md:pb-2">
            {filteredUnassigned.map((item) => (
              <div
                key={item.pokemon.id}
                draggable={!isTouchDevice && !multiSelectMode}
                onDragStart={(e) => handleDragStart(e, item, undefined)}
                onPointerDown={(e) => onPointerDown(item.pokemon.id, e)}
                onPointerEnter={() => onPointerMove(item.pokemon.id)}
                onPointerMove={handlePointerMoveGlobal}
                onPointerUp={() => onPointerUp(item.pokemon.id)}
                onPointerCancel={handlePointerCancel}
                className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition select-none md:cursor-move ${multiSelectMode ? "touch-none" : "touch-pan-y"} ${
                  selectedUnassigned.includes(item.pokemon.id)
                    ? "border-blue-500/30 bg-blue-600/10"
                    : "border-transparent hover:bg-white/5"
                }`}
              >
                <div className="relative">
                  <span
                    className="picon picon-sm"
                    style={
                      typeof getPokemonStaticIcon(
                        item.pokemon.num,
                        item.pokemon.name,
                        "sm",
                      ) === "object"
                        ? (getPokemonStaticIcon(
                            item.pokemon.num,
                            item.pokemon.name,
                            "sm",
                          ) as any)
                        : {}
                    }
                  ></span>
                  {multiSelectMode &&
                    selectedUnassigned.includes(item.pokemon.id) && (
                      <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-600 dark:border-gray-900">
                        <svg
                          className="h-2.5 w-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                        </svg>
                      </div>
                    )}
                </div>
                <span
                  className={`truncate text-[11px] font-black ${selectedUnassigned.includes(item.pokemon.id) ? "text-blue-500" : "text-gray-500 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200"}`}
                  title={item.pokemon.name}
                >
                  {item.pokemon.nameCn || item.pokemon.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center Column: Tiers */}
        <div
          className={`custom-scrollbar flex-1 space-y-4 overflow-y-auto pr-2 pb-32 md:pb-0 ${activeMobileTab === "tiers" ? "block" : "hidden md:block"}`}
        >
          <div className="flex items-center justify-between px-2 pt-2">
            <h2 className="text-xs font-black tracking-widest text-gray-400 uppercase dark:text-gray-500">
              价格档位 ({tiers.length})
            </h2>
            <button
              onClick={sortTiersByPriceDesc}
              className="relative z-10 flex items-center gap-2 rounded-xl p-2 text-gray-400 transition hover:bg-gray-200 hover:text-blue-500 dark:hover:bg-white/10"
              title="按价格从高到低排序"
            >
              <span className="text-[10px] font-black uppercase">
                按价格排序
              </span>
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
                  d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                />
              </svg>
            </button>
          </div>
          {tiers.map((tier, tierIndex) => (
            <div
              key={tier.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("application/x-tier-index");
                if (raw !== "") handleTierDrop(e, tierIndex);
                else handleDrop(tier.id);
              }}
              className={`relative overflow-hidden rounded-3xl border border-gray-200 bg-white pl-2 shadow-sm transition-opacity dark:border-white/5 dark:bg-gray-900 ${draggedTierIndex === tierIndex ? "opacity-50" : ""}`}
            >
              <div
                className="absolute inset-y-0 left-0 w-2"
                style={{ backgroundColor: tier.color }}
              ></div>
              <div className="flex items-center gap-4 border-b border-gray-100 bg-gray-50/20 p-4 dark:border-white/5 dark:bg-black/10">
                <div
                  draggable={!isTouchDevice}
                  onDragStart={(e) => handleTierDragStart(e, tierIndex)}
                  className="cursor-move rounded-xl p-2 transition hover:bg-white dark:hover:bg-white/5"
                >
                  <svg
                    className="h-4 w-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 8h16M4 16h16"
                    />
                  </svg>
                </div>
                <input
                  className="w-24 flex-shrink-0 bg-transparent text-lg font-black focus:outline-none"
                  value={tier.name}
                  style={{ color: tier.color }}
                  onChange={(e) => updateTier(tier.id, "name", e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-400 dark:text-gray-500">
                    价格:
                  </span>
                  <input
                    type="number"
                    className="no-spinner w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center font-black dark:border-white/10 dark:bg-black/40 dark:text-white"
                    value={tier.price}
                    onChange={(e) =>
                      updateTier(
                        tier.id,
                        "price",
                        parseInt(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="font-bold text-gray-400 dark:text-gray-500">
                    G
                  </span>
                </div>
                <div className="flex-1"></div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleImportAllToTier(tier.id)}
                    className="rounded-xl p-2 text-xs font-bold text-indigo-500 transition hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                    title="导入全部搜索结果"
                  >
                    导入全部
                  </button>
                  <button
                    onClick={() => deleteTier(tier.id)}
                    className="rounded-xl p-2 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="grid min-h-[100px] grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {getPokemonInTier(tier.id).map((p) => (
                  <div
                    key={p.pokemon.id}
                    draggable={!isTouchDevice}
                    onDragStart={(e) => handleDragStart(e, p, tier.id)}
                    className="group relative flex cursor-move flex-col items-center gap-1 rounded-2xl border border-transparent bg-gray-50 p-2 shadow-sm transition hover:border-gray-200 hover:bg-white hover:shadow-md dark:bg-black/20 dark:hover:border-white/10 dark:hover:bg-white/5"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePokemonFromTier(p.pokemon.id, tier.id);
                      }}
                      className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition group-hover:flex hover:bg-red-600"
                      title="移除"
                    >
                      <svg
                        className="h-2.5 w-2.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                    <span
                      className="picon picon-md"
                      style={
                        typeof getPokemonStaticIcon(
                          p.pokemon.num,
                          p.pokemon.name,
                          "md",
                        ) === "object"
                          ? (getPokemonStaticIcon(
                              p.pokemon.num,
                              p.pokemon.name,
                              "md",
                            ) as any)
                          : {}
                      }
                    ></span>
                    <span className="w-full truncate text-center text-[10px] font-black text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
                      {p.pokemon.nameCn || p.pokemon.name}
                    </span>
                  </div>
                ))}
                {tier.pokemonIds.length === 0 && (
                  <div className="col-span-full flex h-24 items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 font-black text-gray-300 italic dark:border-white/5 dark:text-gray-700">
                    拖拽至此处
                  </div>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addTier}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-gray-200 font-black text-gray-400 transition hover:bg-blue-50 hover:text-blue-500 dark:border-white/10 dark:hover:bg-blue-500/5"
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
                strokeWidth="3"
                d="M12 4v16m8-8H4"
              />
            </svg>
            添加价格档位
          </button>
        </div>

        {/* Right Column: Settings & Analysis */}
        <div
          className={`flex h-full w-full flex-1 flex-col space-y-4 md:w-80 md:flex-none ${activeMobileTab === "settings" ? "block" : "hidden md:block"}`}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-gray-900">
            <div className="flex-none space-y-6">
              <div>
                <h3 className="mb-4 text-xs font-black tracking-widest text-gray-400 uppercase">
                  全局设置
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold opacity-70">
                      玩家预算 (G)
                    </span>
                    <input
                      type="number"
                      className="no-spinner w-20 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-right font-black dark:border-white/10 dark:bg-black/40"
                      value={playerTokens}
                      onChange={(e) =>
                        setPlayerTokens(parseInt(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold opacity-70">
                      DP 目标模式
                    </span>
                    <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-black/40">
                      {(["BEST", "MINIMUM"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setDpTargetMode(mode)}
                          className={`rounded-lg px-3 py-1 text-[10px] font-black transition ${dpTargetMode === mode ? "bg-white text-blue-500 shadow-sm dark:bg-gray-700" : "text-gray-500"}`}
                        >
                          {mode === "BEST" ? "最高性价比" : "最低预算"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col border-t border-gray-100 pt-6 dark:border-white/5">
              <div className="mb-4 flex flex-none items-center justify-between">
                <h3 className="text-xs font-black tracking-widest text-gray-400 uppercase">
                  组队方案分析 (DP)
                </h3>
                <button
                  onClick={runDpAnalysis}
                  disabled={computingDp}
                  className="flex items-center gap-1 rounded-xl p-2 text-xs font-bold text-blue-500 transition hover:bg-blue-50 dark:hover:bg-blue-500/10"
                >
                  {computingDp ? "计算中..." : "开始分析"}
                </button>
              </div>

              <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2 pb-32 md:pb-0">
                {dpResults.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400 italic dark:text-gray-600">
                    点击分析生成推荐组合
                  </div>
                ) : (
                  dpResults.map((res, idx) => (
                    <div
                      key={idx}
                      className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/5 dark:bg-black/20"
                    >
                      <div className="flex items-center justify-between text-[10px] font-black tracking-tighter uppercase opacity-50">
                        <span>方案 {idx + 1}</span>
                        <span
                          className={
                            res.remaining === 0
                              ? "text-green-500"
                              : "text-blue-500"
                          }
                        >
                          剩余 {res.remaining}G
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tiers
                          .filter((t) => res.comp[t.id] > 0)
                          .map((t) => (
                            <div
                              key={t.id}
                              className="rounded-md border border-gray-100 bg-white px-2 py-0.5 text-[10px] font-bold dark:border-white/5 dark:bg-gray-800"
                            >
                              <span style={{ color: t.color }}>{t.name}</span>
                              <span className="ml-1 opacity-50">
                                x{res.comp[t.id]}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Long Press Menu */}
        {showLongPressMenu && (
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setShowLongPressMenu(null)}
          >
            <div
              className="animate-in fade-in zoom-in absolute w-48 rounded-2xl border border-gray-200 bg-white py-2 shadow-2xl duration-100 dark:border-white/10 dark:bg-gray-900"
              style={{
                left: Math.min(showLongPressMenu.x, window.innerWidth - 200),
                top: Math.min(showLongPressMenu.y, window.innerHeight - 300),
              }}
            >
              <div className="mb-2 border-b border-gray-100 px-4 py-2 text-[10px] font-black tracking-widest text-gray-400 uppercase dark:border-white/5">
                移至档位 ({selectedUnassigned.length})
              </div>
              {tiers.map((tier) => (
                <button
                  key={tier.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveSelectedToTier(tier.id);
                  }}
                  className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tier.color }}
                  ></div>
                  <span className="text-sm font-bold transition-colors group-hover:text-blue-500">
                    {tier.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Tab Bar */}
      <nav className="fixed right-0 bottom-0 left-0 z-[90] flex items-center justify-around border-t border-gray-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-gray-900/95">
        <button
          onClick={() => setActiveMobileTab("unassigned")}
          className={`flex flex-1 flex-col items-center gap-1 py-1 transition ${activeMobileTab === "unassigned" ? "text-blue-500" : "text-gray-400"}`}
        >
          <div
            className={`rounded-xl p-1.5 transition ${activeMobileTab === "unassigned" ? "bg-blue-500/10" : ""}`}
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
                strokeWidth="2.5"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <span className="text-[10px] font-black uppercase">未分配</span>
        </button>
        <button
          onClick={() => setActiveMobileTab("tiers")}
          className={`flex flex-1 flex-col items-center gap-1 py-1 transition ${activeMobileTab === "tiers" ? "text-blue-500" : "text-gray-400"}`}
        >
          <div
            className={`rounded-xl p-1.5 transition ${activeMobileTab === "tiers" ? "bg-blue-500/10" : ""}`}
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
                strokeWidth="2.5"
                d="M4 6h16M4 12h16m-7 6h7"
              />
            </svg>
          </div>
          <span className="text-[10px] font-black uppercase">分档位</span>
        </button>
        <button
          onClick={() => setActiveMobileTab("settings")}
          className={`flex flex-1 flex-col items-center gap-1 py-1 transition ${activeMobileTab === "settings" ? "text-blue-500" : "text-gray-400"}`}
        >
          <div
            className={`rounded-xl p-1.5 transition ${activeMobileTab === "settings" ? "bg-blue-500/10" : ""}`}
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
                strokeWidth="2.5"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <span className="text-[10px] font-black uppercase">分析设置</span>
        </button>
      </nav>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.4);
        }
        .no-spinner::-webkit-inner-spin-button,
        .no-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
