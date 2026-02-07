import Link from "next/link";
import { ReactNode } from "react";

interface HeaderProps {
  variant?: "admin" | "player";
  title: string | ReactNode;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  subtitle?: ReactNode;
  transparent?: boolean;
  className?: string;
}

export function Header({
  variant = "admin",
  title,
  leftSlot,
  rightSlot,
  subtitle,
  transparent = false,
  className = "",
}: HeaderProps) {
  const baseClasses =
    "border-b px-4 md:px-8 py-3 md:py-4 flex items-center gap-3 md:gap-6 shadow-sm sticky top-0 z-50 transition-all";

  const variantClasses = {
    admin: transparent
      ? "bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200 dark:border-gray-800"
      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
    player: transparent
      ? "bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-200 dark:border-gray-800"
      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
  };

  return (
    <nav className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {leftSlot && <div className="flex-shrink-0">{leftSlot}</div>}

      <div className="flex min-w-0 flex-col">
        {typeof title === "string" ? (
          <h1 className="text-lg leading-tight font-black tracking-tight break-words whitespace-normal text-gray-800 md:text-xl lg:text-2xl dark:text-gray-100">
            {title}
          </h1>
        ) : (
          title
        )}
        {subtitle && <div className="mt-1">{subtitle}</div>}
      </div>

      {rightSlot && (
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {rightSlot}
        </div>
      )}
    </nav>
  );
}

interface BackButtonProps {
  href: string;
  title?: string;
}

export function BackButton({ href, title = "返回" }: BackButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-xl bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      title={title}
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 19l-7-7 7-7"
        />
      </svg>
    </Link>
  );
}

interface HomeButtonProps {
  href: string;
  title?: string;
}

export function HomeButton({ href, title = "主页" }: HomeButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-xl bg-gray-100 p-2 text-gray-600 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      title={title}
    >
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    </Link>
  );
}
