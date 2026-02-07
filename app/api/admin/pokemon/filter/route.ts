import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db/prisma";
import { verifyToken } from "@/app/lib/auth/jwt";
import { cookies } from "next/headers";
import { parsePSQuery } from "@/app/lib/utils/helpers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { stats, types, gens, ruleSet, query } = body;

    // stats: { hp: [min, max], ... }
    // types: { mode: 'AND' | 'OR', include: [], exclude: [] }
    // gens: number[] (List of included generations)
    // ruleSet: string

    const where: any = {};
    const andClauses: any[] = [];

    // Parse PS Query if present
    if (query) {
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
        // Exclude specific pokemon names
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
        // Now stats is an array, supports multiple conditions on same stat
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
    }

    // Stat filters (GUI)
    if (stats) {
      const statKeys = ["hp", "atk", "def", "spa", "spd", "spe", "bst"];
      statKeys.forEach((key) => {
        if (stats[key]) {
          where[key] = {
            gte: stats[key][0],
            lte: stats[key][1],
          };
        }
      });
    }

    // Type filters
    if (types) {
      if (types.include && types.include.length > 0) {
        if (types.mode === "AND") {
          types.include.forEach((t: string) => {
            andClauses.push({ types: { has: t } });
          });
        } else {
          andClauses.push({ types: { hasSome: types.include } });
        }
      }

      if (types.exclude && types.exclude.length > 0) {
        andClauses.push({ NOT: { types: { hasSome: types.exclude } } });
      }
    }

    // Gen filters
    if (gens && gens.length > 0) {
      where.gen = { in: gens };
    }

    // RuleSet filters (Explicit Tag Logic)
    if (ruleSet) {
      if (ruleSet === "Regulation F" || ruleSet === "Reg F") {
        // Reg F: SV-Available, No Irrelevant, No Restricted, No Mythical
        andClauses.push({ tags: { has: "sv-available" } });
        andClauses.push({
          NOT: {
            tags: { hasSome: ["restricted", "mythical", "irrelevant"] },
          },
        });
      } else if (ruleSet === "Regulation G" || ruleSet === "Reg G") {
        // Reg G: SV-Available, No Irrelevant, (Allows Restricted), No Mythical
        andClauses.push({ tags: { has: "sv-available" } });
        andClauses.push({
          NOT: {
            tags: { hasSome: ["mythical", "irrelevant"] },
          },
        });
      } else if (ruleSet === "Regulation H" || ruleSet === "Reg H") {
        // Reg H: SV-Available, No Irrelevant, No Restricted, No Mythical, No Paradox, No Sub-Legendary
        andClauses.push({ tags: { has: "sv-available" } });
        andClauses.push({
          NOT: {
            tags: {
              hasSome: [
                "restricted",
                "mythical",
                "sub-legendary",
                "paradox",
                "irrelevant",
              ],
            },
          },
        });
      } else if (ruleSet === "None") {
        // None: SV-Available, No Irrelevant
        andClauses.push({ tags: { has: "sv-available" } });
        andClauses.push({ NOT: { tags: { has: "irrelevant" } } });
      }
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const pokemon = await prisma.pokemon.findMany({
      where,
      orderBy: [
        { bst: "desc" }, // Sort by BST descending
        { gen: "desc" }, // Then by generation descending (9 to 1)
        { num: "asc" }, // Finally by dex number ascending
      ],
    });

    return NextResponse.json(pokemon);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
