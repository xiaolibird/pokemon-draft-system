import { BattlePokemonIconIndexes } from '../data/icon-indexes'

export function getPokemonSprite(id: string) {
  // Use pixel art sprites (gen5 style) for larger views
  const cleanId = id
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return `https://play.pokemonshowdown.com/sprites/gen5/${cleanId}.png`
}

// Helper to get Generation from Dex Number
// Helper to get Generation from Dex Number or Suffixes
export function getGeneration(num: number, id?: string): number {
  const cleanId = id?.toLowerCase() || ''
  if (cleanId.includes('-paldea')) return 9
  if (cleanId.includes('-hisui')) return 8
  if (cleanId.includes('-galar')) return 8
  if (cleanId.includes('-alola')) return 7

  if (num <= 151) return 1
  if (num <= 251) return 2
  if (num <= 386) return 3
  if (num <= 493) return 4
  if (num <= 649) return 5
  if (num <= 721) return 6
  if (num <= 809) return 7
  if (num <= 905) return 8
  return 9
}

export function getPokemonStaticIcon(
  num: number | string,
  id?: string,
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md',
) {
  const cleanId = (id || (typeof num === 'string' ? num : ''))
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '') // Strictly alphanumeric to match Showdown keys

  // Check if we have a specific mapping for this ID (forms like Mega, Gmax, etc)
  if (BattlePokemonIconIndexes[cleanId] !== undefined) {
    return getPokemonIconStyle(BattlePokemonIconIndexes[cleanId], size)
  }

  // Fallback to national dex number if available
  if (typeof num === 'number') {
    return getPokemonIconStyle(num, size)
  }

  // Legacy/Individual file fallback
  return `https://play.pokemonshowdown.com/sprites/gen5/${cleanId}.png`
}

/**
 * Calculate sprite sheet background position for a Pokemon icon
 * Icons are 40x30px (base), arranged in a grid (12 icons per row)
 * Size variants: 'xs' (24x18, 0.6x), 'sm' (32x24, 0.8x), 'md' (40x30, 1x), 'lg' (60x45, 1.5x), 'xl' (80x60, 2x)
 */
export function getPokemonIconStyle(
  num: number,
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md',
): { backgroundPosition: string } {
  const ICON_WIDTH = 40
  const ICON_HEIGHT = 30
  const ICONS_PER_ROW = 12

  // Calculate position in grid
  const col = num % ICONS_PER_ROW
  const row = Math.floor(num / ICONS_PER_ROW)

  // Determine scale factor
  let scale = 1
  if (size === 'xs') scale = 0.6
  else if (size === 'sm') scale = 0.8
  else if (size === 'lg') scale = 1.5
  else if (size === 'xl') scale = 2.0

  // Calculate pixel offsets
  // We must scale the negative offset by the same factor used for background-size
  const xOffset = -col * ICON_WIDTH * scale
  const yOffset = -row * ICON_HEIGHT * scale

  return {
    backgroundPosition: `${xOffset}px ${yOffset}px`,
  }
}

/**
 * Parses a Pokemon Showdown style search query string into a structured filter object.
 * Query format examples: "type:Fire, atk>100, hp<150, bst=500, charizard, gen:9"
 *
 * FIXED: Now supports range queries like "hp>100, hp<150" without overwriting
 */
export function parsePSQuery(query: string) {
  const parts = query
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const filters: any = {
    name: '',
    types: [] as string[],
    excludeTypes: [] as string[],
    gens: [] as number[],
    excludeGens: [] as number[],
    excludeNames: [] as string[],
    stats: [] as Array<{ stat: string; op: string; value: number }>, // Changed to array to support multiple conditions
  }

  for (const part of parts) {
    // Handle negation (!)
    let isNegated = false
    let cleanPart = part
    if (cleanPart.startsWith('!')) {
      isNegated = true
      cleanPart = cleanPart.substring(1)
    } else if (cleanPart.toLowerCase().startsWith('not ')) {
      isNegated = true
      cleanPart = cleanPart.substring(4)
    }

    if (cleanPart.includes(':')) {
      const [key, val] = cleanPart.split(':').map((s) => s.trim().toLowerCase())

      if (key === 'type') {
        const typeName = val.charAt(0).toUpperCase() + val.slice(1)
        if (isNegated) {
          filters.excludeTypes.push(typeName)
        } else {
          filters.types.push(typeName)
        }
      } else if (key === 'gen' || key === 'generation') {
        const gen = parseInt(val)
        if (!isNaN(gen)) {
          if (isNegated) {
            filters.excludeGens.push(gen)
          } else {
            filters.gens.push(gen)
          }
        }
      }
    } else if (cleanPart.match(/[><=]/)) {
      // Stat comparison (supports multiple conditions on same stat)
      const match = cleanPart.match(/([a-z]+)\s*([><=]+)\s*(\d+)/i)
      if (match) {
        const [, stat, op, val] = match
        filters.stats.push({
          stat: stat.toLowerCase(),
          op,
          value: parseInt(val),
        })
      }
    } else {
      // Name search - now supports negation
      if (isNegated) {
        filters.excludeNames.push(cleanPart.toLowerCase())
      } else {
        // Only set name if not already set (first non-negated name wins)
        if (!filters.name) {
          filters.name = cleanPart
        }
      }
    }
  }
  return filters
}
