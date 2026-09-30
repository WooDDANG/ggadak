import { Service } from 'typedi';
import { Decision, ExternalFeedback, ReviewAction } from '@ggaddak/shared';
import { PrismaService } from '../loaders/prisma.js';

@Service()
export class DecisionRepository {
  private memDecisions = new Map<string, Decision>();
  private memCheckpoints = new Map<string, string>();
  private memFeedbacks: ExternalFeedback[] = [];
  private memRejectedHashes = new Set<string>();

  constructor(private prisma?: PrismaService) {}

  // --- Checkpoints ---
  getCheckpoint(channelId: string): string | null {
    return this.memCheckpoints.get(channelId) || null;
  }

  saveCheckpoint(channelId: string, lastMessageId: string): void {
    this.memCheckpoints.set(channelId, lastMessageId);
    if (this.prisma) {
      this.prisma.channelCheckpoint
        .upsert({
          where: { channelId },
          update: { lastMessageId, updatedAt: new Date() },
          create: { channelId, lastMessageId },
        })
        .catch(() => {});
    }
  }

  // --- External Feedbacks ---
  saveFeedback(fb: ExternalFeedback): void {
    const idx = this.memFeedbacks.findIndex(f => f.id === fb.id);
    if (idx >= 0) {
      this.memFeedbacks[idx] = fb;
    } else {
      this.memFeedbacks.unshift(fb);
    }

    if (this.prisma) {
      this.prisma.externalFeedback
        .upsert({
          where: { id: fb.id },
          update: {
            source: fb.source,
            content: fb.content,
            externalUrl: fb.detail || null,
          },
          create: {
            id: fb.id,
            decisionId: fb.channelId || 'global',
            source: fb.source,
            author: fb.source,
            content: fb.content,
            externalUrl: fb.detail || null,
          },
        })
        .catch(() => {});
    }
  }

  getRecentFeedbacks(channelId?: string, limit: number = 5): ExternalFeedback[] {
    let filtered = this.memFeedbacks;
    if (channelId) {
      filtered = filtered.filter(f => f.channelId === channelId || f.channelId === 'global');
    }
    return filtered.slice(0, limit);
  }

  // --- Anti-Recreation Rejected Evidence Memory ---
  recordRejectedEvidence(evidenceHash: string): void {
    this.memRejectedHashes.add(evidenceHash);
    if (this.prisma) {
      this.prisma.rejectedEvidenceHash
        .upsert({
          where: { evidenceHash },
          update: { reason: 'rejected' },
          create: { evidenceHash, reason: 'rejected' },
        })
        .catch(() => {});
    }
  }

  isEvidenceRejected(evidenceHash: string): boolean {
    return this.memRejectedHashes.has(evidenceHash);
  }

  // --- Decisions ---
  saveDecision(decision: Decision): void {
    this.memDecisions.set(decision.id, decision);

    if (decision.supersedesId) {
      const prev = this.memDecisions.get(decision.supersedesId);
      if (prev) {
        prev.state = 'Superseded';
        this.memDecisions.set(prev.id, prev);
      }
    }

    if (this.prisma) {
      this.prisma.decision
        .upsert({
          where: { id: decision.id },
          update: {
            title: decision.title || decision.topic,
            decisionSummary: decision.decision,
            keyReason: decision.rationale,
            status: decision.state,
            supersedesId: decision.supersedesId || null,
            governanceScore: decision.governanceScore || 0,
            governanceReason: decision.governanceReason || '',
            governancePassed: decision.governancePassed || false,
          },
          create: {
            id: decision.id,
            guildId: decision.source?.guildId || 'guild',
            channelId: decision.source?.channelId || 'chan',
            messageId: decision.source?.triggerMessageId || 'msg',
            title: decision.title || decision.topic,
            decisionSummary: decision.decision,
            keyReason: decision.rationale,
            status: decision.state,
            decisionMaker: decision.approvedBy || 'AI',
            participants: JSON.stringify(decision.source?.participants || []),
            alternatives: JSON.stringify(decision.alternatives || []),
            tags: JSON.stringify([decision.categoryTag || '기타']),
            supersedesId: decision.supersedesId || null,
            sourceJumpUrl: decision.source?.messageUrl || '',
            evidenceSummary: decision.rawTranscript || '',
            evidenceHash: decision.evidenceHash || '',
            governanceScore: decision.governanceScore || 0,
            governanceReason: decision.governanceReason || '',
            governancePassed: decision.governancePassed || false,
          },
        })
        .catch(() => {});
    }
  }

  getDecisionById(id: string): Decision | null {
    return this.memDecisions.get(id) || null;
  }

  getDecisions(filter: { topic?: string; state?: string; categoryTag?: string } = {}): Decision[] {
    let list = Array.from(this.memDecisions.values());

    if (filter.topic) {
      list = list.filter(d => d.topic.includes(filter.topic!) || d.title?.includes(filter.topic!));
    }
    if (filter.state) {
      list = list.filter(d => d.state === filter.state);
    }
    if (filter.categoryTag) {
      list = list.filter(d => d.categoryTag === filter.categoryTag);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  reviewDecision(
    id: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'> = {},
  ): Decision | null {
    const existing = this.getDecisionById(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    if (action === 'confirm') {
      existing.state = 'Decided';
      existing.approvedBy = params.approvedBy || 'Reviewer';
      existing.decisionConfirmedDate = now;
      if (params.title) existing.title = params.title;
      if (params.decisionContent) existing.decisionContent = params.decisionContent;
      if (params.rationale) existing.rationale = params.rationale;
      if (params.rationaleSummary) existing.rationaleSummary = params.rationaleSummary;
      if (params.rationaleQuotes) existing.rationaleQuotes = params.rationaleQuotes;
      if (params.categoryTag) existing.categoryTag = params.categoryTag;
    } else if (action === 'defer') {
      existing.state = 'Deferred';
    } else if (action === 'reject') {
      existing.state = 'Rejected';
      if (existing.evidenceHash) {
        this.recordRejectedEvidence(existing.evidenceHash);
      }
    } else if (action === 'edit') {
      if (params.title) existing.title = params.title;
      if (params.decisionContent) existing.decisionContent = params.decisionContent;
      if (params.rationale) existing.rationale = params.rationale;
      if (params.rationaleSummary) existing.rationaleSummary = params.rationaleSummary;
      if (params.rationaleQuotes) existing.rationaleQuotes = params.rationaleQuotes;
      if (params.categoryTag) existing.categoryTag = params.categoryTag;
    }

    this.saveDecision(existing);
    return existing;
  }

  close(): void {
    this.memDecisions.clear();
    this.memCheckpoints.clear();
    this.memFeedbacks = [];
    this.memRejectedHashes.clear();
  }
}
