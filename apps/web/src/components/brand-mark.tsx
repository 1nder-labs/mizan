import { cn } from "@/lib/utils.ts";

/**
 * The Mizan brand logo — the blue rounded-square mark served from `/public`
 * as WebP with a PNG fallback. Render size is controlled by `className`
 * (e.g. `size-9`); the intrinsic `width`/`height` keep the box reserved so
 * the image can't shift layout while it loads. The source art already carries
 * its own rounded corners and soft shadow, so no wrapper chrome is needed.
 */
export function BrandMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <picture>
      <source srcSet="/logo.webp" type="image/webp" />
      <img
        src="/logo.png"
        alt="Mizan"
        width={64}
        height={64}
        className={cn("select-none object-contain", className)}
        draggable={false}
      />
    </picture>
  );
}
