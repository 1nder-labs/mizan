/**
 * Brief detail tabs — missing docs, reviewer questions, policy
 * citations, drafted organizer message. Each tab renders a list or
 * a single composed message; missing tabs collapse to a one-line
 * empty state.
 */
import type { BriefPayload } from "@mizan/shared";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";

function BulletList({ items }: { readonly items: readonly string[] }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">None.</p>;
  }
  return (
    <ul className="space-y-2 text-sm text-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function MissingDocsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  return (
    <BulletList items={payload.missing_docs.map((doc) => `${doc.docType} — ${doc.reason}`)} />
  );
}

function ReviewerQuestionsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  return <BulletList items={payload.reviewer_questions.map((q) => q.question)} />;
}

function PolicyCitationsTab({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  if (payload.policy_citations.length === 0) {
    return <p className="text-xs text-muted-foreground">None.</p>;
  }
  return (
    <ul className="space-y-3 text-sm">
      {payload.policy_citations.map((citation) => (
        <li key={citation.clauseId} className="rounded-md border border-border/70 bg-muted/40 p-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {citation.clauseId}
          </p>
          <p className="mt-1 text-foreground">{citation.excerpt}</p>
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

export function BriefDetailTabs({ payload }: { readonly payload: BriefPayload }): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardContent className="p-4">
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
            <MissingDocsTab payload={payload} />
          </TabsContent>
          <TabsContent value="questions" className="pt-4">
            <ReviewerQuestionsTab payload={payload} />
          </TabsContent>
          <TabsContent value="policy" className="pt-4">
            <PolicyCitationsTab payload={payload} />
          </TabsContent>
          <TabsContent value="message" className="pt-4">
            <OrganizerMessageTab payload={payload} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
