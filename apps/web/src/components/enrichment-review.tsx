import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  triggerEnrichmentServerFn,
  getEnrichmentDataServerFn,
  applyEnrichmentServerFn,
} from "~/lib/server-fns/enrichment";

interface ExternalLink {
  id: string;
  provider: string;
  externalId: string;
  metadata: Record<string, unknown>;
  lastSyncedAt: string;
}

interface EnrichmentReviewProps {
  workId: string;
  currentDescription: string | null;
}

export function EnrichmentReview({ workId, currentDescription }: EnrichmentReviewProps) {
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<ExternalLink[] | null>(null);
  const [applied, setApplied] = useState(false);

  const handleEnrich = async () => {
    setLoading(true);
    setApplied(false);
    await triggerEnrichmentServerFn({ data: { workId } });
    const result = await getEnrichmentDataServerFn({ data: { workId } });
    setLinks(result.externalLinks as unknown as ExternalLink[]);
    setLoading(false);
  };

  const handleApplyDescription = async (description: string) => {
    await applyEnrichmentServerFn({
      data: { workId, fields: { description } },
    });
    setApplied(true);
  };

  const firstLink = links?.[0];
  const enrichedDescription = firstLink?.metadata.description as string | undefined;

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => { void handleEnrich(); }}
        disabled={loading}
      >
        {loading ? "Enriching..." : "Enrich Metadata"}
      </Button>

      {links !== null && links.length === 0 && (
        <p className="text-sm text-muted-foreground">No enrichment data found</p>
      )}

      {applied && (
        <p className="text-sm text-green-600">Applied successfully</p>
      )}

      {firstLink && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{firstLink.provider}</Badge>
              <span className="text-muted-foreground">{firstLink.externalId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {enrichedDescription && (
              <div className="space-y-1">
                <p className="font-medium">Description</p>
                <p className="text-muted-foreground">{enrichedDescription}</p>
                {enrichedDescription !== currentDescription && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void handleApplyDescription(enrichedDescription); }}
                  >
                    Apply Description
                  </Button>
                )}
              </div>
            )}
            {Object.entries(firstLink.metadata)
              .filter(([key]) => key !== "description")
              .map(([key, value]) => (
                <div key={key}>
                  <span className="font-medium">{key}: </span>
                  <span className="text-muted-foreground">{JSON.stringify(value)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
