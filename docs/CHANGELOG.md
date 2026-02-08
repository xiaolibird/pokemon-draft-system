# Changelog

所有重要的变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

---

## [1.1.1] - 2026-02-08

### 🐛 Bug 修复

- **竞价系统卡死修复 (Auction Fix)**
  - 修复了竞价面板在倒计时结束时可能卡死在“等待结果”状态的问题。
  - 优化了 `AuctionPanel` 组件，增加了自动刷新 (Auto-Refresh) 与结算重试机制。
  - 修复了弱网环境下状态不同步的问题。
- **数据实时性优化**
  - 强制后端 API (`/api/admin/contests/[id]`) 禁用缓存，确保获取最新状态。
  - 优化前端 `apiFetch` 工具函数，默认禁用缓存。
- **UI/UX 改进**
  - 优化了竞价输入框的重置逻辑，每轮竞价开始时自动重置为最低出价。
  - 在卡死状态下提供显式的“刷新”按钮。

---

## [1.1.0] - 2026-02-07

### 🏗️ 架构重构 & 核心优化

- **服务层化 (Service-Oriented)**
  - 新增 `app/lib/services/`，提取核心业务逻辑（竞价、选秀流程）到 `DraftService` 和 `AuctionService`。
  - 统一 API 路由逻辑，降低代码耦合度。
- **类型中心化**
  - 新增 `app/types/` 环境，统一 `Contest`、`Player`、`PoolItem` 等数据模型定义。
  - 解决 IDE 类型推断红线问题，增强开发体验。
- **API 健壮性**
  - 修改 40+ 个路由以支持新的服务层架构。
  - 标准化错误处理流。

### 📊 数据层刷新

- **宝可梦数据标准化**
  - 全面更新并重格式化了所有宝可梦基础数据文件 (`pokedex.ts`, `learnsets.ts` 等)。
  - 对齐 Pokemon Showdown 最新数据标准。
  - 统一代码格式（双引号、末尾逗号等）。
- **脚本优化**
  - 更新了数据导入与翻译逻辑。
  - 移除了过时的规则集（rulesets）静态提取脚本，转向更动态的配置模式。

### 🚀 部署与版本优化

- **版本显示逻辑优化**
  - 修改 `scripts/prod/deploy.sh`：优先使用 Git Tag，无 Tag 时回退显示 Commit Hash。
  - 开发环境固定显示 `dev`。
- **部署脚本增强**
  - 增加了详细的环境变量校验与错误提示（如容器内 `DATABASE_URL` 检查）。
  - 优化了构建策略检测。

### 🔧 开发环境清理

- **项目脚本清理**
  - 清理了 `package.json` 中失效的紧急处理脚本。
  - 对齐并新增了当前的测试入口（16人蛇形、功能测试、冒烟测试等）。

---

## [1.0.1] - 2026-02-06

### 🐛 Bug 修复

- **SSE 稳定性修复**
  - 修复了 SSE 连接在某些网络环境下频繁断开的问题。
  - 增加了心跳检测（Heartbeat）机制，每 30 秒发送一次 ping。
- **Tab 栏冻结问题**
  - 修复了在某些移动端浏览器上，底部 Tab 栏切换时页面冻结的问题。
  - 优化了 React 组件的重新渲染逻辑。

### ✨ 新增功能

- **自动化测试套件**
  - 新增 `scripts/test/` 目录，包含冒烟测试、功能测试、SSE 压力测试脚本。
  - 支持本地和生产环境的自动化测试。

---

## [1.0.0] - 2026-02-05

### 🎉 首个正式版本发布

这是宝可梦选秀系统的第一个稳定版本，包含完整的核心功能。

### ✨ 新增功能

- **比赛管理**
  - 管理员创建和管理比赛
  - 支持蛇形选秀（SNAKE）和竞价模式（AUCTION）
  - 价格分档系统（Price Tiers）
  - 比赛状态管理和控制台操作

- **选手功能**
  - 选手凭密钥登录参与比赛
  - 实时选秀房间（SSE 实时更新）
  - 竞价系统（支持防抢拍逻辑）
  - 宝可梦交换功能

- **数据管理**
  - 完整的宝可梦数据（基于 Pokemon Showdown）
  - 规则集支持（Regulation H 等）
  - 中文名称支持
  - 数据同步脚本

- **部署系统**
  - Docker 容器化部署
  - 一键部署脚本（VPS 本地部署）
  - 远程部署脚本（SSH 部署）
  - 完整的部署文档

### 🏗️ 架构优化

- **代码重构**
  - 模块化目录结构（api, auth, business, db, hooks, contexts, middleware, utils, data）
  - 统一的导入路径规范
  - 性能优化（useCallback, useMemo）
  - React Hooks 最佳实践

- **性能优化**
  - SSE 实时更新优化（减少带宽）
  - 防抢拍逻辑（竞价倒计时重置）
  - 组件渲染优化
  - 数据库查询优化

### 📚 文档

- 完整的开发文档（DEVELOPMENT.md）
- 详细的部署指南（DEPLOYMENT.md）
- 管理员操作手册（GUIDE_ADMIN.md）
- 选手操作手册（GUIDE_PLAYER.md）
- 架构文档（ARCHITECTURE.md）

### 🔧 技术栈

- **前端**: Next.js 16, React 19, TypeScript
- **后端**: Next.js API Routes
- **数据库**: PostgreSQL, Prisma ORM
- **部署**: Docker, Docker Compose, Nginx
- **开发工具**: ESLint, Prettier, Husky

### 🐛 Bug 修复

- 修复了多个性能相关的 React Hooks 警告
- 修复了导入路径问题
- 修复了部署脚本中的文件引用问题

### 📝 注意事项

- 首次部署需要配置 `.env` 文件（参考 `.env.example`）
- 生产环境部署后请立即修改默认管理员密码
- 支持 HTTP 和 HTTPS 部署（参考 Nginx 配置示例）

---

## 版本说明

- **v1.1.1**: 竞价系统紧急修复，解决卡死与重试问题，提升数据实时性。
- **v1.1.0**: 架构升级（Service层），全量宝可梦数据刷新，API 健壮性增强。
- **v1.0.1**: 稳定性更新，修复 SSE 连接与移动端 Tab 冻结问题，新增测试套件。
- **v1.0.0**: 首个正式版本，核心功能完备（蛇形/竞价选秀，Docker部署）。
