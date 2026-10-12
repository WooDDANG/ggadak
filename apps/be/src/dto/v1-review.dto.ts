import type { ReviewDecisionDto } from './decision.dto.js';
import type { V1DecisionDto } from './v1-decision.dto.js';
/** A Review Queue ticket is the Decision Candidate itself. Both IDs are identical strings. */
export interface V1ReviewTicketDto extends V1DecisionDto {
  ticketId: string;
}
export interface V1ReviewQueueDto {
  items: V1ReviewTicketDto[];
  pageInfo: { currentPage: number; pageSize: number; totalElements: number; totalPages: number };
}
/** Reviewer identity is always taken from the authenticated session. */
export interface V1ReviewRequestDto extends Omit<ReviewDecisionDto, 'action' | 'approvedBy'> {
  action: 'confirm' | 'defer' | 'reject';
}
