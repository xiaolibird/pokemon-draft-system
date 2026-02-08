import * as fs from "fs";
import * as path from "path";

/**
 * 分析 formats-data.ts 中 isNonstandard 和 tier 的所有可能组合
 */

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "app/lib/data/pokemon/showdown-snapshot.json",
);

interface FormatEntry {
  id: string;
  isNonstandard: string | null;
  tier: string | null;
}

function extractObjects(
  content: string,
  depth: number,
): Array<{ key: string; content: string }> {
  const results: Array<{ key: string; content: string }> = [];
  let braceCount = 0;
  let currentKey = "";
  let currentContent = "";
  let inString = false;
  let stringChar = "";
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (!inString && char === "{" && (i === 0 || content[i - 1] !== "\\")) {
      braceCount++;
      if (braceCount === depth) {
        // Find the key before this brace
        let keyStart = i - 1;
        while (keyStart >= 0 && /\s/.test(content[keyStart])) keyStart--;
        const keyEnd = keyStart + 1;
        while (keyStart >= 0 && /[a-zA-Z0-9_$]/.test(content[keyStart]))
          keyStart--;
        currentKey = content.slice(keyStart + 1, keyEnd).trim();
      }
    }

    if (braceCount >= depth) {
      currentContent += char;
    }

    if (!inString && char === "}" && (i === 0 || content[i - 1] !== "\\")) {
      braceCount--;
      if (braceCount === depth - 1 && currentKey) {
        results.push({
          key: currentKey,
          content: currentContent.slice(0, -1), // Remove the closing brace
        });
        currentKey = "";
        currentContent = "";
      }
    }

    if (
      (char === '"' || char === "'") &&
      (i === 0 || content[i - 1] !== "\\")
    ) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    i++;
  }

  return results;
}

async function analyzeFormats() {
  try {
    console.log("📊 分析 formats-data.ts 中的 isNonstandard 和 tier 组合...\n");

    if (!fs.existsSync(SNAPSHOT_PATH)) {
      throw new Error(`Snapshot not found: ${SNAPSHOT_PATH}`);
    }

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8")) as {
      formats: { content: string };
    };

    const formatsContent = snapshot.formats.content;
    const entries: FormatEntry[] = [];

    // 解析所有格式条目
    for (const match of extractObjects(formatsContent, 2)) {
      const id = match.key.toLowerCase();
      const content = match.content;

      const isNonstandardMatch = content.match(
        /isNonstandard:\s*["']?([^"'\s,}]+)["']?/,
      );
      const tierMatch = content.match(/tier:\s*["']?([^"'\s,}]+)["']?/);

      entries.push({
        id,
        isNonstandard: isNonstandardMatch ? isNonstandardMatch[1] : null,
        tier: tierMatch ? tierMatch[1] : null,
      });
    }

    console.log(`✓ 解析了 ${entries.length} 个条目\n`);

    // 统计所有组合
    const combinations = new Map<string, string[]>();
    const isNonstandardValues = new Set<string | null>();
    const tierValues = new Set<string | null>();

    entries.forEach((e) => {
      isNonstandardValues.add(e.isNonstandard);
      tierValues.add(e.tier);

      const key = `isNonstandard:${e.isNonstandard ?? "null"} | tier:${e.tier ?? "null"}`;
      if (!combinations.has(key)) {
        combinations.set(key, []);
      }
      combinations.get(key)!.push(e.id);
    });

    // 按出现次数排序
    const sorted = Array.from(combinations.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    );

    console.log("=".repeat(80));
    console.log("所有可能的组合（按出现次数排序）：");
    console.log("=".repeat(80));
    console.log();

    sorted.forEach(([key, ids]) => {
      console.log(`${key}: ${ids.length} 个`);
      console.log(
        `  示例: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? "..." : ""}`,
      );
      console.log();
    });

    console.log("=".repeat(80));
    console.log("isNonstandard 的所有可能值：");
    console.log("=".repeat(80));
    Array.from(isNonstandardValues)
      .sort()
      .forEach((val) => {
        const count = entries.filter((e) => e.isNonstandard === val).length;
        console.log(`  ${val ?? "null"}: ${count} 个`);
      });

    console.log();
    console.log("=".repeat(80));
    console.log("tier 的所有可能值：");
    console.log("=".repeat(80));
    Array.from(tierValues)
      .sort()
      .forEach((val) => {
        const count = entries.filter((e) => e.tier === val).length;
        console.log(`  ${val ?? "null"}: ${count} 个`);
      });

    // 特别关注 Past + Illegal 的组合
    console.log();
    console.log("=".repeat(80));
    console.log("特别关注：isNonstandard: Past 的组合");
    console.log("=".repeat(80));
    const pastEntries = entries.filter((e) => e.isNonstandard === "Past");
    const pastTiers = new Map<string | null, number>();
    pastEntries.forEach((e) => {
      pastTiers.set(e.tier, (pastTiers.get(e.tier) || 0) + 1);
    });
    Array.from(pastTiers.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([tier, count]) => {
        console.log(`  tier: ${tier ?? "null"}: ${count} 个`);
      });

    console.log();
    console.log("=".repeat(80));
    console.log("特别关注：tier: Illegal 的组合");
    console.log("=".repeat(80));
    const illegalEntries = entries.filter((e) => e.tier === "Illegal");
    const illegalNonstandard = new Map<string | null, number>();
    illegalEntries.forEach((e) => {
      illegalNonstandard.set(
        e.isNonstandard,
        (illegalNonstandard.get(e.isNonstandard) || 0) + 1,
      );
    });
    Array.from(illegalNonstandard.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([isNonstandard, count]) => {
        console.log(`  isNonstandard: ${isNonstandard ?? "null"}: ${count} 个`);
      });
  } catch (error) {
    console.error("❌ Error analyzing formats:", error);
    process.exit(1);
  }
}

analyzeFormats();
