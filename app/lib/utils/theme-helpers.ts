export interface BidTheme {
  name: string;
  color: string;
  bgGradient: string;
  border: string;
  text: string;
  badge: string;
  img?: string;
  imgPos?: string;
  mainText?: string;
}

export function getBidActionTheme(
  actionType: string,
  isHighestBid: boolean,
  pokemonName?: string,
  details?: any,
): BidTheme {
  switch (actionType) {
    case "BID":
      return isHighestBid
        ? {
            name: "最高出价",
            color: "amber",
            bgGradient:
              "bg-gradient-to-r from-yellow-300/80 via-amber-400/70 to-orange-400/80 dark:from-yellow-500/60 dark:via-amber-500/50 dark:to-orange-500/60",
            border: "border-yellow-400/50 dark:border-yellow-500/50",
            text: "text-amber-900 dark:text-amber-100",
            badge: "text-amber-800 dark:text-amber-200/90",
            img: "/images/gholdengo-bg.webp",
            imgPos: "left 20% top 15%",
          }
        : {
            name: "出价",
            color: "blue",
            bgGradient:
              "bg-gradient-to-r from-blue-300/60 via-blue-400/50 to-indigo-400/60 dark:from-blue-600/40 dark:via-blue-500/30 dark:to-indigo-500/40",
            border: "border-blue-300/30 dark:border-blue-500/30",
            text: "text-blue-900 dark:text-blue-100",
            badge: "text-blue-800 dark:text-blue-200/80",
            img: "/images/999Gimmighoul.webp",
            imgPos: "left 80% top 30%",
          };
    case "PICK":
      return {
        name: "获得",
        color: "emerald",
        bgGradient:
          "bg-gradient-to-r from-emerald-300/60 via-teal-400/50 to-cyan-400/60 dark:from-emerald-600/40 dark:via-teal-500/30 dark:to-cyan-500/40",
        border: "border-emerald-300/30 dark:border-emerald-500/30",
        text: "text-emerald-900 dark:text-emerald-100",
        badge: "text-emerald-800 dark:text-emerald-200/80",
        mainText: pokemonName,
      };
    case "NOMINATE":
      return {
        name: "提名",
        color: "indigo",
        bgGradient:
          "bg-gradient-to-r from-indigo-300/50 via-indigo-400/40 to-violet-400/50 dark:from-indigo-600/30 dark:via-indigo-700/20 dark:to-violet-700/30",
        border:
          "border-indigo-300/40 dark:border-indigo-600/40 shadow-indigo-500/5",
        text: "text-indigo-900 dark:text-indigo-100",
        badge:
          "text-indigo-800 bg-white/40 dark:text-indigo-200/80 dark:bg-black/30",
        mainText: pokemonName,
      };
    case "ADMIN_UNDO":
      return {
        name: "撤销",
        color: "rose",
        bgGradient:
          "bg-gradient-to-r from-rose-300/50 via-pink-400/40 to-red-400/50 dark:from-rose-600/30 dark:via-pink-600/20 dark:to-red-700/30",
        border: "border-rose-300/40 dark:border-rose-600/40 shadow-rose-500/5",
        text: "text-rose-900 dark:text-rose-100",
        badge:
          "text-rose-800 bg-white/40 dark:text-rose-200/80 dark:bg-black/30",
        mainText: pokemonName || "上一步",
      };
    default:
      let defaultName = "系统";
      if (actionType === "ADMIN_PAUSE") defaultName = "暂停比赛";
      if (actionType === "ADMIN_RESUME") defaultName = "恢复比赛";
      if (actionType === "ADMIN_SKIP") defaultName = `跳过选手`;
      if (actionType === "NOMINATE_SKIP") defaultName = "超时跳过";

      return {
        name: defaultName,
        color: "gray",
        bgGradient:
          "bg-gradient-to-r from-gray-300/40 via-slate-400/30 to-gray-400/40 dark:from-gray-600/30 dark:via-slate-500/20 dark:to-gray-500/30",
        border: "border-gray-300/30 dark:border-gray-500/30",
        text: "text-slate-900 dark:text-slate-100",
        badge:
          "text-slate-800 bg-white/40 dark:text-slate-200/80 dark:bg-black/30",
        mainText:
          actionType === "ADMIN_SKIP"
            ? details?.skippedUsername || "当前玩家"
            : "",
      };
  }
}
