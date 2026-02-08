# 部署操作指南

生产环境部署完整指南。

---

## 📋 快速入口

| 场景                        | 命令                                |
| --------------------------- | ----------------------------------- |
| 从本机 SSH 部署到 VPS       | `bash scripts/prod.sh`              |
| VPS 上 git clone 后一键部署 | `bash scripts/prod/local.sh --auto` |

---

## 一、远程部署（从本机到 VPS）

### 前置准备

1. **配置 `.vps_config`**（根目录）：

```bash
SERVER_IP=your.vps.ip
SERVER_USER=ubuntu
SSH_KEY_PATH=~/.ssh/your_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

首次运行未配置时，脚本会提示输入 IP、用户名、SSH 密钥路径。

2. **SSH 免密**：确保本机能 `ssh user@ip` 免密登录。

### 操作菜单

运行 `bash scripts/prod.sh` 后进入交互菜单：

| 选项 | 命令             | 说明                        |
| ---- | ---------------- | --------------------------- |
| 1    | `prod.sh sync`   | 仅同步文件到 VPS            |
| 2    | `prod.sh hot`    | 同步 + 热重载应用           |
| 3    | `prod.sh full`   | 同步 + 数据更新 + 重启      |
| 4    | `prod.sh data`   | 同步 + 仅更新宝可梦数据     |
| 5    | `prod.sh nuke`   | 核弹重置（清空所有数据）    |
| 6    | `prod.sh status` | 查看容器/数据库/磁盘状态    |
| 7    | `prod.sh logs`   | 查看最近日志                |
| 8    | `prod.sh env`    | 生成/上传 .env 配置         |
| 9    | `prod.sh prereq` | VPS 环境预检（Docker/Swap） |

### 推荐首次部署流程

```bash
# 1. 环境预检（安装 Docker、创建 Swap）
bash scripts/prod.sh prereq

# 2. 核弹部署（同步 + 清空 + 重建 + 初始化）
bash scripts/prod.sh nuke
```

或直接 `prod.sh nuke`（内含 prereq 逻辑）。

### 持续迭代部署

- **只改代码**：`prod.sh hot`（热重载）
- **改了数据/规则**：`prod.sh full`
- **只更新宝可梦数据**：`prod.sh data`

---

## 二、VPS 本地部署

适用于在 VPS 上 `git clone` 后直接运行，无需从本机 SSH。

### 一键部署

```bash
# 在 VPS 上
git clone <repo>
cd pokemon-draft-system
bash scripts/prod/local.sh --auto
```

`--auto` 为非交互模式，使用默认配置。不加则进入交互式配置向导。

### 自动完成

1. 安装 curl、Docker（如未安装）
2. 创建 2GB 临时 Swap（低内存 VPS）
3. 生成 .env 配置
4. 启动数据库
5. 初始化宝可梦数据 + 管理员账号
6. 启动 App + Nginx

### 访问地址

部署完成后：

- 管理员：`http://YOUR_VPS_IP:8080/admin/login`
- 选手：`http://YOUR_VPS_IP:8080/player/login`

---

## 三、环境说明

### 生产环境必须配置的变量

生产环境**必须**通过 `.env` 配置以下变量，代码中不提供生产可用默认值：

- **JWT_SECRET**：JWT 签名密钥（未设置时应用会拒绝启动）
- **DB_PASS**：数据库密码（docker-compose.prod.yml 强制要求）
- **ADMIN_PASSWORD**：管理员初始化/重置时使用（create-admin / ensure-admin 必须传入）

部署前运行 `scripts/setup_env.sh` 生成 `.env`，或手动配置上述变量。

### 依赖脚本（保留）

| 脚本                           | 用途                | 调用方                            |
| ------------------------------ | ------------------- | --------------------------------- |
| `scripts/setup_env.sh`         | 生成 .env 配置文件  | prod/deploy.sh env、prod/local.sh |
| `scripts/docker-entrypoint.sh` | Docker 容器启动入口 | Dockerfile ENTRYPOINT             |

这两个脚本**必须保留**，不可移入 deprecated。

### 目录结构

```
scripts/
├─ dev.sh              # 开发入口
├─ prod.sh             # 生产入口（远程部署）
├─ setup_env.sh        # 环境配置生成
├─ docker-entrypoint.sh # Docker 容器入口
├─ dev/
│  └─ dev.sh           # 开发主逻辑
├─ prod/
│  ├─ deploy.sh        # 远程部署主逻辑
│  └─ local.sh         # VPS 本地部署
├─ core/
│  ├─ sync-data.sh     # 数据同步编排（四阶段）
│  ├─ admin/           # 管理员脚本（create-admin, ensure-admin）
│  └─ data/            # 数据脚本（fetch, extract, import, translate）
└─ shared/
   └─ utils.sh         # 共享工具
```

---

## 四、常见问题

### Q: 首次部署选 sync 还是 nuke？

选 **nuke**。sync 仅同步文件，不初始化数据库。nuke 会清空并完整重建。

### Q: 忘记管理员密码？

在 VPS 上运行：

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=newpass npx tsx scripts/core/admin/ensure-admin.ts
```

### Q: 如何更新 .env？

`prod.sh env` 会在本地生成 `.env.production` 并上传到服务器覆盖 `.env`。

### Q: 支持哪些 Linux 发行版？

- **Docker 安装**：get.docker.com 支持 Ubuntu/Debian/CentOS/RHEL/Fedora
- **rsync 安装**：deploy 会检测 apt/dnf/yum/zypper 自动安装

---

## 五、相关文档

- [scripts/README.md](../scripts/README.md) - 脚本命令速查
- [DEVELOPMENT.md](./DEVELOPMENT.md) - 开发环境设置
- [GUIDE_ADMIN.md](./GUIDE_ADMIN.md) - 管理员操作指南
- [GUIDE_PLAYER.md](./GUIDE_PLAYER.md) - 选手操作指南
