#!/bin/bash
# ========================================
# 🎮 Pokemon Draft System - 本地开发一键脚本
# ========================================
# 用途：macOS/Linux 本地开发环境的统一入口
# ========================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/utils.sh"
ensure_cd_project

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════╗"
echo "║   🎮 Pokemon Draft System - 本地开发环境       ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# ========================================
# 环境检测
# ========================================
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装，请先安装 Docker Desktop${NC}"
        exit 1
    fi
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker 未运行，请启动 Docker Desktop${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker 环境正常${NC}"
}

check_node() {
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}⚠ Node.js 未检测到，将使用 Docker 模式${NC}"
        return 1
    fi
    local NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
    if [ "$NODE_VER" -lt 18 ]; then
        echo -e "${YELLOW}⚠ Node.js 版本过低 (需要 v18+)，将使用 Docker 模式${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v) 已就绪${NC}"
    return 0
}

# ========================================
# 本地环境变量
# ========================================
# 加载 .env 文件（如果存在）
if [ -f .env ]; then
    echo -e "${BLUE}📄 加载 .env 文件...${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# 以下默认值仅限本地开发，勿用于生产。生产环境必须通过 .env 配置 JWT_SECRET、DB_PASS、ADMIN_PASSWORD。
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3000}"
export NODE_ENV="${NODE_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-postgresql://pokemon_admin:dev_local_only@localhost:5432/pokemon_draft}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-key-change-in-production}"
export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-password123}"
export CACHE_BUST=$(date +%s)

echo -e "\n${BLUE}📋 环境配置:${NC}"
echo "   API_URL: $NEXT_PUBLIC_API_URL"
echo "   NODE_ENV: $NODE_ENV"
echo "   DATABASE: localhost:5432"
echo "   ADMIN_USERNAME: ${ADMIN_USERNAME}"
echo "   ADMIN_PASSWORD: ${ADMIN_PASSWORD:+***已设置***}"

# ========================================
# 功能菜单
# ========================================
show_menu() {
    echo -e "\n${BLUE}请选择操作:${NC}"
    echo "1) 🚀 快速启动 (仅启动数据库 + npm run dev 热重载)"
    echo "2) 🔄 完整同步 (重建数据库 + 更新宝可梦数据)"
    echo "3) 🐳 Docker 模式 (全部在容器中运行)"
    echo "4) 📊 仅更新数据 (不重启服务)"
    echo "5) 🧹 清理环境 (停止所有容器，可选删除数据)"
    echo "6) 📝 查看日志"
    echo "7) ⚠️ 重置数据库 (清空数据并重新初始化)"
    echo "q) 退出"
    echo ""
    read -p "请输入选项 [1-7/q]: " CHOICE
}

# ========================================
# 功能实现
# ========================================

# 启动数据库容器
start_db() {
    echo -e "\n${BLUE}🐘 启动 PostgreSQL 数据库...${NC}"
    docker compose up -d db
    
    echo "等待数据库就绪..."
    local retries=0
    while ! docker compose exec -T db pg_isready -U pokemon_admin &> /dev/null; do
        retries=$((retries + 1))
        if [ $retries -gt 30 ]; then
            echo -e "${RED}❌ 数据库启动超时${NC}"
            exit 1
        fi
        sleep 1
        echo -n "."
    done
    echo -e "\n${GREEN}✓ 数据库已就绪${NC}"
}

# 初始化/同步数据库结构和数据
sync_data() {
    echo -e "\n${BLUE}📦 同步数据库结构和宝可梦数据...${NC}"
    
    # 构建 init 容器（使用 no-cache 确保最新代码）
    echo "构建初始化容器..."
    docker compose build --no-cache init
    
    # 执行初始化脚本（传递环境变量）
    echo "执行数据同步..."
    docker compose run --rm \
        -e ADMIN_USERNAME="${ADMIN_USERNAME}" \
        -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
        --entrypoint /bin/sh init -c "
        set -e
        echo '>>> 执行数据同步流程...'
        bash scripts/core/sync-data.sh
        
        echo '>>> 创建管理员账号...'
        npx tsx scripts/core/admin/create-admin.ts
    "
    
    echo -e "${GREEN}✓ 数据同步完成${NC}"
}

