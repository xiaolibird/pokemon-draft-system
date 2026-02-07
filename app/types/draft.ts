// ----------------------------------------------------------------------
// Manual Type Definitions (Mirrors Prisma Schema)
// Solves IDE resolution issues with @prisma/client imports
// ----------------------------------------------------------------------

export interface Contest {
  id: string;
  name: string;
  status: string;
  ruleSet: string;
  playerTokens: number;
  maxPokemonPerPlayer: number;
  draftMode: string;
  auctionBasePrice: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceTiers: any;
  currentTurn: number;
  draftOrder: string[];
  auctionPhase: string | null;
  activePokemonId: string | null;
  auctionBidDuration: number | null;
  highestBid: number | null;
  highestBidderId: string | null;
  bidEndTime: Date | null;
  showPlayerPokemon: boolean;
  playerDisplayStyle: string;
  allowTradingDuringDraft: boolean;
  createdAt: Date;
  adminId: string;
  isPaused: boolean;
  pausedTimeRemaining: number | null;
  version: number;
}

export interface Player {
  id: string;
  contestId: string;
  username: string;
  accessKey: string;
  tokens: number;
  pickOrder: number | null;
  isReady: boolean;
  lastSeenAt: Date | null;
}

export interface Pokemon {
  id: string;
  num: number;
  name: string;
  nameCn: string | null;
  types: string[];
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  bst: number;
  gen: number;
  abilities: string[];
  heightm: number;
  weightkg: number;
  color: string;
  eggGroups: string[];
  isForme: boolean;
  baseSpecies: string | null;
  isNonstandard: string | null;
  tags: string[];
  tier: string | null;
}

export interface PokemonPool {
  id: string;
  contestId: string;
  pokemonId: string;
  basePrice: number;
  status: string;
}

export interface DraftAction {
  id: string;
  contestId: string;
  playerId: string | null;
  actionType: string;
  pokemonId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any;
  timestamp: Date;
}

// ----------------------------------------------------------------------

/** 选秀历史单条 */
export interface DraftHistoryItem {
  timestamp: string;
  actionType: string;
  details?: {
    actorUsername?: string;
    bidAmount?: number;
    pokemonName?: string;
    skippedUsername?: string;
  };
  player?: { username?: string };
}

/** 宝可梦池单项 (结合前端状态) */
export interface PoolItem extends PokemonPool {
  id: string;
  basePrice: number;
  pokemon: Pokemon;
  status: "AVAILABLE" | "PICKED" | "NOMINATED" | "IRRELEVANT";
}

export type PlayerWithRelations = Player & {
  _count?: {
    ownedPokemon: number;
  };
  ownedPokemon?: Partial<Pokemon>[];
};

/** 比赛实时状态数据结构 (useContestStream 返回) */
export interface ContestState {
  contest: Contest & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priceTiers?: any;
  };
  players: PlayerWithRelations[];
  pokemonPool: PoolItem[];
}
