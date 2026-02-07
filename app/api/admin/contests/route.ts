import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { parsePSQuery } from "@/app/lib/utils/helpers";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminExists = await prisma.admin.findUnique({
      where: { id: payload.id as string },
    });
    if (!adminExists) {
      return NextResponse.json(
        { error: "管理员账户已失效，请重新登录" },
        { status: 401 },
      );
    }
    const body = await request.json();
    console.log(
      "[DEBUG] Received contest creation request:",
      JSON.stringify(body),
    );
    const {
      name,
      ruleSet,
      playerTokens,
      maxPokemonPerPlayer,
      draftMode,
      auctionBasePrice,
      auctionBidDuration,
      showPlayerPokemon,
      playerDisplayStyle,
      allowTradingDuringDraft,
      filters, // Filtering criteria
    } = body;

    if (!name || !ruleSet || !draftMode) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // 1. Create the Contest
    console.log("[DEBUG] 1. Creating contest record...");
    let contest;
    try {
      contest = await prisma.contest.create({
        data: {
          name,
          ruleSet,
          playerTokens: Number(playerTokens) || 100,
          maxPokemonPerPlayer: Number(maxPokemonPerPlayer) || 6,
          draftMode,
          auctionBasePrice: Number(auctionBasePrice) || 10,
          auctionBidDuration:
            auctionBidDuration === 0 || auctionBidDuration === "0"
              ? 0
              : Number(auctionBidDuration) || 30,
          showPlayerPokemon: showPlayerPokemon ?? true,
          playerDisplayStyle: playerDisplayStyle || "minimal",
          allowTradingDuringDraft: allowTradingDuringDraft ?? false,
          status: "PENDING",
          adminId: payload.id as string,
        } as any,
      });
      console.log("[DEBUG] Contest created successfully with ID:", contest.id);
    } catch (err: any) {
      console.error("[DEBUG] FAILED at Step 1 (Create Contest):", err.message);
      throw new Error(`Failed to create contest record: ${err.message}`);
    }

    // 2. Filter Pokemon based on criteria
    console.log("[DEBUG] 2. Filtering pokemon pool...");
    const {
      minHP,
      maxHP,
      minAtk,
      maxAtk,
      minDef,
      maxDef,
      minSpA,
      maxSpA,
      minSpD,
      maxSpD,
      minSpe,
      maxSpe,
      minBST,
      maxBST,
      types = [],
      excludeTypes = [],
      gens = [],
      typeMode = "AND",
      query,
    } = filters || {};

    const whereClause: any = {
      hp: { gte: Number(minHP) || 0, lte: Number(maxHP) || 255 },
      atk: { gte: Number(minAtk) || 0, lte: Number(maxAtk) || 255 },
      def: { gte: Number(minDef) || 0, lte: Number(maxDef) || 255 },
      spa: { gte: Number(minSpA) || 0, lte: Number(maxSpA) || 255 },
      spd: { gte: Number(minSpD) || 0, lte: Number(maxSpD) || 255 },
      spe: { gte: Number(minSpe) || 0, lte: Number(maxSpe) || 255 },
      bst: { gte: Number(minBST) || 0, lte: Number(maxBST) || 1000 },
    };

    const andClauses: any[] = [];

    // Parse PS Query if present
    if (query) {
      try {
        const psFilters = parsePSQuery(query);
        if (psFilters.name) {
          andClauses.push({
            OR: [
              { name: { contains: psFilters.name, mode: "insensitive" } },
              { nameCn: { contains: psFilters.name, mode: "insensitive" } },
              {
                id: {
                  contains: psFilters.name.toLowerCase(),
                  mode: "insensitive",
                },
              },
            ],
          });
        }
        // ... (existing logic continues)
        if (psFilters.types && psFilters.types.length > 0) {
          psFilters.types.forEach((t: string) => {
            andClauses.push({ types: { has: t } });
          });
        }
        if (psFilters.gens && psFilters.gens.length > 0) {
          andClauses.push({ gen: { in: psFilters.gens } });
        }
        if (psFilters.excludeGens && psFilters.excludeGens.length > 0) {
          andClauses.push({ gen: { notIn: psFilters.excludeGens } });
        }
        if (psFilters.excludeTypes && psFilters.excludeTypes.length > 0) {
          andClauses.push({
            NOT: { types: { hasSome: psFilters.excludeTypes } },
          });
        }
        if (psFilters.excludeNames && psFilters.excludeNames.length > 0) {
          psFilters.excludeNames.forEach((excludeName: string) => {
            andClauses.push({
              NOT: {
                OR: [
                  { name: { contains: excludeName, mode: "insensitive" } },
                  { nameCn: { contains: excludeName, mode: "insensitive" } },
                  { id: { contains: excludeName, mode: "insensitive" } },
                ],
              },
            });
          });
        }
        if (psFilters.stats && psFilters.stats.length > 0) {
          psFilters.stats.forEach(
            (condition: { stat: string; op: string; value: number }) => {
              const { stat, op, value } = condition;
              const prismaOp =
                op === ">"
                  ? "gt"
                  : op === ">="
                    ? "gte"
                    : op === "<"
                      ? "lt"
                      : op === "<="
                        ? "lte"
                        : "equals";
              if (
                ["hp", "atk", "def", "spa", "spd", "spe", "bst"].includes(stat)
              ) {
                andClauses.push({ [stat]: { [prismaOp]: value } });
              }
            },
          );
        }
      } catch (queryErr: any) {
        console.warn("[DEBUG] PS Query parsing failed:", queryErr.message);
      }
    }

    if (types.length > 0) {
      if (typeMode === "AND") {
        types.forEach((t: string) => andClauses.push({ types: { has: t } }));
      } else {
        andClauses.push({ types: { hasSome: types } });
      }
    }

    if (excludeTypes.length > 0) {
      andClauses.push({ NOT: { types: { hasSome: excludeTypes } } });
    }

    if (gens.length > 0) {
      whereClause.gen = { in: gens };
    }

    // RuleSet filters (New Logic: manual tag filtering instead of reg-x tags)
    if (ruleSet === "Regulation F" || ruleSet === "Reg F") {
      // Reg F: SV-Available, No Irrelevant, No Restricted, No Mythical
      andClauses.push({ tags: { has: "sv-available" } });
      andClauses.push({ NOT: { tags: { has: "irrelevant" } } });
      andClauses.push({ NOT: { tags: { has: "restricted" } } });
      andClauses.push({ NOT: { tags: { has: "mythical" } } });
    } else if (ruleSet === "Regulation G" || ruleSet === "Reg G") {
      // Reg G: SV-Available, No Irrelevant, (Allows Restricted), No Mythical
      andClauses.push({ tags: { has: "sv-available" } });
      andClauses.push({ NOT: { tags: { has: "irrelevant" } } });
      andClauses.push({ NOT: { tags: { has: "mythical" } } });
    } else if (ruleSet === "Regulation H" || ruleSet === "Reg H") {
      // Reg H: SV-Available, No Irrelevant, No Restricted, No Mythical, No Paradox, No Sub-Legendary
      andClauses.push({ tags: { has: "sv-available" } });
      andClauses.push({ NOT: { tags: { has: "irrelevant" } } });
      andClauses.push({ NOT: { tags: { has: "restricted" } } });
      andClauses.push({ NOT: { tags: { has: "mythical" } } });
      andClauses.push({ NOT: { tags: { has: "paradox" } } });
      andClauses.push({ NOT: { tags: { has: "sub-legendary" } } });
    } else if (ruleSet === "None") {
      // None 规则集：只包含朱紫所有可得的宝可梦（sv-available tag）
      // 排除收藏差异形态（irrelevant tag）和战斗中临时变化的形态（battleOnly 已在导入时排除）
      andClauses.push({ tags: { has: "sv-available" } });
      andClauses.push({ NOT: { tags: { has: "irrelevant" } } });
    } else if (ruleSet.includes("Gen 1-7")) {
      whereClause.num = { lt: 810 };
    } else if (ruleSet.includes("Gen 1-8")) {
      whereClause.num = { lt: 906 };
    }

    if (andClauses.length > 0) {
      whereClause.AND = andClauses;
    }

    let filteredPokemon;
    try {
      filteredPokemon = await prisma.pokemon.findMany({
        where: whereClause,
        orderBy: [{ bst: "desc" }, { gen: "desc" }, { num: "asc" }],
      });
      console.log(
        `[DEBUG] Found ${filteredPokemon.length} pokemon for the pool`,
      );
    } catch (findErr: any) {
      console.error(
        "[DEBUG] FAILED at Step 2 (Find Pokemon):",
        findErr.message,
      );
      throw new Error(`Failed to filter pokemon: ${findErr.message}`);
    }

    // 3. Create PokemonPool entries（底价绝不为 0，使用比赛统一底价或默认 10）
    const defaultBasePrice = Math.max(1, Number(auctionBasePrice) || 10);
    console.log("[DEBUG] 3. Creating pool entries...");
    const poolEntries = filteredPokemon.map((p) => ({
      id: crypto.randomUUID(),
      contestId: contest.id,
      pokemonId: p.id,
      basePrice: defaultBasePrice,
      status: "AVAILABLE",
    }));

    if (poolEntries.length > 0) {
      try {
        // Batch size to avoid parameter limits if somehow we have huge pools
        await prisma.pokemonPool.createMany({
          data: poolEntries,
        });
        console.log("[DEBUG] Pool entries created successfully");
      } catch (poolErr: any) {
        console.error(
          "[DEBUG] FAILED at Step 3 (Create Pool):",
          poolErr.message,
        );
        throw new Error(`Failed to populate pool: ${poolErr.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      contestId: contest.id,
      poolSize: poolEntries.length,
    });
  } catch (error: any) {
    console.error("!!! CONTEST CREATION ERROR !!!");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    console.error("Full Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 },
    );
  }
}
