/**
 * Campaign story panel — editorial treatment that puts source text
 * front-and-center. Organizer name surfaces top-right; story body
 * carries a soft left rule so the eye locks onto it; vouching
 * narrative is a secondary card with a "Read more" toggle when long.
 */
import { useState } from "react";
import { ScrollText, Sparkles } from "lucide-react";
import type { CaseOverlay } from "@mizan/shared";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { COPY } from "@/lib/copy-constants.ts";

const VOUCHING_COLLAPSE_THRESHOLD = 400;

interface StoryPanelProps {
  readonly overlay: CaseOverlay | null;
}

function StoryEmpty(): React.JSX.Element {
  return (
    <Card className="border-border/70 bg-card/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="size-4 text-muted-foreground" />
          {COPY.story.panelTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{COPY.story.panelEmpty}</p>
      </CardContent>
    </Card>
  );
}

function VouchingBlock({ narrative }: { readonly narrative: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = narrative.length > VOUCHING_COLLAPSE_THRESHOLD;
  const visible =
    expanded || !needsToggle ? narrative : `${narrative.slice(0, VOUCHING_COLLAPSE_THRESHOLD)}…`;
  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <Sparkles className="size-3" />
        {COPY.story.vouchingLabel}
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
        {visible}
      </p>
      {needsToggle ? (
        <Button
          variant="link"
          size="sm"
          className="px-0 text-[11px] uppercase tracking-wider"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? COPY.story.readLess : COPY.story.readMore}
        </Button>
      ) : null}
    </div>
  );
}

export function StoryPanel({ overlay }: StoryPanelProps): React.JSX.Element {
  if (!overlay) return <StoryEmpty />;
  return (
    <Card className="border-border/70 bg-card/80 shadow-elev-1">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="size-4 text-muted-foreground" />
          {COPY.story.panelTitle}
        </CardTitle>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {COPY.story.organizerLabel}
          </p>
          <p className="text-sm font-medium text-foreground">{overlay.organizer_name}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-l-2 border-foreground/15 pl-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {COPY.story.storyLabel}
          </p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {overlay.story}
          </p>
        </div>
        {overlay.vouching_narrative ? <VouchingBlock narrative={overlay.vouching_narrative} /> : null}
      </CardContent>
    </Card>
  );
}
