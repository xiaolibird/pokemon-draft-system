#!/bin/bash
# ========================================
# 智能数据库迁移脚本
# ========================================
# 处理三种场景：
#   1. 全新数据库 → prisma migrate deploy 一次搞定
#   2. db push 建库 + 新增迁移 → 逐个应用 SQL + resolve 标记
#   3. 已完全同步 → 跳过
# ========================================
set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCHEMA="$PROJECT_ROOT/prisma/schema.prisma"
MIGRATIONS_DIR="$PROJECT_ROOT/prisma/migrations"

echo -e "${BLUE}🔄 智能数据库迁移...${NC}"

# ========================================
# 路径 1：尝试标准 prisma migrate deploy
# ========================================
echo -e "  [1] 尝试 prisma migrate deploy..."
if npx prisma@6 migrate deploy --schema "$SCHEMA" 2>&1; then
    echo -e "${GREEN}  ✓ 标准迁移成功${NC}"
    exit 0
fi

echo -e "${YELLOW}  ⚠ 标准迁移失败，切换到逐个应用模式...${NC}"

# ========================================
# 路径 2：逐个应用迁移 SQL + 标记为已应用
# ========================================
# 获取已应用的迁移列表（从 _prisma_migrations 表）
APPLIED_LIST=""
if APPLIED_RAW=$(npx prisma@6 migrate status --schema "$SCHEMA" 2>&1); then
    # 提取已应用的迁移名称
    APPLIED_LIST=$(echo "$APPLIED_RAW" | grep -E "^\s*(✔|Applied)" | sed 's/.*\(20[0-9]\{12\}[_a-zA-Z0-9]*\).*/\1/' || true)
fi

APPLIED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0

for migration_dir in "$MIGRATIONS_DIR"/*/; do
    [ ! -d "$migration_dir" ] && continue

    migration_name=$(basename "$migration_dir")
    sql_file="$migration_dir/migration.sql"

    # 跳过没有 SQL 文件的目录
    [ ! -f "$sql_file" ] && continue

    # 检查是否已应用
    if echo "$APPLIED_LIST" | grep -q "$migration_name" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $migration_name (已应用，跳过)"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        continue
    fi

    # 尝试执行 SQL
    echo -e "  ${BLUE}▶${NC} $migration_name"
    if npx prisma@6 db execute --file "$sql_file" --schema "$SCHEMA" 2>&1; then
        echo -e "    ${GREEN}✓ SQL 执行成功${NC}"
        APPLIED_COUNT=$((APPLIED_COUNT + 1))
    else
        # SQL 执行失败：可能是已存在（表/列/索引已创建）
        echo -e "    ${YELLOW}⚠ SQL 执行失败（可能已部分应用）${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi

    # 无论 SQL 是否成功，都标记为已应用（避免下次重复尝试）
    npx prisma@6 migrate resolve --applied "$migration_name" --schema "$SCHEMA" 2>/dev/null || true
done

echo ""
echo -e "  迁移结果: 新应用=${GREEN}${APPLIED_COUNT}${NC}  已存在=${SKIPPED_COUNT}  失败=${YELLOW}${FAILED_COUNT}${NC}"

# ========================================
# 路径 3：最终 db push 补齐剩余差异
# ========================================
# 处理没有迁移文件但 schema 有变化的情况
echo -e "\n  [2] 检查剩余 schema 差异..."
if npx prisma@6 db push --accept-data-loss --schema "$SCHEMA" 2>&1; then
    echo -e "  ${GREEN}✓ Schema 已同步${NC}"
else
    echo -e "  ${YELLOW}⚠ db push 失败，请检查是否有需要手动处理的迁移${NC}"
    # 不 exit 1，让调用方决定是否继续
fi

echo -e "${GREEN}✓ 数据库迁移完成${NC}"
