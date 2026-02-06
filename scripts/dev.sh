#!/bin/bash
# ========================================
# 🎮 开发环境入口
# ========================================
# 用法: bash scripts/dev.sh [选项]
# 示例: bash scripts/dev.sh
#       bash scripts/dev.sh reset   # 重置数据库
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

# 加载 .env
[ -f .env ] && export $(grep -v '^#' .env | xargs)

exec bash "$SCRIPT_DIR/dev/dev.sh" "$@"
