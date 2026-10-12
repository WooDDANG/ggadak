import type {V1DecisionDto} from './v1-decision.dto.js';
export interface DashboardDto {
  counts: {confirmed:number;onHold:number;inReview:number};
  recentDecisions: V1DecisionDto[];
  sync: {
    lastSuccessfulAt:string|null;
    latestJob:null|{jobId:string;status:string;errorMessage:string|null;totalChannels:number;completedChannels:number;failedChannels:number;createdAt:string;completedAt:string|null};
  };
}
