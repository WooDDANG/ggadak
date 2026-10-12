import {DecisionRepository} from '../repositories/decision.repository.js';
import {DashboardDto} from '../dto/dashboard.dto.js';
import {toV1Decision} from '../dto/v1-decision.dto.js';
export class DashboardService {
  constructor(private readonly repo:DecisionRepository) {}
  async summary(guildId:string):Promise<DashboardDto> {
    const db=this.repo.prisma;
    const [confirmed,onHold,inReview,recent,lastSuccess,latest]=await db.$transaction([
      db.decision.count({where:{guildId,lifecycle:'CONFIRMED'}}),
      db.decision.count({where:{guildId,lifecycle:'ON_HOLD'}}),
      db.decision.count({where:{guildId,lifecycle:'IN_REVIEW'}}),
      db.decision.findMany({where:{guildId,lifecycle:'CONFIRMED'},orderBy:[{confirmedAt:'desc'},{createdAt:'desc'},{id:'asc'}],take:5}),
      db.syncJob.findFirst({where:{guildId,status:'COMPLETED',completedAt:{not:null}},orderBy:[{completedAt:'desc'},{id:'asc'}]}),
      db.syncJob.findFirst({where:{guildId},orderBy:[{createdAt:'desc'},{id:'asc'}]}),
    ]);
    return {counts:{confirmed,onHold,inReview},recentDecisions:recent.map(row=>toV1Decision(this.repo.decodeDecision(row))),sync:{lastSuccessfulAt:lastSuccess?.completedAt?.toISOString() ?? null,latestJob:latest ? {jobId:latest.id,status:latest.status,errorMessage:latest.errorMessage,totalChannels:latest.totalChannels,completedChannels:latest.completedChannels,failedChannels:latest.failedChannels,createdAt:latest.createdAt.toISOString(),completedAt:latest.completedAt?.toISOString() ?? null}:null}};
  }
}
