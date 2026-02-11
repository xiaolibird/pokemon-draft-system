#!/bin/bash
# ========================================
# 🚀 生产环境 - VPS 本地部署
# ========================================
# 场景：在 VPS 上 git clone 后直接运行，无需从本机 SSH
# 用法: bash scripts/prod/local.sh [--auto]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUTO_FLAG=""
[[ "$*" == *"--auto"* ]] && AUTO_FLAG="--auto"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$PROJECT_ROOT"

DOCKER_COMPOSE=""
docker compose version &>/dev/null && DOCKER_COMPOSE="docker compose" || DOCKER_COMPOSE="docker-compose"

echo -e "${BLUE}========================================"
echo "    Pokemon Draft System - VPS 本地部署"
echo -e "========================================${NC}\n"

# 1. 环境检查
echo -e "${BLUE}[1/5] 检查系统环境...${NC}"
if ! command -v curl &>/dev/null; then
    echo -e "${YELLOW}安装 curl...${NC}"
    if command -v apt-get &>/dev/null; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl
    elif command -v dnf &>/dev/null; then sudo dnf install -y curl
    elif command -v yum &>/dev/null; then sudo yum install -y curl
    else echo -e "${RED}请手动安装 curl${NC}"; exit 1
    fi
fi

SWAP_SIZE=$(free -m | awk '/^Swap:/{print $2}' || echo "0")
if [ "${SWAP_SIZE:-0}" -lt 1000 ] 2>/dev/null; then
    echo -e "${YELLOW}创建临时 Swap...${NC}"
    sudo fallocate -l 2G /swapfile_temp 2>/dev/null || sudo dd if=/dev/zero of=/swapfile_temp bs=1M count=2048 2>/dev/null
    sudo chmod 600 /swapfile_temp && sudo mkswap /swapfile_temp && sudo swapon /swapfile_temp
fi

if ! command -v docker &>/dev/null; then
    echo -e "${YELLOW}安装 Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable --now docker 2>/dev/null || true
fi
echo -e "${GREEN}✓ 环境就绪${NC}\n"

# 2. 生成配置
echo -e "${BLUE}[2/5] 生成环境配置...${NC}"
bash "$PROJECT_ROOT/scripts/setup_env.sh" $AUTO_FLAG --vps
echo -e "${GREEN}✓ 配置完成${NC}\n"

# 3. 启动数据库
echo -e "${BLUE}[3/5] 启动数据库...${NC}"
sudo $DOCKER_COMPOSE -f docker-compose.prod.yml up -d db
sleep 5
echo -e "${GREEN}✓ 数据库已启动${NC}\n"

# 4. 初始化数据
echo -e "${BLUE}[4/5] 初始化数据...${NC}"
sudo -E $DOCKER_COMPOSE -f docker-compose.prod.yml run --rm --entrypoint /bin/sh init -c '
set -e
bash scripts/core/sync-data.sh
npx tsx scripts/core/admin/ensure-admin.ts
'
echo -e "${GREEN}✓ 数据初始化完成${NC}\n"

# 5. 启动服务
echo -e "${BLUE}[5/5] 启动应用...${NC}"
export CACHE_BUST=$(date +%s)
sudo -E $DOCKER_COMPOSE -f docker-compose.prod.yml build --no-cache app
sudo -E $DOCKER_COMPOSE -f docker-compose.prod.yml up -d --force-recreate --remove-orphans app nginx
sudo docker image prune -f 2>/dev/null || true
echo -e "${GREEN}✓ 服务已启动${NC}\n"

echo -e "${GREEN}========================================"
echo "         🚀 部署完成"
echo -e "========================================${NC}"
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")
echo "管理员: http://${PUBLIC_IP}:8080/admin/login"
echo "选手:   http://${PUBLIC_IP}:8080/player/login"
