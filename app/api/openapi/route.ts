import { NextResponse } from "next/server";

/**
 * @title Pokemon Draft System API
 * @version 1.0.0
 * @description 宝可梦选秀系统 API 文档
 */

const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Pokemon Draft System API",
    description: "宝可梦选秀系统 API 文档 - 包含管理员和选手端的完整 API",
    version: "1.0.0",
    contact: {
      name: "API Support",
      email: "support@pokemon-draft.local",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "本地开发环境",
    },
    {
      url: "http://YOUR_VPS_IP:8080",
      description: "生产环境",
    },
  ],
  tags: [
    { name: "Admin", description: "管理员相关接口" },
    { name: "Player", description: "选手相关接口" },
    { name: "Auth", description: "认证相关接口" },
    { name: "Contest", description: "比赛相关接口" },
  ],
  paths: {
    "/api/admin/contests": {
      get: {
        tags: ["Admin"],
        summary: "获取比赛列表",
        description: "管理员获取所有比赛列表",
        responses: {
          200: {
            description: "成功返回比赛列表",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Contest" },
                },
              },
            },
          },
          401: { description: "未授权" },
        },
      },
      post: {
        tags: ["Admin"],
        summary: "创建比赛",
        description: "管理员创建新的选秀比赛",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "name",
                  "ruleSet",
                  "playerTokens",
                  "maxPokemonPerPlayer",
                  "draftMode",
                ],
                properties: {
                  name: { type: "string", description: "比赛名称" },
                  ruleSet: { type: "string", description: "规则集 ID" },
                  playerTokens: {
                    type: "number",
                    description: "每名选手的初始代币",
                  },
                  maxPokemonPerPlayer: {
                    type: "number",
                    description: "每名选手最多选择的宝可梦数量",
                  },
                  draftMode: {
                    type: "string",
                    enum: ["SNAKE", "AUCTION"],
                    description: "选秀模式",
                  },
                  playerIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "参赛选手 ID 列表",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "比赛创建成功" },
          400: { description: "请求参数错误" },
          401: { description: "未授权" },
        },
      },
    },
    "/api/admin/contests/{id}": {
      get: {
        tags: ["Admin"],
        summary: "获取比赛详情",
        description: "管理员获取指定比赛的详细信息",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "比赛 ID",
          },
        ],
        responses: {
          200: { description: "成功返回比赛详情" },
          404: { description: "比赛不存在" },
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "删除比赛",
        description: "管理员删除指定比赛",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "比赛 ID",
          },
        ],
        responses: {
          200: { description: "比赛删除成功" },
          404: { description: "比赛不存在" },
        },
      },
    },
    "/api/admin/contests/{id}/start-draft": {
      post: {
        tags: ["Admin"],
        summary: "开始选秀",
        description: "管理员开始指定比赛的选秀流程",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "比赛 ID",
          },
        ],
        responses: {
          200: { description: "选秀开始成功" },
          400: { description: "无法开始选秀（状态不满足）" },
          404: { description: "比赛不存在" },
        },
      },
    },
    "/api/admin/contests/{id}/control": {
      post: {
        tags: ["Admin"],
        summary: "比赛控制",
        description: "管理员控制比赛（暂停、继续、下一轮等）",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "比赛 ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: {
                    type: "string",
                    enum: ["PAUSE", "RESUME", "NEXT_ROUND", "SKIP_PLAYER"],
                    description: "控制动作",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "操作成功" },
          400: { description: "操作失败" },
        },
      },
    },
    "/api/player/login": {
      post: {
        tags: ["Player", "Auth"],
        summary: "选手登录",
        description: "选手通过 accessKey 登录获取 token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accessKey"],
                properties: {
                  accessKey: { type: "string", description: "选手访问密钥" },
                  contestId: {
                    type: "string",
                    description: "比赛 ID（可选，用于验证权限）",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "登录成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string", description: "JWT token" },
                    player: { $ref: "#/components/schemas/Player" },
                    contest: { $ref: "#/components/schemas/Contest" },
                  },
                },
              },
            },
          },
          401: { description: "无效的访问密钥" },
          403: { description: "无权访问该比赛" },
        },
      },
    },
    "/api/player/bid": {
      post: {
        tags: ["Player"],
        summary: "选手出价",
        description: "在竞价模式下对当前宝可梦进行出价",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["amount"],
                properties: {
                  amount: {
                    type: "number",
                    minimum: 1,
                    description: "出价金额",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "出价成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    newPrice: { type: "number" },
                    currentBidder: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "出价失败",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: { description: "未授权" },
          409: { description: "状态冲突（如价格已被更新）" },
          429: { description: "请求过于频繁" },
        },
      },
    },
    "/api/player/draft-pick": {
      post: {
        tags: ["Player"],
        summary: "选秀选择",
        description: "在选秀模式下选择宝可梦（Snake Draft）",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pokemonId"],
                properties: {
                  pokemonId: {
                    type: "string",
                    description: "要选择的宝可梦 ID",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "选择成功",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    pokemon: { $ref: "#/components/schemas/Pokemon" },
                  },
                },
              },
            },
          },
          400: { description: "选择失败（不在有效回合、无权限等）" },
          401: { description: "未授权" },
        },
      },
    },
    "/api/player/nominate": {
      post: {
        tags: ["Player"],
        summary: "提名宝可梦",
        description: "在竞价模式中提名一只宝可梦开始竞价",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pokemonId"],
                properties: {
                  pokemonId: {
                    type: "string",
                    description: "要提名的宝可梦 ID",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "提名成功" },
          400: { description: "提名失败" },
          401: { description: "未授权" },
        },
      },
    },
    "/api/contests/{id}/stream": {
      get: {
        tags: ["Contest"],
        summary: "比赛状态流",
        description: "Server-Sent Events 流式获取比赛实时状态",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "比赛 ID",
          },
        ],
        responses: {
          200: {
            description: "成功建立 SSE 连接",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                  format: "text/event-stream",
                },
              },
            },
          },
          401: { description: "未授权" },
          404: { description: "比赛不存在" },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["Contest"],
        summary: "健康检查",
        description: "检查服务健康状态",
        responses: {
          200: { description: "服务正常" },
          503: { description: "服务不可用" },
        },
      },
    },
    "/api/version": {
      get: {
        tags: ["Contest"],
        summary: "版本信息",
        description: "获取当前 API 版本信息",
        responses: {
          200: {
            description: "成功返回版本信息",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    version: { type: "string" },
                    name: { type: "string" },
                    timestamp: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Contest: {
        type: "object",
        properties: {
          id: { type: "string", description: "比赛 ID" },
          name: { type: "string", description: "比赛名称" },
          status: {
            type: "string",
            enum: ["DRAFTING", "PAUSED", "COMPLETED"],
            description: "比赛状态",
          },
          ruleSet: { type: "string", description: "规则集" },
          draftMode: {
            type: "string",
            enum: ["SNAKE", "AUCTION"],
            description: "选秀模式",
          },
          currentRound: { type: "number", description: "当前轮次" },
          currentTurn: { type: "number", description: "当前回合" },
          playerTokens: { type: "number", description: "每名选手初始代币" },
          maxPokemonPerPlayer: {
            type: "number",
            description: "每名选手最多选择数量",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "创建时间",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "更新时间",
          },
        },
      },
      Player: {
        type: "object",
        properties: {
          id: { type: "string", description: "选手 ID" },
          username: { type: "string", description: "选手名称" },
          tokens: { type: "number", description: "剩余代币" },
          ownedPokemon: {
            type: "array",
            items: { $ref: "#/components/schemas/Pokemon" },
            description: "拥有的宝可梦",
          },
          turnOrder: { type: "number", description: "选秀顺序" },
        },
      },
      Pokemon: {
        type: "object",
        properties: {
          id: { type: "string", description: "宝可梦 ID" },
          name: { type: "string", description: "名称" },
          form: { type: "string", description: "形态" },
          spriteUrl: { type: "string", description: "精灵图片 URL" },
          types: {
            type: "array",
            items: { type: "string" },
            description: "属性",
          },
          stats: {
            type: "object",
            properties: {
              hp: { type: "number" },
              attack: { type: "number" },
              defense: { type: "number" },
              specialAttack: { type: "number" },
              specialDefense: { type: "number" },
              speed: { type: "number" },
            },
          },
          abilities: { type: "array", items: { type: "string" } },
          basePrice: { type: "number", description: "基础价格" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "用户友好的错误信息" },
          code: { type: "string", description: "错误码" },
          reason: { type: "string", description: "技术原因" },
          suggestion: { type: "string", description: "给用户的建议" },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "错误发生时间",
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT Token 认证",
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openapiSpec);
}
