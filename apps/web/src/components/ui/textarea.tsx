import { cn } from "@/lib/utils.ts";

type TextareaProps = React.ComponentProps<"textarea">;

export function Textarea({ className, ...props }: TextareaProps): React.JSX.Element {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
