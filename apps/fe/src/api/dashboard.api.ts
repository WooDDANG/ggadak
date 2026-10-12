import {getDashboard} from './generated';
export const dashboardQueryKey=(guildId:string)=>['dashboard',guildId] as const;
export async function loadDashboard(guildId:string) {
  const result=await getDashboard({guildId});
  if(result.status!==200 || !result.data.success) throw new Error(result.data.message || `HTTP ${result.status}`);
  return result.data.data;
}
