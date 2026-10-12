import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listDiscordChannels, saveDiscordChannels } from '../api/generated';

export function ChannelSettings({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const key = ['discord-channels', guildId];
  const query = useQuery({ queryKey: key, queryFn: async () => (await listDiscordChannels({ guildId })).data.data });
  useEffect(() => { if (query.data) { setSelected(query.data.monitoredChannelIds); } }, [query.data]);
  const mutation = useMutation({
    mutationFn: async () => (await saveDiscordChannels({ channelIds: selected }, { guildId })).data.data,
    onSuccess: data => { queryClient.setQueryData(key, data); setSaved(true); },
  });
  if (query.isLoading) return <p role="status">Discord 채널을 불러오는 중입니다.</p>;
  if (query.error) return <div role="alert"><p>{query.error.message}</p><p>서버에 봇을 설치하고 채널 보기·메시지 기록 보기 권한을 확인하세요.</p><button onClick={() => query.refetch()}>다시 시도</button></div>;
  return <section className="max-w-2xl space-y-4">
    <h1 className="text-xl font-bold">채널 모니터링 설정</h1>
    <p>저장한 텍스트 채널에서만 결정을 수집합니다. 서버 관리 권한이 있어야 저장할 수 있습니다.</p>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <legend className="sr-only">모니터링할 Discord 채널</legend>
      {query.data?.channels.map(channel => <label key={channel.id} className="flex gap-3 items-center">
        <input type="checkbox" checked={selected.includes(channel.id)} disabled={!channel.accessible && !selected.includes(channel.id)}
          onChange={event => { setSaved(false); setSelected(ids => event.target.checked ? [...ids, channel.id] : ids.filter(id => id !== channel.id)); }} />
        <span>#{channel.name}{!channel.accessible && ' (봇 접근 불가)'}</span>
      </label>)}
      {!query.data?.channels.length && <p>선택할 텍스트 채널이 없습니다.</p>}
    </fieldset>
    <button disabled={mutation.isPending} onClick={() => { setSelected([]); setSaved(false); }}>모두 해제</button>
    <button className="bg-indigo-600 rounded px-4 py-2" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '저장 중…' : '설정 저장'}</button>
    {mutation.error && <p role="alert">{mutation.error.message}</p>}
    {saved && <p role="status">모니터링 설정을 저장했습니다.</p>}
  </section>;
}
