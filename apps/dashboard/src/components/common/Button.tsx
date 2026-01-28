import { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClasses = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400",
  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400",
  success: "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400",
};

const sizeClasses = {
  sm: "px-2 py-1 text-sm",
  md: "px-4 py-2",
  lg: "px-6 py-3 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        rounded font-medium transition-colors
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${disabled ? "cursor-not-allowed opacity-50" : ""}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
