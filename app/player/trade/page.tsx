"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TradeCenter() {
  const router = useRouter();

  useEffect(() => {
    // Optional: Auto redirect after few seconds
    const timer = setTimeout(() => {
      router.push("/player/room");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-8 font-sans text-white">
      <h1 className="mb-4 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-4xl font-black text-transparent">
        功能暂时关闭
      </h1>
      <p className="mb-8 font-bold text-gray-400">
        交易中心目前处于维护或关闭状态。
      </p>
      <button
        onClick={() => router.push("/player/room")}
        className="rounded-xl bg-white/10 px-6 py-2 font-black transition hover:bg-white/20"
      >
        返回房间
      </button>
    </div>
  );
}
