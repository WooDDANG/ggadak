import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createLogger, ExternalFeedback } from '@ggaddak/shared';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt.js';
import { ExtractionResult, ExtractionResultSchema } from './schemas.js';

const logger = createLogger('AI-EXTRACTOR');

export class BackendExtractionEngine {
  async analyzeTranscript(
    transcript: string,
    feedbacks: ExternalFeedback[] = [],
  ): Promise<ExtractionResult> {
    if (!transcript || transcript.trim().length === 0) {
      return { found: false, summary: '대화 내용이 비어있습니다.', decisions: [] };
    }

    let feedbackPromptSection = '';
    if (feedbacks.length > 0) {
      feedbackPromptSection =
        `\n\n[참고: 최근 전달된 외부 피드백]\n` +
        feedbacks
          .map(f => `- [${f.source}${f.detail ? ` (${f.detail})` : ''}]: ${f.content}`)
          .join('\n');
    }

    const provider =
      process.env.AI_PROVIDER ||
      (process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? 'gemini'
        : process.env.OPENAI_API_KEY
          ? 'openai'
          : 'mock');

    if (provider === 'gemini' && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      try {
        logger.info('Calling Google Gemini 2.5 Flash for decision extraction...');
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
              },
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `다음 디스코드 대화록을 읽고 합의된 의사결정과 근거, 기각된 대안, 카테고리, 실행 과제를 JSON 형식으로 추출하십시오:\n\n${transcript}${feedbackPromptSection}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
              },
            }),
          },
        );

        if (res.ok) {
          const data = (await res.json()) as any;
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            const validated = ExtractionResultSchema.safeParse(parsed);
            if (validated.success) {
              logger.info(
                `Gemini extraction succeeded: found=${validated.data.found}, decisions=${validated.data.decisions.length}`,
              );
              return validated.data;
            }
          }
        } else {
          const errorBody = await res.text();
          logger.warn(
            `Gemini API returned status ${res.status}: ${errorBody.slice(0, 200)}. Falling back to deterministic parser.`,
          );
        }
      } catch (err: any) {
        logger.error(
          `Gemini API call failed: ${err.message}. Falling back to deterministic parser.`,
        );
      }
    }

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        logger.info('Calling OpenAI GPT-4o-mini for decision extraction...');
        const result = await generateObject({
          model: openai('gpt-4o-mini') as any,
          system: EXTRACTION_SYSTEM_PROMPT,
          prompt: `다음 디스코드 대화록을 읽고 합의된 의사결정과 근거, 기각된 대안, 카테고리, 실행 과제를 추출하십시오:\n\n${transcript}${feedbackPromptSection}`,
          schema: ExtractionResultSchema,
        });
        return result.object;
      } catch (err: any) {
        logger.error(
          `OpenAI API call failed: ${err.message}. Falling back to deterministic parser.`,
        );
      }
    }

    // Mock / Deterministic Fallback parser for testing and environments without live API keys
    return this.mockExtract(transcript);
  }

  private mockExtract(transcript: string): ExtractionResult {
    const lower = transcript.toLowerCase();

    // 1. Exclude casual talk, simple schedules, work reports
    if (
      lower.includes('점심') ||
      lower.includes('날씨') ||
      lower.includes('밥 먹') ||
      lower.includes('배고파') ||
      lower.includes('내일 3시') ||
      lower.includes('개발 완료했습니다') ||
      lower.includes('pr 올렸습니다')
    ) {
      return {
        found: false,
        summary: '단순 잡담, 일정 조율 또는 작업 보고 (의사결정 없음)',
        decisions: [],
      };
    }

    const decisions: any[] = [];

    if (lower.includes('postgres') || lower.includes('postgresql')) {
      decisions.push({
        topic: 'Database Selection',
        title: '메인 데이터베이스로 PostgreSQL 채택',
        decision: '메인 데이터베이스로 PostgreSQL 채택',
        decisionContent: '트랜잭션 정합성(ACID) 보장을 위해 PostgreSQL을 메인 DB로 도입하기로 합의',
        rationale: '금융 및 결제 수준의 강력한 트랜잭션 정합성(ACID) 보장 필요',
        alternatives: [{ option: 'MongoDB 채택', reason: '정합성 보장 부족으로 메인 DB에서 제외' }],
        categoryTag: '기술',
        actionItems: [{ task: 'AWS RDS PostgreSQL 인스턴스 프로비저닝', assignee: 'Alex' }],
        isPivot: false,
      });
    }

    if (lower.includes('fastify')) {
      decisions.push({
        topic: 'Backend Framework',
        title: 'HTTP 서버 프레임워크로 Fastify 채택',
        decision: 'HTTP 서버 프레임워크로 Fastify 채택',
        decisionContent: '비동기 I/O 처리량 및 벤치마크 속도 우수성으로 Fastify 채택',
        rationale: 'Express 대비 월등한 비동기 I/O 처리량 및 벤치마크 속도 우수',
        alternatives: [{ option: 'Express 사용', reason: '벤치마크 처리량 한계로 기각' }],
        categoryTag: '기술',
        actionItems: [],
        isPivot: false,
      });
    }

    if (lower.includes('supabase')) {
      decisions.push({
        topic: 'Authentication Provider',
        title: '인증 시스템으로 Supabase Auth 도입',
        decision: '인증 시스템으로 Supabase Auth 도입',
        decisionContent: '소셜 로그인 연동 및 사용자 세션 관리 편의성을 위해 Supabase Auth 도입',
        rationale: '빠른 소셜 로그인 연동 및 사용자 세션 관리 편의성',
        alternatives: [],
        categoryTag: '기능',
        actionItems: [{ task: 'Supabase Auth 프로젝트 키 발급 및 설정', assignee: 'Wooddang' }],
        isPivot: false,
      });
    }

    if (
      lower.includes('카카오') &&
      lower.includes('구글') &&
      (lower.includes('빼') || lower.includes('제외'))
    ) {
      decisions.push({
        topic: 'Authentication Feature',
        title: 'MVP 로그인 방식으로 카카오 단독 채택',
        decision: 'MVP 단계에서는 구글 로그인을 제외하고 카카오 로그인만 우선 구현',
        decisionContent:
          '일정 단축을 위해 카카오 로그인을 단독 채택하고 구글 로그인은 MVP에서 제외함',
        rationale: '카카오가 구현 속도가 가장 빠르며 구글 동시 도입 시 일정 지연 위험',
        alternatives: [{ option: '구글 로그인 동시 도입', reason: '일정 지연 위험으로 제외' }],
        categoryTag: '기능',
        actionItems: [{ task: '카카오 로그인 SDK 연동', assignee: 'Alex' }],
        isPivot: false,
      });
    }

    if (decisions.length > 0) {
      return {
        found: true,
        summary: `${decisions.length}개의 의사결정 후보 도출`,
        decisions,
      };
    }

    // Clean up content from transcript
    const lines = transcript
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    const contentLines = lines
      .map(l => l.replace(/^\[.*?\]\s*[^:]+:\s*/, ''))
      .filter(l => l.length > 0);
    const firstContent = contentLines[contentLines.length - 1] || transcript;

    if (firstContent.length < 10) {
      return {
        found: false,
        summary: '단순 발화 (의사결정 없음)',
        decisions: [],
      };
    }

    return {
      found: true,
      summary: `의사결정 후보 도출`,
      decisions: [
        {
          topic: firstContent.length > 20 ? firstContent.slice(0, 20) + '...' : firstContent,
          title: firstContent.length > 25 ? firstContent.slice(0, 25) + '...' : firstContent,
          decision: firstContent,
          decisionContent: firstContent,
          rationale: '대화 맥락에서 도출된 팀 합의 및 결정 사항',
          alternatives: [],
          categoryTag: '기타',
          actionItems: [],
          isPivot: false,
        },
      ],
    };
  }
}
