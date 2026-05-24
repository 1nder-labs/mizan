/**
 * Brief copy panel — renders streaming markdown from the workflow's
 * final `text` part. Reuses the safe `Markdown` wrapper.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Markdown } from "@/lib/markdown.tsx";

export function BriefCopy({ markdown }: { readonly markdown: string }): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Brief</CardTitle>
      </CardHeader>
      <CardContent>
        {markdown.length === 0 ? (
          <p className="text-xs text-muted-foreground">Composing brief…</p>
        ) : (
          <Markdown>{markdown}</Markdown>
        )}
      </CardContent>
    </Card>
  );
}
