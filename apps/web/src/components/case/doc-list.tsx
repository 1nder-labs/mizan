/**
 * R2 document list card. PRD §6 Phase 6 plan U9 lists this as in-scope
 * but the `documents` table + ingestion endpoint land later
 * (`docs/prd.md` Phase 7 audit + ingestion stack). This component
 * holds the visual slot today so the case-detail layout is the final
 * shape; once the API exposes per-case attachments the empty state
 * swaps for the data list without touching the layout.
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
      <CardContent>
        <p className="text-xs text-muted-foreground">
          No documents attached to <span className="font-mono tabular">{caseId.slice(0, 8)}</span>.
        </p>
      </CardContent>
    </Card>
  );
}
