/**
 * usePokemonFilter - Optimized Pokemon Filtering Hook
 *
 * Provides memoized filtering logic for Pokemon pools with support for:
 * - Type filtering (AND/OR modes, include/exclude)
 * - Generation filtering
 * - PS-style search queries (type:Water, atk>100, etc.)
 * - Tag-based filtering (e.g., hiding irrelevant Pokemon)
 */

import { useMemo } from 'react'
import { parsePSQuery, getGeneration } from '../utils/helpers'

export interface TypeFilter {
  mode: 'AND' | 'OR'
  include: string[]
  exclude: string[]
}

export interface GenFilter {
  mode: 'OR'
  include: number[]
  exclude: number[]
}

export interface UsePokemonFilterOptions {
  pool: any[]
  searchTerm?: string
  types?: TypeFilter
  gens?: GenFilter
  hideIrrelevant?: boolean
  sortBy?: 'bst' | 'type-priority'
  typePriority?: string[]
}

export function usePokemonFilter(options: UsePokemonFilterOptions) {
  const {
    pool,
    searchTerm = '',
    types,
    gens,
    hideIrrelevant = true,
    sortBy = 'bst',
    typePriority = [],
  } = options

  const filtered = useMemo(() => {
    let result = [...pool]

    // Apply filters
    result = result.filter((item) => {
      const pGen = getGeneration(item.pokemon.num, item.pokemon.id)
      const pName = item.pokemon.name.toLowerCase()
      const pNameCn = (item.pokemon.nameCn || '').toLowerCase()

      // 1. Hide irrelevant Pokemon by default (unless searching)
      if (hideIrrelevant && item.pokemon.tags?.includes('irrelevant')) {
        // If there is ANY search term, we let the subsequent filter logic decide
        // This allows searching for "type:Fire" to still show irrelevant fire types if desired.
        // Previously it required name match.
        if (!searchTerm) return false
      }

      // 2. Generation filter
      if (gens) {
        if (gens.include.length > 0 && !gens.include.includes(pGen))
          return false
        if (gens.exclude.length > 0 && gens.exclude.includes(pGen)) return false
      }

      // 3. Type filter
      if (types) {
        if (types.include.length > 0) {
          if (types.mode === 'AND') {
            if (
              !types.include.every((t: string) =>
                item.pokemon.types?.includes(t),
              )
            )
              return false
          } else {
            if (
              !types.include.some((t: string) =>
                item.pokemon.types?.includes(t),
              )
            )
              return false
          }
        }
        if (
          types.exclude.length > 0 &&
          types.exclude.some((t: string) => item.pokemon.types?.includes(t))
        ) {
          return false
        }
      }

      // 4. Search term (PS-style query support)
      if (!searchTerm) return true

      try {
        const {
          name,
          types: qTypes,
          gens: qGens,
          stats,
          excludeNames,
        } = parsePSQuery(searchTerm)

        if (
          name &&
          !pName.includes(name.toLowerCase()) &&
          !pNameCn.includes(name.toLowerCase())
        ) {
          return false
        }

        if (qGens?.length > 0 && !qGens.includes(pGen)) return false

        if (
          qTypes?.length > 0 &&
          !qTypes.every((t: string) => item.pokemon.types?.includes(t))
        ) {
          return false
        }

        if (stats?.length) {
          for (const { stat, op, value } of stats) {
            if (
              !['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst'].includes(stat)
            )
              continue
            const pStat = (item.pokemon as any)[stat] as number
            if (op === '>' && !(pStat > value)) return false
            if (op === '>=' && !(pStat >= value)) return false
            if (op === '<' && !(pStat < value)) return false
            if (op === '<=' && !(pStat <= value)) return false
            if (op === '=' && !(pStat === value)) return false
          }
        }

        if (excludeNames?.length) {
          for (const ex of excludeNames) {
            if (pName.includes(ex) || pNameCn.includes(ex)) return false
          }
        }
      } catch {
        // Fallback to simple name search
        const sl = searchTerm.toLowerCase()
        if (!pName.includes(sl) && !pNameCn.includes(sl)) return false
      }

      return true
    })

    // Apply sorting
    if (sortBy === 'type-priority' && typePriority.length > 0) {
      result.sort((a, b) => {
        const typeA = a.pokemon.types[0]
        const typeB = b.pokemon.types[0]
        const priorityA = typePriority.indexOf(typeA)
        const priorityB = typePriority.indexOf(typeB)

        // Sort by type priority first
        if (priorityA !== priorityB) return priorityA - priorityB

        // Then by BST descending
        return b.pokemon.bst - a.pokemon.bst
      })
    } else {
      // Default: sort by BST descending
      result.sort((a, b) => b.pokemon.bst - a.pokemon.bst)
    }

    return result
  }, [pool, searchTerm, types, gens, hideIrrelevant, sortBy, typePriority])

  return {
    filtered,
    count: filtered.length,
    totalCount: pool.length,
  }
}
