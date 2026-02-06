#!/bin/bash
# ========================================
# 宝可梦选秀系统 - 环境配置脚本 (增强安全版)
# ========================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"

# 参数检测
AUTO_MODE=false
VPS_MODE=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --auto) AUTO_MODE=true ;;
        --vps) VPS_MODE=true ;;
        --output) ENV_FILE="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================"
echo "  Pokemon Draft System - 环境配置向导"
[ "$VPS_MODE" = true ] && echo "  (VPS 模式: 默认数据库主机为 db)"
[ -n "$ENV_FILE" ] && echo "  (输出文件: $ENV_FILE)"
echo -e "========================================${NC}\n"

# 检查是否已存在 .env
if [ -f "$ENV_FILE" ] && [ "$AUTO_MODE" = false ]; then
    echo -e "${YELLOW}警告: .env 文件已存在${NC}"
    read -p "是否备份并创建新配置? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$BACKUP_FILE"
        echo -e "${GREEN}✓ 已备份到: $BACKUP_FILE${NC}\n"
    else
        echo -e "${RED}操作取消${NC}"
        exit 0
    fi
fi

# 尝试加载现有配置（防止覆盖旧密码）
if [ -f "$ENV_FILE" ]; then
    # 仅导出非注释行
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# 询问输入函数（支持环境变量预设）
ask_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    local hide_input="${4:-no}"
    
    # 如果环境变量已经存在且不为空，或者是自动模式且有默认值，则跳过询问
    if [ -n "${!var_name:-}" ]; then
        return 0
    fi
    
    if [ "$AUTO_MODE" = true ]; then
        eval "$var_name=\"$default_value\""
        return 0
    fi

    local value=""
    if [ "$hide_input" = "yes" ]; then
        read -s -p "$prompt" value
        echo
    else
        read -p "$prompt" value
    fi
    
    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi
    
    eval "$var_name=\"$value\""
}

# 生成复杂随机字符串函数
generate_complex_secret() {
    local length=$1
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c $length
}

# 1. 数据库配置
echo -e "${BLUE}1. 数据库配置${NC}"
DB_USER_DEFAULT="pokemon_admin"
DB_PASS_DEFAULT=$(generate_complex_secret 24)
DB_HOST_DEFAULT="localhost"
if [ "$AUTO_MODE" = true ] || [ "$VPS_MODE" = true ]; then
    DB_HOST_DEFAULT="db"
fi
DB_PORT_DEFAULT="5432"
DB_NAME_DEFAULT="pokemon_draft"

ask_input "数据库用户名 [$DB_USER_DEFAULT]: " DB_USER "$DB_USER_DEFAULT"
ask_input "数据库密码 (留空随机生成): " DB_PASS "$DB_PASS_DEFAULT" "yes"
ask_input "数据库主机 [$DB_HOST_DEFAULT]: " DB_HOST "$DB_HOST_DEFAULT"
ask_input "数据库端口 [$DB_PORT_DEFAULT]: " DB_PORT "$DB_PORT_DEFAULT"
ask_input "数据库名称 [$DB_NAME_DEFAULT]: " DB_NAME "$DB_NAME_DEFAULT"

FINAL_DB_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# 2. 安全密钥配置
echo -e "\n${BLUE}2. 安全密钥配置${NC}"
# 生成更长(64位)的 JWT 密钥
JWT_SECRET_DEFAULT=$(openssl rand -hex 64 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(64))" 2>/dev/null)
ask_input "JWT 密匙 (建议使用 64 位复杂字符, 留空随机生成): " JWT_SECRET "$JWT_SECRET_DEFAULT"

# 3. 管理员账号配置
echo -e "\n${BLUE}3. 管理员账号配置${NC}"
ask_input "管理员用户名 [admin]: " ADMIN_USERNAME "admin"
ask_input "管理员密码 (建议至少 12 位, 留空使用初始默认密码): " ADMIN_PASSWORD "password123" "yes"

# 4. 应用基础配置
echo -e "\n${BLUE}4. 应用基础配置${NC}"
ask_input "应用运行端口 [3000]: " PORT "3000"

# 生成 .env 文件
echo -e "\n${GREEN}正在生成配置文件...${NC}"

cat > "$ENV_FILE" << EOF
# ========================================
# Pokemon Draft System 环境变量 (增强安全版)
# 生成时间: $(date)
# 模式: $( [ "$AUTO_MODE" = true ] && echo "自动/远程" || echo "交互式" )
# ========================================

# 数据库连接
# 格式: postgresql://USER:PASSWORD@HOST:PORT/DBNAME
DATABASE_URL="${FINAL_DB_URL}"

# Docker 容器配置
DB_USER="${DB_USER}"
DB_PASS="${DB_PASS}"
DB_NAME="${DB_NAME}"

# 安全密钥 (不要泄露！)
JWT_SECRET="${JWT_SECRET}"

# 管理员初始化账号 (首次运行 dev.sh reset 或 create-admin 时使用)
ADMIN_USERNAME="${ADMIN_USERNAME}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"

# 应用运行设置
PORT=${PORT}
NODE_ENV="production"
EOF

chmod 600 "$ENV_FILE"

echo -e "${GREEN}✓ 配置文件已生成: $ENV_FILE${NC}"
echo -e "${YELLOW}⚠️  请确保数据库用户 '${DB_USER}' 已创建并拥有 '${DB_NAME}' 的权限。${NC}"
echo -e "${YELLOW}⚠️  如果是远程部署，请在 CI/CD 中通过环境变量注入这些值。${NC}\n"
echo -e "${GREEN}✓ 环境配置完成！${NC}"
