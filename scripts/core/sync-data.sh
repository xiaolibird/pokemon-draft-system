#!/bin/bash

# 数据同步编排脚本
# 统一调用四个阶段的数据更新脚本（fetch → extract → import → translate）

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "\n${BLUE}📦 数据同步流程${NC}"

echo -e "\n${BLUE}[1/6] 数据库迁移...${NC}"
bash "$SCRIPT_DIR/migrate.sh"
echo -e "${GREEN}✓ 数据库迁移完成${NC}"

echo -e "\n${BLUE}[2/6] 生成 Prisma Client...${NC}"
npx prisma@6 generate
echo -e "${GREEN}✓ Prisma Client 已生成${NC}"

echo -e "\n${BLUE}[3/6] Stage 1: 拉取 Showdown 原始数据...${NC}"
npx tsx "$PROJECT_ROOT/scripts/core/data/fetch-showdown.ts"
echo -e "${GREEN}✓ Stage 1 完成${NC}"

# echo -e "\n${BLUE}[4/6] Stage 2: 提取规则数据 (Deprecated)...${NC}"
# npx tsx "$PROJECT_ROOT/scripts/core/data/extract-rulesets.deprecated.ts"
# echo -e "${GREEN}✓ Stage 2 Skipped${NC}"

echo -e "\n${BLUE}[5/6] Stage 3: 导入宝可梦数据...${NC}"
npx tsx "$PROJECT_ROOT/scripts/core/data/import-pokemon.ts"
echo -e "${GREEN}✓ Stage 3 完成${NC}"

echo -e "\n${BLUE}[6/6] Stage 4: 形态中文翻译...${NC}"
npx tsx "$PROJECT_ROOT/scripts/core/data/translate-forms.ts"
echo -e "${GREEN}✓ Stage 4 完成${NC}"

echo -e "\n${GREEN}✅ 数据同步完成${NC}"
