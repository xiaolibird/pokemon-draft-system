import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './styles/globals.css'
import './styles/pokemonicons.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: '宝可梦选秀系统',
  description: '为竞技玩家设计的专业选秀管理平台',
}

import { ThemeProvider } from '@/app/lib/contexts/theme'
import { VersionChecker } from '@/app/components/VersionChecker'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 注入构建版本号到客户端（从环境变量）
  const buildVersion =
    process.env.BUILD_VERSION || process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          httpEquiv="Cache-Control"
          content="no-store, no-cache, max-age=0, must-revalidate"
        />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__BUILD_VERSION__ = "${buildVersion}";`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          {children}
          <VersionChecker />
        </ThemeProvider>
      </body>
    </html>
  )
}
