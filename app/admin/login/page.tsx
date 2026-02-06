'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/app/lib/api/fetch'
import AuthLayout from '@/app/components/AuthLayout'
import {
  AuthInput,
  AuthButton,
  BackButton,
} from '@/app/components/AuthComponents'

export default function AdminLogin() {
  useEffect(() => {
    document.title = '宝可梦选秀系统-管理员登录'
  }, [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        router.push('/admin/dashboard')
      } else {
        const data = await res.json()
        setError(
          data.error === 'Invalid credentials'
            ? '账号或密码错误'
            : data.error || '登录失败',
        )
      }
    } catch (err) {
      setError('网络连接异常')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="animate-in fade-in slide-in-from-bottom-4 relative w-full max-w-md duration-500">
        <BackButton />

        <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl">
          <div className="relative">
            <div className="mb-10 text-center">
              <h1 className="mb-2 bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-400 bg-clip-text text-4xl font-black text-transparent">
                管理员登录
              </h1>
              <p className="text-sm text-gray-400">
                请输入系统管理员凭据以继续
              </p>
            </div>

            {error && (
              <div className="mb-6 flex items-center rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-400">
                <svg
                  className="mr-2 h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="mb-2 block pl-1 text-xs font-bold tracking-widest text-gray-500 uppercase">
                  用户名
                </label>
                <AuthInput
                  type="text"
                  placeholder="请输入管理员账号"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block pl-1 text-xs font-bold tracking-widest text-gray-500 uppercase">
                  密码
                </label>
                <AuthInput
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <AuthButton
                type="submit"
                isLoading={loading}
                loadingText="正在验证..."
                gradient="brand"
              >
                立即登录
              </AuthButton>
            </form>

            <p className="mt-8 text-center text-xs leading-loose text-gray-500">
              忘记密码或无法访问？
              <br />
              请联系系统开发者重置数据库。
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
