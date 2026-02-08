# 开发环境设置指南

本地开发完整指南。

---

## 📋 前置要求

- **Docker Desktop**（推荐，用于数据库）
- **Node.js 18+**（可选，用于热重载模式）
- npm 或 yarn

---

## 🚀 一键启动

```bash
# 1. 配置环境变量（可选）
cp .env.example .env

# 2. 一键开发
bash scripts/dev.sh
```

运行后进入交互菜单，选择：

| 选项          | 说明                              |
| ------------- | --------------------------------- |
| 1 快速启动    | 启动数据库 + `npm run dev` 热重载 |
| 2 完整同步    | 重建数据库 + 导入宝可梦数据       |
| 3 Docker 模式 | 全部在容器中运行                  |
| 4 仅更新数据  | 不重启，只更新宝可梦              |
| 5 清理环境    | 停止容器                          |
| 6 查看日志    | 查看 Docker 日志                  |
| 7 重置数据库  | 清空并重新初始化                  |

---

## 🔧 环境配置

### 1. 创建 .env

```bash
cp .env.example .env
```

### 2. 数据库连接

**本地 PostgreSQL**：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pokemon_draft"
```

**Docker Compose**（推荐，仅限本地开发）：

```env
DATABASE_URL="postgresql://pokemon_admin:your_password@db:5432/pokemon_draft"
```

### 3. 管理员账号

```env
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="your-secure-password"
```

- **本地开发**：`scripts/dev.sh` 未设置时使用默认值 `admin` / `password123`（仅限本地，勿用于生产）。
- **创建管理员**：运行 `create-admin.ts` 或 `ensure-admin.ts` 时必须设置 `ADMIN_PASSWORD`，无可用默认值。

---

## 🗄️ 数据库初始化

### 方式一：一键开发（推荐）

```bash
bash scripts/dev.sh
# 选择 2 完整同步
```

### 方式二：仅重置数据库

```bash
bash scripts/dev.sh reset
```

会执行：db push → 导入宝可梦（四阶段数据同步）→ 创建管理员。

### 方式三：仅创建管理员

```bash
npx tsx scripts/core/admin/create-admin.ts

# 或临时指定
ADMIN_USERNAME=admin ADMIN_PASSWORD=mydevpass npx tsx scripts/core/admin/create-admin.ts
```

---

## 🐳 两种开发模式

### 模式一：热重载（推荐）

- 数据库用 Docker，应用用本地 `npm run dev`
- 代码改动即时生效
- 需要 Node.js 18+

```bash
bash scripts/dev.sh quick
```

### 模式二：全 Docker

- 数据库和应用都在容器
- 无需本地 Node，适合纯前端调试

```bash
bash scripts/dev.sh docker
```

---

## 📝 管理员账号管理

| 操作         | 命令                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| 创建新管理员 | `ADMIN_USERNAME=x ADMIN_PASSWORD=y npx tsx scripts/core/admin/create-admin.ts` |
| 重置密码     | `ADMIN_USERNAME=x ADMIN_PASSWORD=y npx tsx scripts/core/admin/ensure-admin.ts` |

`ensure-admin` 会更新已存在账号的密码。

---

## 🔍 常见问题

### Q: 忘记管理员密码？

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=newpass npx tsx scripts/core/admin/ensure-admin.ts
```

### Q: 如何查看数据库？

```bash
npx prisma studio
# 打开 http://localhost:5555
```

### Q: 数据库宝可梦数量不足？

执行 `bash scripts/dev.sh sync` 或 `bash scripts/dev.sh reset` 重新导入。

### Q: Docker 未运行？

启动 Docker Desktop 后重试。脚本会检测 Docker 状态并提示。

### Q: 开发和生产用哪个管理员脚本？

- **开发**：`create-admin.ts`（有默认值）
- **生产**：`ensure-admin.ts`（必须提供环境变量）

---

## 📚 相关脚本

| 脚本                                 | 用途                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| `scripts/dev.sh`                     | 开发入口，交互菜单                                       |
| `scripts/core/admin/create-admin.ts` | 创建管理员（如不存在）                                   |
| `scripts/core/admin/ensure-admin.ts` | 确保管理员存在并更新密码                                 |
| `scripts/core/sync-data.sh`          | 数据同步（四阶段：fetch → extract → import → translate） |

### 数据同步流程（sync-data.sh）

| 阶段 | 脚本                            | 说明                   |
| ---- | ------------------------------- | ---------------------- |
| 1    | `core/data/fetch-showdown.ts`   | 拉取 Showdown 原始数据 |
| 2    | `core/data/extract-rulesets.ts` | 提取规则到 rulesets.ts |
| 3    | `core/data/import-pokemon.ts`   | 导入宝可梦到数据库     |
| 4    | `core/data/translate-forms.ts`  | 形态中文翻译           |

---

## 📖 相关文档

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 生产部署操作指南
- [scripts/README.md](../scripts/README.md) - 脚本命令速查
- [GUIDE_ADMIN.md](./GUIDE_ADMIN.md) - 管理员操作指南
- [GUIDE_PLAYER.md](./GUIDE_PLAYER.md) - 选手操作指南