# 快速启动（热重载模式）
quick_start() {
    check_docker
    start_db
    
    if check_node; then
        echo -e "\n${BLUE}🔥 启动热重载开发服务器...${NC}"
        echo -e "${YELLOW}提示: 首次运行需要执行 'npm install'${NC}"
        
        # 检查 node_modules
        if [ ! -d "node_modules" ]; then
            echo "安装依赖..."
            npm install
        fi
        
        # 数据库迁移 + 生成 Prisma Client（本地）
        echo "应用数据库迁移..."
        bash "$SCRIPT_DIR/../core/migrate.sh"
        echo "生成 Prisma Client..."
        npx prisma@6 generate
        
        # 检查数据库是否有数据
        local pokemon_count=$(docker compose exec -T db psql -U pokemon_admin -d pokemon_draft -t -c "SELECT COUNT(*) FROM \"Pokemon\"" 2>/dev/null | tr -d ' ' || echo "0")
        if [ "$pokemon_count" -lt 100 ]; then
            echo -e "${YELLOW}⚠ 数据库宝可梦数量不足 ($pokemon_count)，建议执行完整同步${NC}"
            read -p "是否现在同步数据? [Y/n]: " SYNC_CHOICE
            if [[ ! "$SYNC_CHOICE" =~ ^[Nn]$ ]]; then
                sync_data
            fi
        fi
        
        echo -e "\n${GREEN}🚀 启动开发服务器...${NC}"
        echo -e "${CYAN}访问地址: http://localhost:3000${NC}"
        echo -e "${CYAN}管理后台: http://localhost:3000/admin${NC}"
        echo -e "${YELLOW}按 Ctrl+C 停止服务器${NC}\n"
        
        npm run dev
    else
        echo -e "${YELLOW}切换到 Docker 模式...${NC}"
        docker_mode
    fi
}

# Docker 完整模式
docker_mode() {
    check_docker
    
    echo -e "\n${BLUE}🐳 Docker 完整模式启动...${NC}"
    
    # 构建并启动所有服务
    docker compose build
    docker compose up -d
    
    # 等待 web 服务就绪
    echo "等待服务启动..."
    sleep 5
    
    echo -e "\n${GREEN}✓ 所有服务已启动${NC}"
    echo -e "${CYAN}访问地址: http://localhost:3000${NC}"
    echo -e "${YELLOW}查看日志: docker compose logs -f${NC}"
}

# 仅更新数据
update_data_only() {
    check_docker
    
    echo -e "\n${BLUE}📊 更新宝可梦数据 (不重启服务)...${NC}"
    
    # 确保数据库在运行
    if ! docker compose ps db | grep -q "running"; then
        start_db
    fi
    
    sync_data
}

# 清理环境
cleanup() {
    echo -e "\n${BLUE}🧹 清理开发环境...${NC}"
    
    echo "停止所有容器..."
    docker compose down
    
    read -p "是否同时删除数据库数据? [y/N]: " DELETE_DATA
    if [[ "$DELETE_DATA" =~ ^[Yy]$ ]]; then
        echo -e "${RED}删除数据卷...${NC}"
        docker compose down -v
        echo -e "${GREEN}✓ 数据已清除${NC}"
    fi
    
    echo -e "${GREEN}✓ 清理完成${NC}"
}

# 重置数据库（危险操作）
reset_db() {
    echo -e "\n${RED}⚠️ 此操作将清空所有数据！${NC}"
    read -p "输入 'confirm' 继续: " CONFIRM
    [ "$CONFIRM" != "confirm" ] && { echo "已取消"; return; }
    
    # 确保数据库已启动
    start_db
    
    echo -e "\n${BLUE}[1/4] 重置数据库结构...${NC}"
    npx prisma migrate reset --force
    echo -e "\n${BLUE}[2/4] 同步 schema...${NC}"
    npx prisma db push
    echo -e "\n${BLUE}[3/4] 导入宝可梦数据...${NC}"
    bash "$PROJECT_ROOT/scripts/core/sync-data.sh"
    echo -e "\n${BLUE}[4/4] 创建管理员...${NC}"
    npx tsx scripts/core/admin/create-admin.ts || true
    echo -e "\n${GREEN}✓ 重置完成${NC}"
}

# 查看日志
view_logs() {
    echo -e "\n${BLUE}📝 查看容器日志...${NC}"
    echo "1) 所有服务"
    echo "2) 仅数据库"
    echo "3) 仅 Web 应用"
    read -p "选择 [1-3]: " LOG_CHOICE
    
    case "$LOG_CHOICE" in
        1) docker compose logs -f ;;
        2) docker compose logs -f db ;;
        3) docker compose logs -f web ;;
        *) docker compose logs -f ;;
    esac
}

# 完整同步
full_sync() {
    check_docker
    start_db
    sync_data
    
    echo -e "\n${GREEN}✓ 完整同步已完成！${NC}"
    echo -e "${CYAN}现在可以运行 'npm run dev' 或选择 Docker 模式${NC}"
}

# ========================================
# 主逻辑
# ========================================
main() {
    check_docker
    
    # 如果有命令行参数，直接执行
    case "${1:-}" in
        quick|1)    quick_start ;;
        sync|2)     full_sync ;;
        docker|3)   docker_mode ;;
        data|4)     update_data_only ;;
        clean|5)    cleanup ;;
        logs|6)     view_logs ;;
        reset|7)    reset_db ;;
        *)
            show_menu
            case "$CHOICE" in
                1) quick_start ;;
                2) full_sync ;;
                3) docker_mode ;;
                4) update_data_only ;;
                5) cleanup ;;
                6) view_logs ;;
                7) reset_db ;;
                q|Q) echo -e "${GREEN}再见！${NC}" ;;
                *) echo -e "${RED}无效选项${NC}" ;;
            esac
            ;;
    esac
}

main "$@"
