#!/bin/bash
# ========================================
# 🚀 Pokemon Draft System - VPS 部署一键脚本
# ========================================
# 用途：从本地 macOS 部署到云端 VPS 的统一入口
# ========================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/utils.sh"
ensure_cd_project

echo -e "${MAGENTA}"
echo "╔════════════════════════════════════════════════╗"
echo "║   🚀 Pokemon Draft System - VPS 部署           ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# ========================================
# 配置加载
# ========================================
CONFIG_FILE="${PROJECT_ROOT}/.vps_config"
DEST_DIR="~/pokemon-draft-system"

load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        echo -e "${BLUE}📋 加载配置文件: .vps_config${NC}"
        source "$CONFIG_FILE"
    fi
    
    # 交互式补全配置
    if [ -z "${SERVER_IP:-}" ]; then
        read -p "请输入 VPS 公网 IP: " SERVER_IP
    fi
    [ -z "$SERVER_IP" ] && { echo -e "${RED}IP 不能为空${NC}"; exit 1; }
    
    if [ -z "${SERVER_USER:-}" ]; then
        read -p "请输入 VPS 用户名 (默认: ubuntu): " INPUT_USER
        SERVER_USER=${INPUT_USER:-ubuntu}
    fi
    
    if [ -z "${SSH_KEY_PATH:-}" ]; then
        read -p "SSH 私钥路径 (留空使用默认): " SSH_KEY_PATH
    fi
    
    # 构建 SSH 参数
    SSH_OPTS="-p 22 -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
    [ -n "$SSH_KEY_PATH" ] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY_PATH"
    
    echo -e "${GREEN}✓ 配置加载完成${NC}"
    echo "   服务器: ${SERVER_USER}@${SERVER_IP}"
    
    # 检查是否有管理员配置
    if [ -n "${ADMIN_USERNAME}" ]; then
        export ADMIN_USERNAME
        export ADMIN_PASSWORD
        echo -e "${GREEN}✓ 检测到管理员配置: ${ADMIN_USERNAME} (密码已隐藏)${NC}"
    else
        echo -e "${YELLOW}⚠ 未检测到 ADMIN_USERNAME，将跳过管理员重置${NC}"
    fi
}

# ========================================
# VPS 环境预检 (Docker + Swap)
# ========================================
# 用途：首次部署或裸机 VPS 时，确保 Docker 已安装、低内存时创建 Swap
ensure_vps_prereqs() {
    echo -e "\n${BLUE}🔍 VPS 环境预检 (Docker / Swap)...${NC}"
    
    # 预检为系统级操作，不依赖项目目录（支持裸机首次部署）
    ssh $SSH_OPTS -t "$SERVER_USER@$SERVER_IP" 'bash -s' << 'REMOTE_PREREQ'
set -e
# 1. Swap：低内存 VPS 创建临时 2GB Swap 以加速构建
SWAP_SIZE=$(free -m | awk '/^Swap:/{print $2}' || echo "0")
SWAP_SIZE=${SWAP_SIZE:-0}
if [ "$SWAP_SIZE" -lt 1000 ] 2>/dev/null; then
    echo ">>> Swap 不足 1GB，创建 2GB 临时 Swap..."
    sudo fallocate -l 2G /swapfile_temp 2>/dev/null || sudo dd if=/dev/zero of=/swapfile_temp bs=1M count=2048 status=none
    sudo chmod 600 /swapfile_temp
    sudo mkswap /swapfile_temp
    sudo swapon /swapfile_temp
    echo "✓ 临时 Swap 已开启"
else
    echo "✓ Swap 已充足 ($(free -h | awk '/^Swap:/{print $2}'))"
fi

# 2. Docker：未安装则自动安装
if ! command -v docker &>/dev/null; then
    echo ">>> 未检测到 Docker，正在自动安装..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable --now docker 2>/dev/null || true
    echo "✓ Docker 安装完成"
else
    echo "✓ Docker 已安装 ($(docker --version))"
fi
REMOTE_PREREQ
    
    echo -e "${GREEN}✓ 环境预检完成${NC}"
}

