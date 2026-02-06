# Changelog

所有重要的变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

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

## [1.0.1] - 2026-02-06

### 🐛 Bug 修复

- **UI 修复**
  - 修复了管理员观战页面 (`/admin/contests/[id]/spectate`) 中价格分档 Tab 栏无法冻结在组件顶端的问题
  - Tab 栏现在能正确固定在顶部，不会被宝可梦列表穿过
  - 提升了 Tab 栏的 z-index 层级，增强了视觉效果

### ✅ 测试验证

- **SSE 实时更新测试**
  - SSE 连接测试：全部通过 ✅
  - 多客户端同步测试：全部通过 ✅
  - SSE 延时测试：平均延时约 176ms，性能良好 ✅
  - 断线重连测试：全部通过 ✅

- **管理员控制功能测试**
  - 暂停/继续功能：正常 ✅
  - 撤销功能：正常 ✅
  - 暂停时禁止操作：正常 ✅

### 📚 文档更新

- 更新了管理员手册 (`GUIDE_ADMIN.md`)
  - 添加了竞价模式强制成交的限制说明（禁止在倒计时进行中且剩余时间 > 5 秒时强制成交）
  - 添加了操作频率限制说明
- 更新了选手手册 (`GUIDE_PLAYER.md`)
  - 添加了操作频率限制说明
  - 添加了登出后安全机制说明

---

## 版本说明

- **v1.0.0**: 首个稳定版本，包含所有核心功能
- **v1.0.1**: Bug 修复版本，修复 Tab 栏冻结问题，SSE 功能稳定通过测试
