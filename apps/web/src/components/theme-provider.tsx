/**
 * Theme provider — thin wrapper around `next-themes` so the root
 * `attribute="class"` is applied consistently. Required by the Tailwind
 * v4 `@custom-variant dark (&:is(.dark *))` rule in `globals.css`.
 * `sonner.tsx` imports `useTheme` directly from `next-themes`; no
 * re-export needed here.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="mizan-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
