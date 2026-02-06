'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/app/lib/api/fetch'
import { Header, HomeButton } from '@/app/components/Header'
import { HeaderButton } from '@/app/components/HeaderButton'
import { getPokemonStaticIcon } from '@/app/lib/utils/helpers'
import { TYPE_COLORS } from '@/app/lib/utils/constants'
import { useSearchHints } from '@/app/lib/hooks/useSearchHints'
import { Loading } from '@/app/components/Loading'
import ThemeToggle from '@/app/components/ThemeToggle'

const ALL_TYPES = Object.keys(TYPE_COLORS)

export default function CreateContest() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [pokemonList, setPokemonList] = useState<any[]>([])

  // UI States
  const [sectionsOpen, setSectionsOpen] = useState({
    basic: true,
    stats: true,
    types: false, // Default closed to save space
    gens: false,
  })
  const placeholder = useSearchHints()

  const toggleSection = (name: keyof typeof sectionsOpen) => {
    setSectionsOpen((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  // Basic Settings
  const [formData, setFormData] = useState({
    name: '',
    ruleSet: 'Regulation H',
    draftMode: 'SNAKE',
    playerTokens: 100,
    maxPokemonPerPlayer: 6,
    auctionBasePrice: 10,
    auctionBidDuration: 30,
    showPlayerPokemon: true,
    playerDisplayStyle: 'minimal',
    allowTradingDuringDraft: false,
  })

  // Filter Settings
  const [stats, setStats] = useState<any>({
    hp: [0, 255],
    atk: [0, 255],
    def: [0, 255],
    spa: [0, 255],
    spd: [0, 255],
    spe: [0, 255],
    bst: [0, 1000], // Added BST range
  })

  const [types, setTypes] = useState<{
    include: string[]
    exclude: string[]
  }>({
    include: [],
    exclude: [],
  })

  const [gens, setGens] = useState<{
    mode: 'OR'
    include: number[]
    exclude: number[]
  }>({
    mode: 'OR',
    include: [],
    exclude: [],
  })

  const [psQuery, setPsQuery] = useState('')

  // Fetch Preview
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const res = await apiFetch('/api/admin/pokemon/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats,
          types,
          gens: gens.include,
          ruleSet: formData.ruleSet,
          query: psQuery,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        console.log('[DEBUG] Preview fetched:', data.length, 'pokemon')
        setPokemonList(data)
      } else {
        console.error('[DEBUG] Preview fetch failed:', res.status)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setPreviewLoading(false)
    }
  }, [stats, types, gens, formData.ruleSet, psQuery])

  useEffect(() => {
    document.title = '宝可梦选秀系统-创建比赛'
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPreview()
    }, 500)
    return () => clearTimeout(timer)
  }, [fetchPreview])

  const handleTypeClick = (type: string) => {
    setTypes((prev) => {
      if (prev.include.includes(type)) {
        return {
          ...prev,
          include: prev.include.filter((t) => t !== type),
          exclude: [...prev.exclude, type],
        }
      } else if (prev.exclude.includes(type)) {
        return { ...prev, exclude: prev.exclude.filter((t) => t !== type) }
      } else {
        return {
          ...prev,
          include: [...prev.include, type],
          exclude: prev.exclude.filter((t) => t !== type),
        }
      }
    })
  }

  const handleGenClick = (gen: number) => {
    setGens((prev) => {
      if (prev.include.includes(gen)) {
        return {
          ...prev,
          include: prev.include.filter((g) => g !== gen),
          exclude: [...prev.exclude, gen],
        }
      } else if (prev.exclude.includes(gen)) {
        return { ...prev, exclude: prev.exclude.filter((g) => g !== gen) }
      } else {
        return {
          ...prev,
          include: [...prev.include, gen],
          exclude: prev.exclude.filter((g) => g !== gen),
        }
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const body = {
        ...formData,
        filters: {
          minHP: stats.hp[0],
          maxHP: stats.hp[1],
          minAtk: stats.atk[0],
          maxAtk: stats.atk[1],
          minDef: stats.def[0],
          maxDef: stats.def[1],
          minSpA: stats.spa[0],
          maxSpA: stats.spa[1],
          minSpD: stats.spd[0],
          maxSpD: stats.spd[1],
          minSpe: stats.spe[0],
          maxSpe: stats.spe[1],
          minBST: stats.bst[0],
          maxBST: stats.bst[1],
          types: types.include,
          excludeTypes: types.exclude,
          gens: gens.include,
          query: psQuery,
          limit: 10000,
        },
      }
      console.log('[DEBUG] Sending payload:', JSON.stringify(body))
      const res = await apiFetch('/api/admin/contests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        console.log('[DEBUG] Contest created successfully')
        // Redirect based on draft mode
        if (formData.draftMode === 'SNAKE') {
          router.push(`/admin/contests/${data.contestId}/price-tiers`)
        } else {
          router.push(`/admin/contests/${data.contestId}`)
        }
      } else {
        const err = await res.json()
        console.error('[DEBUG] Creation failed:', err)
        alert(err.error || '创建失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading text="加载配置中..." />

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 font-sans text-gray-900 dark:bg-gray-950 dark:text-white">
      <Header
        variant="admin"
        title="创建新比赛"
        leftSlot={<HomeButton href="/admin/dashboard" />}
        rightSlot={
          <>
            <ThemeToggle />
            <HeaderButton
              onClick={handleSubmit}
              disabled={loading}
              variant="primary"
              size="lg"
            >
              {loading ? '创建中...' : '提交并生成比赛'}
            </HeaderButton>
          </>
        }
      />

      <div className="flex flex-col overflow-y-auto lg:h-[calc(100vh-65px)] lg:flex-row lg:overflow-hidden">
        {/* Left: Filters */}
        <div className="scrollbar-hide w-full space-y-6 border-r border-gray-200 bg-white p-4 lg:w-1/3 lg:space-y-8 lg:overflow-y-auto lg:p-6 dark:border-white/5 dark:bg-gray-900">
          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 transition-colors dark:border-white/5 dark:bg-gray-900/50">
            <button
              onClick={() => toggleSection('basic')}
              className="flex w-full items-center justify-between p-4 transition hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <h3 className="text-sm font-bold tracking-widest text-gray-400 uppercase dark:text-gray-500">
                基本配置
              </h3>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${sectionsOpen.basic ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {sectionsOpen.basic && (
              <div className="animate-in slide-in-from-top-2 space-y-4 p-4 pt-0 duration-200">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">
                    比赛名称
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold transition-all outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="例如: S1 周末友谊赛"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">
                    基础规则集
                  </label>
                  <select
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold transition-all outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    value={formData.ruleSet}
                    onChange={(e) =>
                      setFormData({ ...formData, ruleSet: e.target.value })
                    }
                  >
                    <option value="Regulation H">Regulation H (残奥会)</option>
                    <option value="Regulation G">Regulation G (单神战)</option>
                    <option value="Regulation F">
                      Regulation F (全国普双)
                    </option>
                    <option value="None">不限制 (所有宝可梦)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">
                    选秀模式
                  </label>
                  <select
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold transition-all outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    value={formData.draftMode}
                    onChange={(e) =>
                      setFormData({ ...formData, draftMode: e.target.value })
                    }
                  >
                    <option value="SNAKE">蛇形选秀 (Snake Draft)</option>
                    <option value="AUCTION">竞价拍卖 (Auction)</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">
                      初始筹码
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold transition-all outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      value={formData.playerTokens}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          playerTokens: +e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-bold text-gray-500 dark:text-gray-400">
                      捕捉上限
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold transition-all outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      value={formData.maxPokemonPerPlayer}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxPokemonPerPlayer: +e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Trading Hidden (Dev) */}
                <div className="hidden">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allowTradingDuringDraft"
                      checked={formData.allowTradingDuringDraft}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          allowTradingDuringDraft: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="allowTradingDuringDraft"
                      className="text-xs font-bold text-gray-500"
                    >
                      允许在选秀进行中交易
                    </label>
                  </div>
                </div>

                {formData.draftMode === 'AUCTION' && (
                  <div className="space-y-4 border-t border-gray-100 pt-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500">
                        竞拍统一底价
                      </label>
                      <input
                        type="number"
                        className="input-primary mt-1 rounded-lg p-2"
                        value={formData.auctionBasePrice}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            auctionBasePrice: +e.target.value,
                          })
                        }
                        min="1"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        所有宝可梦的起拍价格
                      </p>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="noTimeLimit"
                          checked={formData.auctionBidDuration === 0}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              auctionBidDuration: e.target.checked ? 0 : 30,
                            })
                          }
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <label
                          htmlFor="noTimeLimit"
                          className="text-xs font-bold text-gray-500"
                        >
                          无时间限制（手动结束竞拍）
                        </label>
                      </div>
                      {formData.auctionBidDuration > 0 && (
                        <>
                          <label className="text-xs font-bold text-gray-500">
                            竞拍倒计时 (秒)
                          </label>
                          <input
                            type="number"
                            className="input-primary mt-1 rounded-lg p-2"
                            value={formData.auctionBidDuration}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                auctionBidDuration: +e.target.value,
                              })
                            }
                            min="5"
                            step="5"
                          />
                          <p className="mt-1 text-xs text-gray-400">
                            每次出价后的等待时间
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 transition-colors dark:border-white/5 dark:bg-gray-900/50">
            <button
              onClick={() => toggleSection('stats')}
              className="flex w-full items-center justify-between p-4 transition hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <h3 className="text-sm font-bold tracking-widest text-gray-400 uppercase dark:text-gray-500">
                种族值区间 (Min - Max)
              </h3>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${sectionsOpen.stats ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {sectionsOpen.stats && (
              <div className="animate-in slide-in-from-top-2 grid grid-cols-1 gap-4 p-4 pt-0 duration-200">
                {['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst'].map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-8 text-[10px] font-black text-gray-400 uppercase dark:text-gray-500">
                      {s}
                    </span>
                    <input
                      type="number"
                      className="w-16 rounded-lg border border-gray-200 bg-white p-1 text-center text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      value={stats[s][0]}
                      onChange={(e) =>
                        setStats({
                          ...stats,
                          [s]: [+e.target.value, stats[s][1]],
                        })
                      }
                    />
                    <div className="relative h-1 flex-1 rounded-full bg-gray-100 dark:bg-white/10">
                      <div
                        className="absolute h-full rounded-full bg-blue-500 transition-all"
                        style={{
                          left: `${(stats[s][0] / (s === 'bst' ? 1000 : 255)) * 100}%`,
                          right: `${100 - (stats[s][1] / (s === 'bst' ? 1000 : 255)) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <input
                      type="number"
                      className="w-16 rounded-lg border border-gray-200 bg-white p-1 text-center text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      value={stats[s][1]}
                      onChange={(e) =>
                        setStats({
                          ...stats,
                          [s]: [stats[s][0], +e.target.value],
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 transition-colors dark:border-white/5 dark:bg-gray-900/50">
            <button
              onClick={() => toggleSection('types')}
              className="flex w-full items-center justify-between p-4 transition hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <h3 className="text-sm font-bold tracking-widest text-gray-400 uppercase dark:text-gray-500">
                属性过滤
              </h3>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${sectionsOpen.types ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {sectionsOpen.types && (
              <div className="animate-in slide-in-from-top-2 p-4 pt-0 duration-200">
                <div className="flex flex-wrap gap-2">
                  {ALL_TYPES.map((t) => {
                    const isInc = types.include.includes(t)
                    const isExc = types.exclude.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => handleTypeClick(t)}
                        className={`rounded-full border px-3 py-1 text-xs font-bold transition-all ${
                          isInc
                            ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-blue-900/40'
                            : isExc
                              ? 'border-red-600 bg-red-600 text-white line-through shadow-lg shadow-red-100 dark:shadow-red-900/40'
                              : 'border-gray-100 bg-gray-100 text-gray-500 hover:bg-gray-200 dark:border-white/5 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
                        }`}
                      >
                        {isInc ? '+' : isExc ? '-' : ''} {t}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-[10px] font-bold tracking-wider text-gray-400 uppercase dark:text-gray-600">
                  点击包含 / 再次点击排除 / 第三次取消
                </p>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50/50 transition-colors dark:border-white/5 dark:bg-gray-900/50">
            <button
              onClick={() => toggleSection('gens')}
              className="flex w-full items-center justify-between p-4 transition hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <h3 className="text-sm font-bold tracking-widest text-gray-400 uppercase dark:text-gray-500">
                世代过滤
              </h3>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${sectionsOpen.gens ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {sectionsOpen.gens && (
              <div className="animate-in slide-in-from-top-2 p-4 pt-0 duration-200">
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                    <button
                      key={g}
                      onClick={() => handleGenClick(g)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                        gens.include.includes(g)
                          ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-blue-900/40'
                          : gens.exclude.includes(g)
                            ? 'border-red-600 bg-red-600 text-white line-through shadow-lg shadow-red-100 dark:shadow-red-900/40'
                            : 'border-gray-100 bg-gray-100 text-gray-500 hover:bg-gray-200 dark:border-white/5 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right: Preview */}
        <div className="flex min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950">
          <header className="z-10 flex-none border-b border-gray-200 bg-white p-4 md:p-6 dark:border-white/5 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-800 dark:text-white">
                <span>预览池</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-white/10 dark:text-gray-300">
                  {previewLoading ? '...' : pokemonList.length}
                </span>
              </h2>
              <div className="font-mono text-xs text-gray-400 dark:text-gray-500">
                Rule: {formData.ruleSet}
              </div>
            </div>
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 transition-colors group-focus-within:text-blue-500">
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
                placeholder={placeholder}
                value={psQuery}
                onChange={(e) => setPsQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 border-transparent bg-gray-100 py-3 pr-4 pl-10 text-sm font-medium shadow-sm transition-all outline-none focus:border-blue-500 focus:bg-white dark:border-white/5 dark:bg-black/20 dark:text-white dark:focus:border-blue-500 dark:focus:bg-black/40"
              />
            </div>
          </header>

          <div className="flex-1 p-4 lg:overflow-y-auto">
            {pokemonList.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-300">
                <svg
                  className="mb-4 h-16 w-16 opacity-20"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="font-bold">未找到符合条件的回复可梦</p>
              </div>
            ) : (
              <div className="flex flex-wrap content-start gap-1">
                {pokemonList.map((p) => (
                  <div
                    key={p.id}
                    className="flex h-10 w-10 cursor-help items-center justify-center rounded border border-gray-100 bg-white transition-all hover:z-10 hover:scale-125 hover:border-blue-500 hover:shadow-lg dark:border-white/10 dark:bg-white/5"
                    title={`${p.nameCn || p.name} (#${p.num})\n属性: ${p.types.join('/')}\nHP:${p.hp} 物攻:${p.atk} 物防:${p.def} 特攻:${p.spa} 特防:${p.spd} 速度:${p.spe}`}
                  >
                    <span
                      className="picon"
                      style={
                        typeof getPokemonStaticIcon(p.num, p.name) === 'object'
                          ? (getPokemonStaticIcon(p.num, p.name) as any)
                          : {}
                      }
                    ></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx>{`
        .pixelated {
          image-rendering: -moz-crisp-edges;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          image-rendering: pixelated;
        }
      `}</style>
    </div>
  )
}
