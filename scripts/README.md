# Scripts 脚本指南

开发/生产分明，入口简洁。完整部署指南见 [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)。

---

## 快速入口

| 环境     | 命令                         | 说明                           |
| -------- | ---------------------------- | ------------------------------ |
| **开发** | `bash scripts/dev.sh`        | 本地开发（Docker + 热重载）    |
| **生产** | `bash scripts/prod.sh`       | 从本机部署到 VPS（SSH 远程）   |
| **生产** | `bash scripts/prod/local.sh` | VPS 本地部署（在服务器上运行） |

---

## 开发环境 (dev)

**入口**: `bash scripts/dev.sh`

在本地 Mac/Linux 运行，用于日常开发。

| 选项 | 命令            | 说明                              |
| ---- | --------------- | --------------------------------- |
| 1    | `dev.sh quick`  | 快速启动：数据库 + npm run dev    |
| 2    | `dev.sh sync`   | 完整同步：重建 DB + 宝可梦数据    |
| 3    | `dev.sh docker` | Docker 模式（全部在容器）         |
| 4    | `dev.sh data`   | 仅更新宝可梦数据                  |
| 5    | `dev.sh clean`  | 清理容器                          |
| 6    | `dev.sh logs`   | 查看日志                          |
| 7    | `dev.sh reset`  | ⚠️ 重置数据库（清空并重新初始化） |

**前置**: 安装 Docker，可选配置 `.env`（见 `.env.example`）

---

## 生产环境 (prod)

### 方式一：远程部署（从本机到 VPS）

**入口**: `bash scripts/prod.sh`

从你的开发机 SSH 到 VPS，同步代码并执行部署。

| 选项 | 命令             | 说明                        |
| ---- | ---------------- | --------------------------- |
| 1    | `prod.sh sync`   | 仅同步文件                  |
| 2    | `prod.sh hot`    | 同步 + 热重载应用           |
| 3    | `prod.sh full`   | 同步 + 数据更新 + 重启      |
| 4    | `prod.sh data`   | 同步 + 仅更新数据           |
| 5    | `prod.sh nuke`   | 核弹重置（清空所有数据）    |
| 6    | `prod.sh status` | 查看状态                    |
| 7    | `prod.sh logs`   | 查看日志                    |
| 8    | `prod.sh env`    | 初始化/上传 .env            |
| 9    | `prod.sh prereq` | VPS 环境预检（Docker/Swap） |

**前置**: 根目录 `.vps_config`（或按提示输入 IP、用户、SSH 密钥）

### 方式二：VPS 本地部署（在服务器上运行）

**入口**: `bash scripts/prod/local.sh [--auto]`

在 VPS 上 `git clone` 后直接运行，无需从本机 SSH。适合裸机首次部署。

- `--auto`: 非交互模式（使用默认配置）
- 自动安装 Docker、Swap、生成 .env、初始化数据、启动服务

---

## 目录结构

```
scripts/
├─ dev.sh              # 开发入口（委托 dev/dev.sh）
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
│  ├─ admin/           # create-admin, ensure-admin
│  └─ data/            # fetch-showdown, extract-rulesets, import-pokemon, translate-forms
└─ shared/
   └─ utils.sh
```

---

## 一台干净机器上的部署流程

### 开发环境

```bash
git clone <repo>
cd pokemon-draft-system
cp .env.example .env    # 可选，编辑数据库/管理员等
bash scripts/dev.sh
# 选择 1 快速启动 或 2 完整同步
```

### 生产环境（VPS 首次部署）

```bash
# 在 VPS 上
git clone <repo>
cd pokemon-draft-system
bash scripts/prod/local.sh --auto
# 访问 http://YOUR_VPS_IP:8080/admin
```

### 生产环境（从本机持续部署）

```bash
# 在本机
echo 'SERVER_IP=your.vps.ip
SERVER_USER=ubuntu
SSH_KEY_PATH=~/.ssh/your_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password' > .vps_config

bash scripts/prod.sh
# 选择 3 完整部署 或 2 热重载
```
