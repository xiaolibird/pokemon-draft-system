/**
 * 审计日志系统
 * 记录关键操作用于安全审计和问题追溯
 */

import { prisma } from '../db/prisma'

export type UserType = 'ADMIN' | 'PLAYER' | 'SYSTEM'
export type AuditStatus = 'SUCCESS' | 'FAILED' | 'DENIED'

export interface AuditLogData {
  userId?: string
  userType: UserType
  action: string
  resource?: string
  resourceId?: string
  ipAddress?: string
  userAgent?: string
  details?: any
  status: AuditStatus
}

/**
 * 获取客户端 IP
 */
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()

  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP

  return 'unknown'
}

/**
 * 记录审计日志
 */
export async function logAudit(data: AuditLogData) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        userType: data.userType,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        details: data.details,
        status: data.status,
      },
    })
  } catch (error) {
    console.error('Failed to log audit:', error)
    // 审计日志失败不应该影响主流程
  }
}

/**
 * 从 Request 创建审计日志
 */
export async function auditFromRequest(
  request: Request,
  data: Omit<AuditLogData, 'ipAddress' | 'userAgent'>,
) {
  await logAudit({
    ...data,
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })
}

/**
 * 预定义的审计操作类型
 */
export const AuditActions = {
  // 认证相关
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  PLAYER_LOGIN: 'PLAYER_LOGIN',
  PLAYER_LOGOUT: 'PLAYER_LOGOUT',

  // 比赛管理
  CREATE_CONTEST: 'CREATE_CONTEST',
  UPDATE_CONTEST: 'UPDATE_CONTEST',
  DELETE_CONTEST: 'DELETE_CONTEST',
  START_DRAFT: 'START_DRAFT',
  PAUSE_DRAFT: 'PAUSE_DRAFT',
  RESUME_DRAFT: 'RESUME_DRAFT',
  UNDO_DRAFT: 'UNDO_DRAFT',
  SKIP_DRAFT: 'SKIP_DRAFT',
  COMPLETE_DRAFT: 'COMPLETE_DRAFT',

  // 选秀操作
  DRAFT_PICK: 'DRAFT_PICK',
  NOMINATE: 'NOMINATE',
  BID: 'BID',
  FINALIZE_AUCTION: 'FINALIZE_AUCTION',

  // 交易操作
  CREATE_TRADE: 'CREATE_TRADE',
  ACCEPT_TRADE: 'ACCEPT_TRADE',
  REJECT_TRADE: 'REJECT_TRADE',

  // 系统操作
  GENERATE_TOKENS: 'GENERATE_TOKENS',
  UPDATE_PRICE_TIERS: 'UPDATE_PRICE_TIERS',

  // 危险操作
  DELETE_PLAYER: 'DELETE_PLAYER',
  FORCE_UPDATE: 'FORCE_UPDATE',
} as const

/**
 * 快捷审计函数
 */
export const audit = {
  success: (action: string, data: Partial<AuditLogData> = {}) =>
    logAudit({ action, status: 'SUCCESS', userType: 'SYSTEM', ...data }),

  failed: (action: string, data: Partial<AuditLogData> = {}) =>
    logAudit({ action, status: 'FAILED', userType: 'SYSTEM', ...data }),

  denied: (action: string, data: Partial<AuditLogData> = {}) =>
    logAudit({ action, status: 'DENIED', userType: 'SYSTEM', ...data }),

  admin: (action: string, adminId: string, data: Partial<AuditLogData> = {}) =>
    logAudit({
      action,
      userId: adminId,
      userType: 'ADMIN',
      status: 'SUCCESS',
      ...data,
    }),

  player: (
    action: string,
    playerId: string,
    data: Partial<AuditLogData> = {},
  ) =>
    logAudit({
      action,
      userId: playerId,
      userType: 'PLAYER',
      status: 'SUCCESS',
      ...data,
    }),
}

/**
 * 查询审计日志
 */
export async function getAuditLogs(filters: {
  userId?: string
  action?: string
  resource?: string
  resourceId?: string
  status?: AuditStatus
  startDate?: Date
  endDate?: Date
  limit?: number
}) {
  const where: any = {}

  if (filters.userId) where.userId = filters.userId
  if (filters.action) where.action = filters.action
  if (filters.resource) where.resource = filters.resource
  if (filters.resourceId) where.resourceId = filters.resourceId
  if (filters.status) where.status = filters.status

  if (filters.startDate || filters.endDate) {
    where.timestamp = {}
    if (filters.startDate) where.timestamp.gte = filters.startDate
    if (filters.endDate) where.timestamp.lte = filters.endDate
  }

  return await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: filters.limit || 100,
  })
}
