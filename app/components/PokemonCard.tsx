/**
 * PokemonCard Component
 *
 * Displays a single Pokemon card with actions (pick/nominate/bid)
 */

import { memo } from 'react'
import { getPokemonStaticIcon } from '@/app/lib/utils/helpers'
import { TYPE_COLORS } from '@/app/lib/utils/constants'

interface PokemonCardProps {
  item: any
  isMyTurn: boolean
  onAction: () => void
  mode: string
  hidePrice?: boolean
  /** 乐观更新：正在提交中，显示「选集中」并禁用点击 */
  isPending?: boolean
}

function PokemonCardComponent({
  item,
  isMyTurn,
  onAction,
  mode,
  isPending,
  ...props
}: PokemonCardProps) {
  const picon = getPokemonStaticIcon(item.pokemon.num, item.pokemon.name, 'lg')
  const types = item.pokemon.types || []
  const basePrice = item.basePrice ?? 0
  const canClick = isMyTurn && !isPending

  return (
    <div
      onClick={canClick ? onAction : undefined}
      className={`group relative rounded-xl border-2 p-4 transition-all ${
        isPending
          ? 'cursor-wait border-amber-400 bg-amber-50 opacity-90 dark:bg-amber-900/20'
          : isMyTurn
            ? 'cursor-pointer border-blue-500 bg-white hover:scale-105 hover:border-blue-600 hover:shadow-lg dark:bg-gray-900'
            : 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900/50'
      } `}
    >
      {/* Pokemon Icon */}
      <div className="mb-3 flex justify-center">
        <span
          className="picon picon-lg"
          style={typeof picon === 'object' ? (picon as any) : {}}
        />
      </div>

      {/* Pokemon Name */}
      <h3 className="mb-2 truncate text-center text-sm font-bold">
        {item.pokemon.nameCn || item.pokemon.name}
      </h3>
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-amber-500/20 backdrop-blur-[1px]">
          <span className="text-xs font-black text-amber-700 dark:text-amber-300">
            选集中...
          </span>
        </div>
      )}

      {/* Types */}
      <div className="mb-2 flex justify-center gap-1">
        {types.map((t: string) => (
          <span
            key={t}
            className="h-2 w-2 rounded font-bold text-white md:h-auto md:w-auto md:px-2 md:py-0.5 md:text-xs"
            style={{ backgroundColor: TYPE_COLORS[t] || '#999' }}
            title={t}
          >
            <span className="hidden md:inline">{t}</span>
          </span>
        ))}
      </div>

      {/* Price */}
      {!props.hidePrice && !(mode === 'AUCTION' && basePrice === 0) && (
        <div className="text-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {basePrice} G
          </span>
        </div>
      )}

      {/* Action Hint - Hover Badge */}
      {isMyTurn && !isPending && (
        <div className="absolute top-2 right-2 z-10 scale-75 transform opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-lg ${
              mode === 'SNAKE'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
            } `}
          >
            {mode === 'SNAKE' ? (
              <>
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                选择
              </>
            ) : (
              <>
                <svg
                  className="h-3 w-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
                提名
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function arePropsEqual(prev: PokemonCardProps, next: PokemonCardProps) {
  return (
    prev.isMyTurn === next.isMyTurn &&
    prev.mode === next.mode &&
    prev.hidePrice === next.hidePrice &&
    prev.item.status === next.item.status &&
    prev.item.basePrice === next.item.basePrice &&
    prev.item.pokemonId === next.item.pokemonId
  )
}

export const PokemonCard = memo(PokemonCardComponent, arePropsEqual)
