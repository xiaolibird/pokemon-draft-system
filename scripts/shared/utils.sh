#!/bin/bash
# 共享工具函数 - 供 dev/prod 脚本 source
# 用法: source "$(dirname "$0")/../shared/utils.sh"

# 颜色
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export NC='\033[0m'

# 路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(dirname "$SCRIPT_DIR")"
export PROJECT_ROOT="$(dirname "$SCRIPTS_ROOT")"

ensure_cd_project() {
    cd "$PROJECT_ROOT"
}
