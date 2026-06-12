import { m } from "framer-motion";
import { COPY } from "@/lib/copy-constants.ts";
import { reveal } from "@/lib/motion.ts";

const DOT_COUNT = 3;
const DOT_STAGGER_S = 0.18;
const DOT_CYCLE_S = 1.1;

/**
 * Streaming "thinking" affordance shown in the copilot thread while a turn is
 * in flight but no assistant text has rendered yet — the silent gap between
 * send and the first token (and during tool calls). It borrows the assistant
 * bubble's language (`bg-card` + `rounded-xl` + soft border) so it reads as the
 * reply taking shape, then is unmounted the instant tokens arrive. The whole
 * row fades up via the shared `reveal`; the dots pulse on a staggered opacity
 * loop, which the root `MotionConfig reducedMotion="user"` leaves gentle.
 */
export function ChatThinkingIndicator(): React.JSX.Element {
  return (
    <m.div className="flex" aria-hidden={false} {...reveal}>
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-card px-3 py-2.5"
      >
        <span className="flex items-center gap-1">
          {Array.from({ length: DOT_COUNT }, (_, index) => (
            <m.span
              key={index}
              className="size-1.5 rounded-full bg-muted-foreground"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{
                duration: DOT_CYCLE_S,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * DOT_STAGGER_S,
              }}
            />
          ))}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{COPY.chat.thinking}</span>
      </div>
    </m.div>
  );
}
