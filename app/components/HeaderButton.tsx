import { ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "purple"
  | "link";
type ButtonSize = "sm" | "md" | "lg";

interface BaseButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  colorScheme?: "admin" | "player";
}

interface ButtonProps
  extends
    BaseButtonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  as?: "button";
  children: ReactNode;
}

interface LinkButtonProps
  extends
    BaseButtonProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  as: "link";
  href: string;
  children: ReactNode;
}

type HeaderButtonProps = ButtonProps | LinkButtonProps;

export function HeaderButton(props: HeaderButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon,
    children,
    colorScheme = "admin",
    className = "",
    ...rest
  } = props;

  const sizeClasses = {
    sm: "px-2 py-1 text-[10px] md:px-3 md:py-1.5 md:text-xs",
    md: "px-3 py-1.5 text-xs md:px-4 md:py-2 md:text-sm",
    lg: "px-4 py-2 text-sm md:px-6 md:py-2.5 md:text-base",
  };

  const variantClasses = {
    admin: {
      primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm",
      secondary: "bg-gray-600 hover:bg-gray-700 text-white shadow-sm",
      success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
      danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
      warning: "bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm",
      purple: "bg-purple-600 hover:bg-purple-700 text-white shadow-sm",
      link: "text-gray-400 hover:text-red-500 px-0 py-0",
    },
    player: {
      primary: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
      secondary: "bg-gray-600 hover:bg-gray-700 text-white shadow-sm",
      success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
      danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
      warning: "bg-yellow-500 hover:bg-yellow-600 text-white shadow-sm",
      purple: "bg-purple-600 hover:bg-purple-700 text-white shadow-sm",
      link: "text-gray-400 hover:text-red-500 px-0 py-0",
    },
  };

  const baseClasses =
    variant === "link"
      ? "font-bold transition"
      : "rounded-lg font-bold transition flex items-center gap-2";

  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[colorScheme][variant]} ${className}`;

  if (props.as === "link") {
    const { as, href, colorScheme: _, ...linkRest } = props;
    return (
      <Link href={href} className={combinedClasses} {...(linkRest as any)}>
        {icon}
        {children}
      </Link>
    );
  }

  const { as, colorScheme: _, ...buttonRest } = props as ButtonProps;
  return (
    <button className={combinedClasses} {...buttonRest}>
      {icon}
      {children}
    </button>
  );
}
