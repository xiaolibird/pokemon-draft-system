import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 font-sans text-white">
      <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

      {/* Decorative Blur Blobs */}
      <div className="pointer-events-none absolute top-[-10%] left-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-blue-600/20 blur-[120px]"></div>
      <div
        className="pointer-events-none absolute right-[-10%] bottom-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-emerald-600/20 blur-[120px]"
        style={{ animationDelay: "2s" }}
      ></div>

      <main className="relative z-10 flex w-full flex-col items-center justify-center p-4 md:p-8">
        {children}
      </main>

      <footer className="absolute bottom-4 z-10 text-sm tracking-wide text-slate-500">
        POKÉMON DRAFT SYSTEM &bull; 2026 &bull; 对战管理专家
      </footer>
    </div>
  );
}
