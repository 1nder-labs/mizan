import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground [&>svg]:text-muted-foreground",
        info: "border-status-info-border bg-status-info text-status-info-foreground [&>svg]:text-status-info-foreground",
        warning:
          "border-status-warning-border bg-status-warning text-status-warning-foreground [&>svg]:text-status-warning-foreground",
        success:
          "border-status-success-border bg-status-success text-status-success-foreground [&>svg]:text-status-success-foreground",
        destructive:
          "border-status-destructive-border bg-status-destructive text-status-destructive-foreground [&>svg]:text-status-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ref,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

function AlertTitle({ className, ref, ...props }: React.ComponentProps<"h5">) {
  return (
    <h5
      ref={ref}
      className={cn("mb-1 font-semibold leading-none tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ref, ...props }: React.ComponentProps<"div">) {
  return <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