# ========================================
# 连接测试
# ========================================
test_connection() {
    echo -e "\n${BLUE}🔗 测试 SSH 连接...${NC}"
    if ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "echo 'OK'" &>/dev/null; then
        echo -e "${GREEN}✓ 连接成功${NC}"
        return 0
    else
        echo -e "${RED}❌ 连接失败${NC}"
        echo "请检查: IP地址、用户名、SSH密钥"
        exit 1
    fi
}

# ========================================
# 文件同步
# ========================================
sync_files() {
    echo -e "\n${BLUE}📤 同步文件到 VPS...${NC}"
    
    # 检查 rsync
    if ! command -v rsync &>/dev/null; then
        echo -e "${RED}❌ 本地未安装 rsync${NC}"
        echo "请运行: brew install rsync"
        exit 1
    fi
    
    # 检查远程 rsync（兼容 Ubuntu/Debian/CentOS/Fedora 等）
    if ! ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "command -v rsync" &>/dev/null; then
        echo -e "${YELLOW}远程服务器安装 rsync...${NC}"
        ssh $SSH_OPTS -t "$SERVER_USER@$SERVER_IP" 'bash -s' << 'INSTALL_RSYNC'
        if command -v apt-get &>/dev/null; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y rsync
        elif command -v yum &>/dev/null; then
            sudo yum install -y rsync
        elif command -v zypper &>/dev/null; then
            sudo zypper -n install rsync
        else
            echo "错误: 未检测到支持的包管理器 (apt/dnf/yum/zypper)，请手动安装 rsync"
            exit 1
        fi
INSTALL_RSYNC
    fi
    
    # 会同步的内容（含 Docker / Nginx / HTTP 缓存相关）：
    #   Docker: Dockerfile, docker-compose.prod.yml, .dockerignore
    #   Nginx:  nginx/conf.d/default.conf 等
    #   HTTP 缓存: next.config.ts (Cache-Control 头), app/layout.tsx (meta), nginx 中的 Cache-Control
    # 不同步：本地配置 .vps_config/.env、构建产物 .next、依赖 node_modules、*.md 等（见下方 exclude）
    echo "开始同步 (Docker/Nginx/HTTP缓存相关会同步；排除: node_modules, .git, .next, 本地配置等)..."
    rsync -avz --progress --delete \
        --exclude-from="${PROJECT_ROOT}/.gitignore" \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude '.next' \
        --exclude '*.md' \
        --exclude '.vps_config' \
        --exclude '.env' \
        --exclude '.env.*' \
        --exclude '*.local' \
        -e "ssh $SSH_OPTS" \
        "$PROJECT_ROOT/" \
        "$SERVER_USER@$SERVER_IP:$DEST_DIR"
    
    echo -e "${GREEN}✓ 文件同步完成${NC}"
}

# ========================================
# 远程执行命令
# ========================================
remote_exec() {
    local CMD="$1"
    local DESC="${2:-执行命令}"
    
    echo -e "\n${BLUE}🔧 $DESC...${NC}"
    ssh $SSH_OPTS -t "$SERVER_USER@$SERVER_IP" "cd $DEST_DIR && $CMD"
}

# ========================================
# 部署操作
# ========================================

