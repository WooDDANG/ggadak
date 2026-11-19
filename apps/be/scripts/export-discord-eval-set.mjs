// Discord 채널 대화를 운영과 같은 세션 단위로 나눠 평가용 JSONL로 저장한다.
// 저장소가 공개라 결과는 git이 무시하는 .data/ 아래에만 쓴다. 메시지 본문은 콘솔에 출력하지 않는다.
import 'reflect-metadata';
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: resolve(root, '.env'), quiet: true });
process.env.LOG_LEVEL = 'silent';

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const snowflake = name => {
  const result = value(name);
  if (!result || !/^\d{15,22}$/.test(result)) throw new Error(`${name}에 Discord ID를 지정하세요.`);
  return result;
};

async function main() {
  if (!args.includes('--live')) throw new Error('실제 Discord 호출에는 --live가 필요합니다.');
  const guildId = snowflake('--guild');
  const channelId = snowflake('--channel');
  const maxMessages = Number(value('--max-messages') ?? 5000);
  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1)
    throw new Error('--max-messages는 양의 정수여야 합니다.');
  const output = resolve(root, value('--out') ?? `.data/eval/discord-${channelId}.jsonl`);
  if (!output.startsWith(resolve(root, '.data') + '/'))
    throw new Error('실제 대화는 공개 저장소에 올라가지 않도록 .data/ 아래에만 저장합니다.');
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN이 필요합니다.');

  const discord = async endpoint => {
    for (;;) {
      const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });
      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        await new Promise(done => setTimeout(done, Math.ceil((body.retry_after ?? 1) * 1000)));
        continue;
      }
      if (!response.ok) throw new Error(`Discord 조회 실패 (HTTP ${response.status})`);
      return response.json();
    }
  };

  const channel = await discord(`/channels/${channelId}`);
  if (channel.guild_id !== guildId) throw new Error('채널이 지정한 서버에 속하지 않습니다.');

  const fetched = [];
  let before;
  while (fetched.length < maxMessages) {
    const query = new URLSearchParams({
      limit: String(Math.min(100, maxMessages - fetched.length)),
    });
    if (before) query.set('before', before);
    const page = await discord(`/channels/${channelId}/messages?${query}`);
    if (!Array.isArray(page) || !page.length) break;
    fetched.push(...page);
    before = page.at(-1).id;
  }
  const rawMessages = fetched.reverse().map(message => ({
    id: message.id,
    author: message.author?.username || 'unknown',
    isBot: Boolean(message.author?.bot),
    content: message.content || '',
    createdAt: message.timestamp,
    replyingTo: message.message_reference?.message_id,
    reactions: (message.reactions || []).map(reaction => ({
      emoji: reaction.emoji?.name || 'unknown',
      count: reaction.count || 0,
      botCount: reaction.me ? 1 : 0,
    })),
  }));
  if (!rawMessages.some(message => !message.isBot && message.content.trim()))
    throw new Error(
      '분석할 메시지 본문이 없습니다. 채널 권한과 MESSAGE_CONTENT 설정을 확인하세요.',
    );

  // 운영 분석과 같은 필터·대화 분리·세션 분할을 쓴다.
  const { prepareAnalysis } = await import('../dist/services/discussion-preprocessing.js');
  const workflow = prepareAnalysis(
    { requestId: `eval-${channelId}`, guildId, channelId, rawMessages, isManualOverride: false },
    {},
  );
  const records = workflow.sessions.map((session, index) => ({
    meetingId: `discord-${channelId}-${String(index).padStart(3, '0')}`,
    split: 'discord-live',
    language: 'ko',
    source: {
      guildId,
      channelId,
      firstMessageId: session.messages[0]?.id,
      lastMessageId: session.messages.at(-1)?.id,
    },
    input: {
      utterances: session.messages.map(message => ({
        id: message.id,
        speaker: message.author,
        text: message.content,
        startSeconds: null,
        createdAt: message.createdAt ?? null,
        replyingTo: message.replyingTo ?? null,
      })),
    },
    // 운영 Extract가 받는 입력과 같은 형식.
    transcript: session.transcript,
  }));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, records.map(record => JSON.stringify(record)).join('\n') + '\n');

  const sizes = records.map(record => record.input.utterances.length).sort((a, b) => a - b);
  const chars = records.map(record => record.transcript.length).sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      channel: channel.name,
      fetchedMessages: rawMessages.length,
      humanMessages: rawMessages.filter(message => !message.isBot).length,
      firstAt: rawMessages[0].createdAt,
      lastAt: rawMessages.at(-1).createdAt,
      sessions: records.length,
      messagesPerSession: {
        min: sizes[0],
        median: sizes[Math.floor(sizes.length / 2)],
        max: sizes.at(-1),
      },
      transcriptChars: {
        min: chars[0],
        median: chars[Math.floor(chars.length / 2)],
        max: chars.at(-1),
      },
      truncatedAtLimit: rawMessages.length >= maxMessages,
      output: output.slice(root.length),
    }),
  );
}

main().catch(error => {
  console.error(JSON.stringify({ error: error?.message ?? 'Discord 내보내기 실패' }));
  process.exitCode = 1;
});
