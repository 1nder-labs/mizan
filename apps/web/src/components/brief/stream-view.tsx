/**
 * Pure rendering of the live workflow output — step progress, tool
 * cards, brief markdown, and a single deduplicated error alert.
 *
 * Error dedupe: the AI SDK 6 transport surfaces stream failures
 * through both the `error` object and an `error-text` part inside
 * `view.errorText`. Rendering both produces two identical destructive
 * alerts. The fatal-vs-stream priority is fatal first, fall back to
 * the streamed error text only when they differ.
 */
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { BriefCopy } from "./copy.tsx";
import { ExtractionCard } from "./extraction-card.tsx";
import { StepProgress } from "./step-progress.tsx";
import type { FoldedStream } from "./stream-parts.ts";

interface BriefStreamViewProps {
  readonly view: FoldedStream;
  readonly fatalMessage: string | null;
}

function StreamError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertTitle>Brief stream failed</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function pickErrorMessage(fatalMessage: string | null, errorText: string | null): string | null {
  if (fatalMessage && errorText && fatalMessage === errorText) return fatalMessage;
  return fatalMessage ?? errorText;
}

export function BriefStreamView({ view, fatalMessage }: BriefStreamViewProps): React.JSX.Element {
  const errorMessage = pickErrorMessage(fatalMessage, view.errorText);
  return (
    <div className="space-y-4">
      <StepProgress steps={view.steps} />
      {view.tools.length > 0 ? (
        <div className="space-y-2">
          {view.tools.map((tool) => (
            <ExtractionCard key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}
      <BriefCopy markdown={view.text} />
      {errorMessage ? <StreamError message={errorMessage} /> : null}
    </div>
  );
}
