import Link from 'next/link'
import AuthLayout from '@/app/components/AuthLayout'

export default function Home() {
  const buildVersion =
    process.env.BUILD_VERSION || process.env.NEXT_PUBLIC_BUILD_VERSION || 'dev'
  return (
    <AuthLayout>
      <div className="animate-in fade-in zoom-in relative mx-4 flex w-full max-w-4xl flex-col items-center rounded-3xl border border-white/10 bg-white/5 p-12 shadow-2xl backdrop-blur-xl duration-500">
        <div className="mb-4 flex items-center justify-center gap-4">
          <h1 className="bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-400 bg-clip-text text-6xl font-black text-transparent drop-shadow-sm">
            宝可梦选秀系统
          </h1>
          <span className="mt-2 self-start rounded-lg border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-xs font-bold tracking-widest text-blue-300 uppercase">
            {buildVersion}
          </span>
        </div>

        <p className="mb-12 h-6 max-w-md text-center text-lg text-slate-400"></p>

        <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
          {/* Admin Entry - Image on LEFT */}
          <div className="group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/5 bg-black/40 p-8 transition-all duration-500 hover:border-blue-500/50 hover:shadow-[0_0_50px_rgba(59,130,246,0.3)]">
            {/* Background Image Container */}
            <div className="pointer-events-none absolute inset-0 z-0">
              {/* Image: Only visible in Top-Left (Quadrant 2) - Radial Mask */}
              <div
                className="absolute inset-0 bg-cover bg-no-repeat transition-all duration-700 ease-out group-hover:scale-110 group-hover:brightness-125"
                style={{
                  backgroundImage: "url('/images/indeedee.webp')",
                  backgroundPosition: 'top -20px left -20px', // Manual offset
                  maskImage:
                    'radial-gradient(circle at top left, black 0%, transparent 60%)',
                  WebkitMaskImage:
                    'radial-gradient(circle at top left, black 0%, transparent 60%)',
                  transformOrigin: 'top left',
                }}
              ></div>
              {/* Background Color Overlay for integration */}
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-slate-900/40 to-slate-900/90"></div>
            </div>

            <div className="relative z-10 mb-6 rounded-2xl bg-blue-600/20 p-4 transition-all duration-500 group-hover:scale-110 group-hover:bg-blue-600/30">
              <svg
                className="h-8 w-8 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </div>
            <h2 className="relative z-10 mb-3 text-2xl font-black tracking-tight">
              管理员入口
            </h2>
            <p className="relative z-10 mb-8 text-center text-sm leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">
              创建比赛 管理选手 实时监控比赛状态
            </p>
            <Link
              href="/admin/login"
              className="relative z-10 w-full rounded-2xl bg-blue-600 py-4 text-center font-black shadow-xl shadow-blue-900/40 transition-all duration-300 hover:-translate-y-1 hover:bg-blue-500 active:scale-95"
            >
              进入管理后台
            </Link>
          </div>

          {/* Player Entry - Image on RIGHT */}
          <div className="group relative flex flex-col items-center overflow-hidden rounded-3xl border border-white/5 bg-black/40 p-8 transition-all duration-500 hover:border-emerald-500/50 hover:shadow-[0_0_50px_rgba(16,185,129,0.3)]">
            {/* Background Image Container */}
            <div className="pointer-events-none absolute inset-0 z-0">
              {/* Image: Only visible in Top-Right (Quadrant 1) - Radial Mask */}
              <div
                className="absolute inset-0 bg-cover bg-no-repeat transition-all duration-700 ease-out group-hover:scale-110 group-hover:brightness-125"
                style={{
                  backgroundImage: "url('/images/ogerpon.webp')",
                  backgroundPosition: 'top -20px right -20px', // Manual offset using background-position
                  maskImage:
                    'radial-gradient(circle at top right, black 0%, transparent 60%)',
                  WebkitMaskImage:
                    'radial-gradient(circle at top right, black 0%, transparent 60%)',
                  transformOrigin: 'top right',
                }}
              ></div>
              {/* Background Color Overlay for integration */}
              <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-slate-900/40 to-slate-900/90"></div>
            </div>

            <div className="relative z-10 mb-6 rounded-2xl bg-emerald-600/20 p-4 transition-all duration-500 group-hover:scale-110 group-hover:bg-emerald-600/30">
              <svg
                className="h-8 w-8 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h2 className="relative z-10 mb-3 text-2xl font-black tracking-tight">
              选手入口
            </h2>
            <p className="relative z-10 mb-8 text-center text-sm leading-relaxed text-slate-400 transition-colors group-hover:text-slate-300">
              使用邀请密钥快速加入比赛 参与实时竞价
            </p>
            <Link
              href="/player/login"
              className="relative z-10 w-full rounded-2xl bg-emerald-600 py-4 text-center font-black shadow-xl shadow-emerald-900/40 transition-all duration-300 hover:-translate-y-1 hover:bg-emerald-500 active:scale-95"
            >
              加入比赛房间
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
