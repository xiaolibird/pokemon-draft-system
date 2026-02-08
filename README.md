# 宝可梦选秀系统 (Pokemon Draft System)

管理员创建比赛、选手凭密钥参与，支持蛇形选秀与竞价模式。基于 Next.js、Prisma、Docker。

本项目使用的规则集、图鉴等数据来源于 [Pokemon Showdown](https://github.com/smogon/pokemon-showdown)（Smogon）。宝可梦立绘图片来源于 [神奇宝贝百科](https://wiki.52poke.com)。

---

## 快速开始

### 本地开发

```bash
cp .env.example .env
bash scripts/dev.sh
# 选择 1 快速启动 或 2 完整同步
# 重置数据库：bash scripts/dev.sh reset
```

详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

### VPS 部署

```bash
# 远程部署（本机 SSH 到 VPS）
bash scripts/prod.sh

# VPS 本地部署（服务器上 git clone 后直接运行）
bash scripts/prod/local.sh --auto
```

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 文档导航

| 用途           | 文档                                         | 说明                         |
| -------------- | -------------------------------------------- | ---------------------------- |
| **开发环境**   | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)   | 本地开发设置、管理员账号配置 |
| **部署**       | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | 生产环境部署完整指南         |
| **脚本速查**   | [scripts/README.md](scripts/README.md)       | 部署命令、入口参数           |
| **管理员手册** | [docs/GUIDE_ADMIN.md](docs/GUIDE_ADMIN.md)   | 比赛创建、主持、控制台操作   |
| **选手手册**   | [docs/GUIDE_PLAYER.md](docs/GUIDE_PLAYER.md) | 登录、选秀、竞价、交换       |

---

## 技术栈

Next.js · Prisma · PostgreSQL · Docker · Nginx

---

## License

[MIT](LICENSE)
