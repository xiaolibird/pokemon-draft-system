#!/bin/bash
# ========================================
# 🚀 生产环境入口
# ========================================
# 用法: bash scripts/prod.sh [选项]
# 从本机部署到 VPS: bash scripts/prod.sh
# 直接传参:          bash scripts/prod.sh sync|hot|full|data|nuke|status|logs|env|prereq
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

exec bash "$SCRIPT_DIR/prod/deploy.sh" "$@"
