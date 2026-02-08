/**
 * 数据脱敏工具
 * 用于移除响应中的敏感信息
 */

import type { Player, Contest, PlayerWithRelations } from "@/app/types/draft";

/**
 * 选手信息脱敏（返回给前端）
 * 移除敏感字段如 accessKey
 */
export function sanitizePlayer(player: Partial<Player>): SanitizedPlayer {
  return {
    id: player.id ?? "",
    username: player.username ?? "",
    tokens: player.tokens ?? 0,
    // 移除敏感字段
    // accessKey: undefined,
    // password: undefined,
  };
}

/**
 * 选手详情脱敏（包含更多公开信息）
 */
export function sanitizePlayerWithRelations(
  player: PlayerWithRelations,
): SanitizedPlayerWithRelations {
  return {
    id: player.id,
    username: player.username,
    tokens: player.tokens,
    _count: player._count ?? { ownedPokemon: 0 },
    // 移除敏感字段
    accessKey: undefined as any,
  };
}

/**
 * 选手拥有的宝可梦脱敏
 */
export function sanitizeOwnedPokemon(ownedPokemon: any[]): any[] {
  return ownedPokemon.map((op) => ({
    id: op.id,
    pokemonId: op.pokemonId,
    contestId: op.contestId,
    // 移除可能存在的敏感字段
  }));
}

/**
 * 比赛信息脱敏（选手视角）
 * 移除管理员相关敏感字段
 */
export function sanitizeContestForPlayer(
  contest: Partial<Contest>,
): SanitizedContest {
  return {
    id: contest.id ?? "",
    name: contest.name ?? "",
    status: contest.status ?? "",
    draftMode: contest.draftMode ?? "",
    auctionPhase: contest.auctionPhase ?? null,
    currentTurn: contest.currentTurn ?? 0,
    bidEndTime: contest.bidEndTime ?? null,
    highestBid: contest.highestBid ?? null,
    highestBidderId: contest.highestBidderId ?? null,
    activePokemonId: contest.activePokemonId ?? null,
    playerTokens: contest.playerTokens ?? 0,
    maxPokemonPerPlayer: contest.maxPokemonPerPlayer ?? 0,
    // 移除管理员相关敏感字段
    // adminId: undefined,
  };
}

/**
 * 比赛信息脱敏（公开视角）
 * 移除所有敏感信息，只保留公开数据
 */
export function sanitizeContestPublic(
  contest: Partial<Contest>,
): SanitizedPublicContest {
  return {
    id: contest.id ?? "",
    name: contest.name ?? "",
    status: contest.status ?? "",
    draftMode: contest.draftMode ?? "",
    auctionPhase: contest.auctionPhase ?? null,
    currentTurn: contest.currentTurn ?? 0,
    // 移除所有敏感信息
  };
}

/**
 * API 响应脱敏包装器
 */
export function sanitizeResponse<T extends Record<string, any>>(
  data: T,
  sanitizeFn: (data: T) => any,
): any {
  return sanitizeFn(data);
}

// 类型定义
export interface SanitizedPlayer {
  id: string;
  username: string;
  tokens: number;
  accessKey?: undefined;
}

export interface SanitizedPlayerWithRelations {
  id: string;
  username: string;
  tokens: number;
  _count: { ownedPokemon: number };
  accessKey?: undefined;
}

export interface SanitizedContest {
  id: string;
  name: string;
  status: string;
  draftMode: string;
  auctionPhase: string | null;
  currentTurn: number;
  bidEndTime?: Date | string | null;
  highestBid?: number | null;
  highestBidderId?: string | null;
  activePokemonId?: string | null;
  playerTokens: number;
  maxPokemonPerPlayer: number;
}

export interface SanitizedPublicContest {
  id: string;
  name: string;
  status: string;
  draftMode: string;
  auctionPhase: string | null;
  currentTurn: number;
}
