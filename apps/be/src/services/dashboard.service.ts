import {DecisionRepository} from '../repositories/decision.repository.js';
import {DashboardDto} from '../dto/dashboard.dto.js';
import {toV1Decision} from '../dto/v1-decision.dto.js';
export class DashboardService {
  constructor(private readonly repo:DecisionRepository) {}
  async summary(guildId:string):Promise<DashboardDto> {
    const db=this.repo.prisma;
    const [confirmed,onHold,inReview,recent]=await db.$transaction([
      db.decision.count({where:{guildId,lifecycle:'CONFIRMED'}}),
      db.decision.count({where:{guildId,lifecycle:'ON_HOLD'}}),
      db.decision.count({where:{guildId,lifecycle:'IN_REVIEW'}}),
      db.decision.findMany({where:{guildId,lifecycle:'CONFIRMED'},orderBy:[{confirmedAt:'desc'},{createdAt:'desc'},{id:'asc'}],take:5}),
    ]);
    return {counts:{confirmed,onHold,inReview},recentDecisions:recent.map(row=>toV1Decision(this.repo.decodeDecision(row))),sync:{lastSuccessfulAt:null,latestJob:null}};
  }
}
