import * as React from "react";
import { cn } from "./utils";

type InputSize = "sm" | "md" | "lg";

interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: InputSize;
}

const sizeClasses: Record<InputSize, string> = {
  // hanya tinggi & ukuran font (tanpa padding!)
  sm: "h-10 text-sm placeholder:text-sm",
  md: "h-11 text-base placeholder:text-base",
  lg: "h-12 text-base placeholder:text-base",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", size = "md", ...props }, ref) => {
    // kalau tidak ada padding kustom, beri padding default
    const hasCustomPadding =
      !!className && (className.includes("pl-") || className.includes("px-") || className.includes("pr-"));
    const defaultPadding = hasCustomPadding ? "" : "px-4";

    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-input-background",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
          "outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          sizeClasses[size],
          defaultPadding,
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
export { Input };
