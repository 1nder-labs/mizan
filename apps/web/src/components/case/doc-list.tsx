/**
 * R2 document list card. Renders the per-case attachment surface.
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
