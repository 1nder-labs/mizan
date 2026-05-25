/**
 * R2 document list card. Holds the per-case attachment surface.
 * Today the documents endpoint is not yet wired into the reviewer UI;
 * to avoid implying that the system has *checked* attachments and
 * found none, the card explicitly says the surface is not connected.
 * When the documents query lands, this component swaps to that data
 * source without touching the layout.
 */
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export function CaseDocList({ caseId }: { readonly caseId: string }): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-muted-foreground" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Document attachments aren't surfaced here yet. The campaign object on file is{" "}
          <span className="font-mono tabular">{caseId.slice(0, 8)}</span>.
        </p>
      </CardContent>
    </Card>
  );
}
