/**
 * Brief detail tabs — missing docs, reviewer questions, policy
 * citations, drafted organizer message. Each tab renders a list or
 * a single composed message; missing tabs collapse to a one-line
 * empty state.
 *
 * Keys derive from `(index, content-slice)`. The brief payload is
 * frozen at `composeBrief` write time and never mutated, reordered,
 * or inserted-into on the client — exactly the static-immutable case
 * that React's "Rules of keys" doc sanctions:
 *   "As a last resort, you can pass an array's index as a key.
 *    This can work well if the items are never reordered."
 * The content-slice suffix is belt-and-braces against duplicate
 * payload entries (two missing-docs with the same docType + reason),
 * still indexed-anchored so deterministic across renders.
 *
 * Each tab panel is wrapped in `TabBoundary` so a render error in
 * one tab surfaces as a destructive Alert in that tab only, not a
 * white-screen for the whole case-detail surface (React docs:
 * "Catching rendering errors with an error boundary").
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { BriefPayload } from "@mizan/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { CitationChip } from "./citation-chip.tsx";
import { wrapCitations } from "./citation-wrap.tsx";

interface TabBoundaryState {
  readonly error: Error | null;
}

class TabBoundary extends Component<{ readonly children: ReactNode }, TabBoundaryState> {
  override state: TabBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[brief-tabs] render error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn't render this section</AlertTitle>
          <AlertDescription>{this.state.error.message}</AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

function BulletList({ items }: { readonly items: readonly string[] }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">None.</p>;
  }
  return (
    <ul className="space-y-2 text-sm text-foreground">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function MissingDocsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  const items = payload.missing_docs.map((doc) => `${doc.docType} — ${doc.reason}`);
  return <BulletList items={items} />;
}

function ReviewerQuestionsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  return <BulletList items={payload.reviewer_questions.map((q) => q.question)} />;
}

function PolicyCitationsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  if (payload.policy_citations.length === 0) {
    return <p className="text-xs text-muted-foreground">{COPY.citations.listEmpty}</p>;
  }
  return (
    <ul className="space-y-3 text-sm">
      {payload.policy_citations.map((citation) => (
        <li key={citation.clauseId} className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <CitationChip clauseId={citation.clauseId} source={citation.source} />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              relevance{" "}
              <span className="font-numeric">{(citation.relevance * 100).toFixed(0)}%</span>
            </span>
          </div>
          <p className="mt-2 text-foreground">
            {wrapCitations(citation.excerpt, payload.policy_citations)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function OrganizerMessageTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  const message = payload.drafted_organizer_message;
  if (!message) {
    return <p className="text-xs text-muted-foreground">No drafted message.</p>;
  }
  return (
    <article className="space-y-3 text-sm text-foreground">
      <p className="whitespace-pre-wrap leading-relaxed text-foreground">{message.message}</p>
      {message.missing_items.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Missing items referenced
          </p>
          <BulletList items={message.missing_items} />
        </div>
      ) : null}
    </article>
  );
}

export function BriefDetailTabs({
  payload,
}: {
  readonly payload: BriefPayload;
}): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardContent className="p-4 pt-4">
        <Tabs defaultValue="missing">
          <TabsList>
            <TabsTrigger value="missing">Missing docs ({payload.missing_docs.length})</TabsTrigger>
            <TabsTrigger value="questions">
              Questions ({payload.reviewer_questions.length})
            </TabsTrigger>
            <TabsTrigger value="policy">Policy ({payload.policy_citations.length})</TabsTrigger>
            <TabsTrigger value="message">Drafted message</TabsTrigger>
          </TabsList>
          <TabsContent value="missing" className="pt-4">
            <TabBoundary>
              <MissingDocsTab payload={payload} />
            </TabBoundary>
          </TabsContent>
          <TabsContent value="questions" className="pt-4">
            <TabBoundary>
              <ReviewerQuestionsTab payload={payload} />
            </TabBoundary>
          </TabsContent>
          <TabsContent value="policy" className="pt-4">
            <TabBoundary>
              <PolicyCitationsTab payload={payload} />
            </TabBoundary>
          </TabsContent>
          <TabsContent value="message" className="pt-4">
            <TabBoundary>
              <OrganizerMessageTab payload={payload} />
            </TabBoundary>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