# 热重载（仅重启应用）- 智能构建版本
hot_reload() {
    echo -e "\n${CYAN}🔥 热重载部署 (仅重建应用容器)${NC}"
    
    # 生成构建版本号（Git hash + 时间戳）
    local BUILD_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    
    # 根据智能检测决定构建参数
    local BUILD_OPTS=""
    if [ "${BUILD_STRATEGY:-normal}" = "no-cache" ]; then
        echo -e "${YELLOW}🔧 使用完全重建模式 (--no-cache)${NC}"
        BUILD_OPTS="--no-cache"
    else
        echo -e "${GREEN}🚀 使用快速构建模式 (保留依赖缓存)${NC}"
        BUILD_OPTS=""
    fi
    
    local CMD="
        export CACHE_BUST=\$(date +%s)
        export BUILD_VERSION='${BUILD_VERSION}'
        export BUILD_TIME='${BUILD_TIME}'
        
        echo '>>> 构建版本: ${BUILD_VERSION}'
        echo '>>> 构建时间: ${BUILD_TIME}'
        echo '>>> 构建策略: ${BUILD_STRATEGY:-normal}'
        
        echo '>>> 重建应用容器...'
        sudo -E docker compose -f docker-compose.prod.yml build ${BUILD_OPTS} \
            --build-arg BUILD_VERSION=\"\${BUILD_VERSION}\" \
            --build-arg BUILD_TIME=\"\${BUILD_TIME}\" \
            app
        
        echo '>>> 重启应用...'
        sudo docker compose -f docker-compose.prod.yml up -d --force-recreate app
        
        echo '>>> 重启 Nginx...'
        sudo docker compose -f docker-compose.prod.yml restart nginx
        
        echo '>>> 清理旧镜像...'
        sudo docker image prune -f
        
        echo '>>> 健康检查...'
        sleep 5
        
        # 检查健康端点
        HEALTH_CHECK=\$(curl -sf http://localhost:8080/api/health)
        if [ \$? -eq 0 ]; then
            echo '✓ 服务正常运行'
            echo \"\$HEALTH_CHECK\" | grep -q '\"status\":\"healthy\"' && echo '  数据库连接正常' || echo '  ⚠ 服务降级'
        else
            echo '⚠ 服务可能未就绪，请检查日志'
        fi
    "
    
    remote_exec "$CMD" "热重载"
    echo -e "\n${GREEN}✓ 热重载完成${NC}"
    echo -e "   版本: ${CYAN}${BUILD_VERSION}${NC}"
}

# 数据同步（更新宝可梦数据）
data_sync() {
    echo -e "\n${CYAN}📊 数据同步 (更新数据库和宝可梦)${NC}"
    
    local CMD="
        export CACHE_BUST=\$(date +%s)
        
        echo '>>> 重建初始化容器...'
        sudo -E docker compose -f docker-compose.prod.yml build --no-cache init
        
        echo '>>> 执行数据同步...'
        sudo -E docker compose -f docker-compose.prod.yml run --rm --entrypoint /bin/sh init -c '
            set -e
            echo \"[1/6] 应用数据库迁移...\"
            # 尝试应用迁移，如果失败则推送架构（适用于现有数据库）
            npx prisma@6 migrate deploy 2>/dev/null || {
                echo \"  ⚠ 迁移失败，使用 db push 同步架构（适用于现有数据库）\"
                npx prisma@6 db push --accept-data-loss
            }
            
            echo \"[2/6] 生成 Prisma Client...\"
            npx prisma@6 generate
            
            echo \"[3/6] 执行数据同步流程...\"
            bash scripts/core/sync-data.sh
            
            echo \"[4/6] 确保管理员账号...\"
            export ADMIN_USERNAME='${ADMIN_USERNAME}'
            export ADMIN_PASSWORD='${ADMIN_PASSWORD}'
            npx tsx scripts/core/admin/ensure-admin.ts
            
            echo \"[6/6] 验证健康状态...\"
            curl -sf http://localhost:3000/api/health > /dev/null && echo \"✓ Health check passed\" || echo \"⚠ Health check unavailable\"
        '
    "
    
    remote_exec "$CMD" "数据同步"
    echo -e "\n${GREEN}✓ 数据同步完成${NC}"
}

# 完整部署（数据 + 应用）- 智能路由
full_deploy() {
    echo -e "\n${CYAN}🚀 完整部署 (数据同步 + 应用重启)${NC}"
    
    # 根据智能检测优化部署流程
    if [ "${BUILD_STRATEGY:-normal}" = "data-only" ]; then
        echo -e "${GREEN}✓ 检测到仅数据变更，跳过应用重建${NC}"
        data_sync
    else
        data_sync
        hot_reload
    fi
    
    echo -e "\n${GREEN}╔════════════════════════════════════════════════╗"
    echo "║   ✅ 完整部署成功！                             ║"
    echo "╚════════════════════════════════════════════════╝${NC}"
    echo -e "访问地址: ${CYAN}http://${SERVER_IP}:8080${NC}"
}

# 核弹重置
nuclear_reset() {
    echo -e "\n${RED}"
    echo "╔════════════════════════════════════════════════╗"
    echo "║   ⚠️  核弹级重置 - 数据将被清空！              ║"
    echo "╚════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    read -p "确认执行? 输入 'RESET' 继续: " CONFIRM
    [ "$CONFIRM" != "RESET" ] && { echo "已取消"; return; }
    
    ensure_vps_prereqs
    
    local BUILD_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local BUILD_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    
    local CMD="
        export CACHE_BUST=\$(date +%s)
        export BUILD_VERSION='${BUILD_VERSION}'
        export BUILD_TIME='${BUILD_TIME}'
        
        echo '>>> 停止所有服务并删除数据卷...'
        sudo docker compose -f docker-compose.prod.yml down -v --remove-orphans
        
        echo '>>> 清理所有相关镜像...'
        sudo docker image prune -af
        
        echo '>>> 重新构建 (无缓存) - 版本: ${BUILD_VERSION}...'
        sudo -E docker compose -f docker-compose.prod.yml build --no-cache \
            --build-arg BUILD_VERSION=\"\${BUILD_VERSION}\" \
            --build-arg BUILD_TIME=\"\${BUILD_TIME}\"
        
        echo '>>> 启动服务...'
        sudo -E docker compose -f docker-compose.prod.yml up -d --force-recreate
        
        echo '>>> 等待数据库启动 (10秒)...'
        sleep 10
        
        echo '>>> 初始化数据...'
        sudo -E docker compose -f docker-compose.prod.yml run --rm --entrypoint /bin/sh init -c '
            npx prisma@6 db push --accept-data-loss
            npx prisma@6 generate
            bash scripts/core/sync-data.sh
            export ADMIN_USERNAME='${ADMIN_USERNAME}'
            export ADMIN_PASSWORD='${ADMIN_PASSWORD}'
            npx tsx scripts/core/admin/ensure-admin.ts
        '
        
        echo '>>> 完成！'
    "
    
    # 询问是否需要(重新)初始化环境配置
    echo -e "\n${YELLOW}是否需要(重新)初始化远程环境配置 (.env)?${NC}"
    read -p "输入 'y' 初始化, 其他键跳过: " INIT_ENV
    if [ "$INIT_ENV" = "y" ]; then
        init_env
        # 部署完成后删除本地生成的 .env.production 文件
        if [ -f ".env.production" ]; then
            echo -e "\n${BLUE}清理本地临时文件...${NC}"
            rm -f .env.production
            echo -e "${GREEN}✓ 已删除本地 .env.production${NC}"
        fi
    fi

    
    remote_exec "$CMD" "核弹重置"
    
    echo -e "\n${GREEN}✓ 核弹重置完成${NC}"
    echo -e "   版本: ${CYAN}${BUILD_VERSION}${NC}"
    echo -e "访问地址: ${CYAN}http://${SERVER_IP}:8080${NC}"
}

# 查看状态
check_status() {
    echo -e "\n${BLUE}📊 检查 VPS 服务状态...${NC}"
    
    local CMD="
        echo '=== Docker 容器状态 ==='
        sudo docker compose -f docker-compose.prod.yml ps
        
        echo ''
        echo '=== 数据库统计 ==='
        sudo docker compose -f docker-compose.prod.yml exec -T db psql -U pokemon_admin -d pokemon_draft -c \"
            SELECT 
                (SELECT COUNT(*) FROM \\\"Pokemon\\\") as pokemon_count,
                (SELECT COUNT(*) FROM \\\"Pokemon\\\" WHERE tags @> ARRAY['reg-f']) as reg_f_count,
                (SELECT COUNT(*) FROM \\\"Pokemon\\\" WHERE tags @> ARRAY['reg-g']) as reg_g_count,
                (SELECT COUNT(*) FROM \\\"Pokemon\\\" WHERE tags @> ARRAY['reg-h']) as reg_h_count
        \" 2>/dev/null || echo '数据库查询失败'
        
        echo ''
        echo '=== 磁盘使用 ==='
        df -h | head -5
        
        echo ''
        echo '=== 内存使用 ==='
        free -h
    "
    
    remote_exec "$CMD" "状态检查"
}

# 查看日志
view_logs() {
    echo -e "\n${BLUE}📝 查看 VPS 日志 (最近 100 行)...${NC}"
    
    local CMD="sudo docker compose -f docker-compose.prod.yml logs --tail=100"
    remote_exec "$CMD" "查看日志"
}

# 环境初始化
init_env() {
    echo -e "\n${CYAN}🔧 初始化远程环境配置...${NC}"
    
    PROD_ENV_FILE=".env.production"
    
    # 若有 .vps_config 中的管理员配置，则非交互生成（便于 CI/核弹重置后）
    local SETUP_OPTS="--output $PROD_ENV_FILE --vps"
    if [ -n "${ADMIN_USERNAME:-}" ]; then
        export ADMIN_USERNAME
        export ADMIN_PASSWORD
        SETUP_OPTS="$SETUP_OPTS --auto"
        echo "从 .vps_config 读取配置，非交互生成 $PROD_ENV_FILE..."
    else
        echo "运行环境配置向导 (将在本地生成 $PROD_ENV_FILE)..."
    fi
    "$PROJECT_ROOT/scripts/setup_env.sh" $SETUP_OPTS
    
    # 2. 上传到服务器
    echo -e "\n${BLUE}📤 上传 $PROD_ENV_FILE 到服务器...${NC}"
    # scp 使用 -P (大写) 指定端口，需要转换 SSH_OPTS
    SCP_OPTS=$(echo "$SSH_OPTS" | sed 's/-p /-P /')
    scp $SCP_OPTS "$PWD/$PROD_ENV_FILE" "$SERVER_USER@$SERVER_IP:$DEST_DIR/.env"
    
    echo -e "\n${GREEN}✓ 远程环境配置文件 (.env) 已更新${NC}"
    echo -e "${YELLOW}提示: 数据库/JWT 密钥已在 $PROD_ENV_FILE 中生成。管理员账号已从 .vps_config 同步。${NC}"

    echo -e "\n${YELLOW}新的配置需要重启服务才能生效。${NC}"
    read -p "是否立即重启服务? (y/N): " RESTART_NOW
    if [[ "$RESTART_NOW" =~ ^[Yy]$ ]]; then
        echo -e "\n${CYAN}🔄 正在重启 Docker 服务...${NC}"
        ssh $SSH_OPTS -t "$SERVER_USER@$SERVER_IP" "cd $DEST_DIR && sudo docker compose -f docker-compose.prod.yml down && sudo docker compose -f docker-compose.prod.yml up -d"
        echo -e "${GREEN}✓ 服务已重启，新配置已生效${NC}"
    else
        echo -e "${BLUE}ℹ️  您稍后可以通过 '热重载' 或 '完整部署' 来应用新配置。${NC}"
    fi
}

# ========================================
# 智能检测变更类型
# ========================================
detect_changes() {
    echo -e "\n${BLUE}🔍 分析本地变更...${NC}"
    
    local CHANGED=$(git status --porcelain 2>/dev/null || echo "")
    
    if [ -z "$CHANGED" ]; then
        echo -e "${YELLOW}未检测到代码变更${NC}"
        export BUILD_STRATEGY="normal"
        return
    fi
    
    local HAS_APP_CHANGES=false
    local HAS_DATA_CHANGES=false
    local HAS_SCHEMA_CHANGES=false
    local HAS_DEPS_CHANGES=false
    local HAS_DOCKER_CHANGES=false
    
    echo "$CHANGED" | grep -qE "^.*(app/|components/|public/)" && HAS_APP_CHANGES=true
    echo "$CHANGED" | grep -qE "^.*(scripts/|rulesets.ts)" && HAS_DATA_CHANGES=true
    echo "$CHANGED" | grep -qE "^.*prisma/schema" && HAS_SCHEMA_CHANGES=true
    echo "$CHANGED" | grep -qE "^.*(package.json|package-lock.json)" && HAS_DEPS_CHANGES=true
    echo "$CHANGED" | grep -qE "^.*(Dockerfile|docker-compose|\.dockerignore)" && HAS_DOCKER_CHANGES=true
    
    echo -e "\n${YELLOW}检测到变更:${NC}"
    [ "$HAS_APP_CHANGES" = true ] && echo "  - 📱 应用/UI 变更"
    [ "$HAS_DATA_CHANGES" = true ] && echo "  - 📊 数据/脚本 变更"
    [ "$HAS_SCHEMA_CHANGES" = true ] && echo "  - 🗄️ 数据库结构 变更"
    [ "$HAS_DEPS_CHANGES" = true ] && echo "  - 📦 依赖包变更"
    [ "$HAS_DOCKER_CHANGES" = true ] && echo "  - 🐳 Docker 配置变更"
    
    # 智能决策构建策略
    if [ "$HAS_DEPS_CHANGES" = true ] || [ "$HAS_DOCKER_CHANGES" = true ]; then
        export BUILD_STRATEGY="no-cache"
        echo -e "\n${RED}⚠️ 检测到依赖或 Docker 变更，将使用完全重建 (--no-cache)${NC}"
    elif [ "$HAS_DATA_CHANGES" = true ] && [ "$HAS_APP_CHANGES" = false ]; then
        export BUILD_STRATEGY="data-only"
        echo -e "\n${GREEN}✓ 仅数据变更，跳过应用重建${NC}"
    else
        export BUILD_STRATEGY="normal"
        echo -e "\n${GREEN}✓ 常规变更，使用快速构建（保留缓存）${NC}"
    fi
    
    echo ""
    if [ "$HAS_SCHEMA_CHANGES" = true ] || [ "$HAS_DATA_CHANGES" = true ]; then
        echo -e "${GREEN}📌 推荐操作: 完整部署 (选项 3)${NC}"
    elif [ "$HAS_APP_CHANGES" = true ]; then
        echo -e "${GREEN}📌 推荐操作: 热重载 (选项 2)${NC}"
    fi
}

# ========================================
# 主菜单
# ========================================
show_menu() {
    echo -e "\n${BLUE}请选择部署操作:${NC}"
    echo "1) 📤 仅同步文件 (不重启服务)"
    echo "2) 🔥 热重载 (同步 + 重启应用)"
    echo "3) 🚀 完整部署 (同步 + 数据更新 + 重启)"
    echo "4) 📊 仅更新数据 (不重启应用)"
    echo "5) 💣 核弹重置 (清空所有数据，重新初始化)"
    echo "6) 📈 查看状态"
    echo "7) 📝 查看日志"
    echo "8) 🔧 环境初始化 (生成/更新 .env)"
    echo "9) 🔍 VPS 环境预检 (Docker/Swap)"
    echo "q) 退出"
    echo ""
    read -p "请输入选项 [1-9/q]: " CHOICE
}

# ========================================
# 主逻辑
# ========================================
main() {
    load_config
    test_connection
    detect_changes
    
    # 命令行参数支持
    case "${1:-}" in
        sync|1)     sync_files ;;
        hot|2)      sync_files && hot_reload ;;
        full|3)     sync_files && full_deploy ;;
        data|4)     sync_files && data_sync ;;
        nuke|5)     sync_files && nuclear_reset ;;
        status|6)   check_status ;;
        logs|7)     view_logs ;;
        env|8)      init_env ;;
        prereq|9)   ensure_vps_prereqs ;;
        *)
            show_menu
            case "$CHOICE" in
                1) sync_files ;;
                2) sync_files && hot_reload ;;
                3) sync_files && full_deploy ;;
                4) sync_files && data_sync ;;
                5) sync_files && nuclear_reset ;;
                6) check_status ;;
                7) view_logs ;;
                8) init_env ;;
                9) ensure_vps_prereqs ;;
                q|Q) echo -e "${GREEN}再见！${NC}" ;;
                *) echo -e "${RED}无效选项${NC}" ;;
            esac
            ;;
    esac
}

main "$@"
