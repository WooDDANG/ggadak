import { createHash } from 'node:crypto';
import type { Decision } from '@ggaddak/shared';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AppError, BadRequestError } from '../errors/AppError.js';
import { toV1Decision, V1DecisionDto } from '../dto/v1-decision.dto.js';

export interface EmbeddingProvider {
  model: string;
  embed(text: string): Promise<number[]>;
}
export interface SearchResult {
  decision: V1DecisionDto;
  score: number;
  excerpt: string;
  sourceUrl: string | null;
}
export interface SearchResponse {
  items: SearchResult[];
}

/** Production embeddings are never replaced by lexical/heuristic vectors after failure. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  async embed(input: string): Promise<number[]> {
    if ((process.env.EMBEDDING_PROVIDER ?? 'openai') !== 'openai')
      throw new AppError('Unsupported embedding provider', 503);
    if (!process.env.OPENAI_API_KEY)
      throw new AppError('Embedding provider is not configured', 503);
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: this.model, input }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('provider rejected embedding');
      return ((await response.json()) as { data: { embedding: number[] }[] }).data[0].embedding;
    } catch {
      throw new AppError('Embedding provider unavailable; retry the search', 503);
    }
  }
}
function valid(vector: number[]): number[] {
  if (
    !Array.isArray(vector) ||
    !vector.length ||
    vector.some(n => !Number.isFinite(n)) ||
    !vector.some(n => n !== 0)
  )
    throw new AppError('Embedding provider returned an invalid vector', 503);
  return vector;
}
function cosine(a: number[], b: number[]) {
  if (a.length !== b.length)
    throw new AppError('Embedding dimensions changed; rebuild the index', 503);
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, n, i) => sum + n * b[i], 0) /
        Math.sqrt(a.reduce((s, n) => s + n * n, 0) * b.reduce((s, n) => s + n * n, 0)),
    ),
  );
}
function document(d: Decision) {
  return [
    d.title ?? d.topic,
    d.decisionContent ?? d.decision,
    d.rationaleSummary ?? d.rationale,
    d.rationale,
    ...d.rationaleQuotes.map(q => (typeof q === 'string' ? q : JSON.stringify(q))),
    d.rawTranscript ?? '',
    ...d.source.rawMessages.map(m => m.content),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 16000);
}
/** SQLite stores reusable vectors. Live guild/state filtering and a content digest prevent stale results. */
export class SearchService {
  constructor(
    private repo: DecisionRepository,
    private provider: EmbeddingProvider = new OpenAIEmbeddingProvider(),
  ) {}
  private async embed(text: string) {
    try {
      return valid(await this.provider.embed(text));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Embedding provider unavailable; retry the search', 503);
    }
  }
  async backfill(guildId?: string): Promise<{ indexed: number }> {
    const decisions = (await this.repo.getDecisions({ guildId })).filter(d =>
      ['Decided', 'Superseded'].includes(d.state),
    );
    for (const d of decisions) await this.index(d);
    return { indexed: decisions.length };
  }
  private async index(d: Decision) {
    const content = document(d);
    const contentHash = createHash('sha256').update(content).digest('hex');
    const stored = await this.repo.prisma.decisionEmbedding.findUnique({
      where: { decisionId: d.id },
    });
    if (stored?.model === this.provider.model && stored.contentHash === contentHash)
      return valid(JSON.parse(stored.vectorJson));
    const vector = await this.embed(content);
    // A concurrent edit must not publish an obsolete embedding as current.
    await this.repo.prisma.$transaction(async tx => {
      const live = await tx.decision.findUnique({ where: { id: d.id } });
      if (
        !live ||
        createHash('sha256')
          .update(document(this.repo.decodeDecision(live)))
          .digest('hex') !== contentHash
      )
        return;
      await tx.decisionEmbedding.upsert({
        where: { decisionId: d.id },
        create: {
          decisionId: d.id,
          model: this.provider.model,
          contentHash,
          vectorJson: JSON.stringify(vector),
        },
        update: { model: this.provider.model, contentHash, vectorJson: JSON.stringify(vector) },
      });
    });
    return vector;
  }
  async search(guildId: string, query: string, limit = 10): Promise<SearchResponse> {
    if (!query.trim() || query.length > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestError('query must contain 1–1000 characters; limit must be 1–50');
    const queryVector = await this.embed(query.trim());
    const candidates = (await this.repo.getDecisions({ guildId })).filter(d =>
      ['Decided', 'Superseded'].includes(d.state),
    );
    const items: SearchResult[] = [];
    for (const d of candidates) {
      const vector = await this.index(d);
      // Re-read at the API boundary so a concurrent discard/edit cannot expose stale evidence.
      const current = await this.repo.getDecisionById(d.id);
      if (
        !current ||
        current.source.guildId !== guildId ||
        !['Decided', 'Superseded'].includes(current.state) ||
        document(current) !== document(d)
      )
        continue;
      const score = cosine(queryVector, vector);
      if (score <= 0) continue;
      items.push({
        decision: toV1Decision(current),
        score,
        excerpt: (current.rationaleSummary ?? current.rationale ?? document(current)).slice(0, 500),
        sourceUrl: current.source.messageUrl ?? null,
      });
    }
    return {
      items: items
        .sort((a, b) => b.score - a.score || a.decision.id.localeCompare(b.decision.id))
        .slice(0, limit),
    };
  }
}
