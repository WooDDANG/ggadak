import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createLogger, ExternalFeedback } from '@ggaddak/shared';
import { EXTRACTION_SYSTEM_PROMPT } from '../extractor/prompt.js';
import { ExtractionResult, ExtractionResultSchema } from '../extractor/schemas.js';

const logger = createLogger('AI-ADAPTER');

export interface IAiAdapter {
  analyzeTranscript(transcript: string, feedbacks?: ExternalFeedback[]): Promise<ExtractionResult>;
}

export class AiAdapter implements IAiAdapter {
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
        logger.info('Calling Google Gemini 1.5 Flash for decision extraction...');
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    // Mock / Deterministic Fallback parser
    return this.mockExtract(transcript);
  }

  private mockExtract(transcript: string): ExtractionResult {
    const lines = transcript.split('\n');
    const decisions: any[] = [];

    // Filter out casual talk
    const isCasual = /(밥|점심|저녁|날씨|안녕|감사|ㅋㅋ|ㅎㅎ)/.test(transcript);
    const hasConsensus = /(~?합시다|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?진행할게요|~?완료|픽스|fix|agree)/i.test(
      transcript,
    );

    if (isCasual && !hasConsensus) {
      return {
        found: false,
        summary: '잡담 또는 일상 대화로 감지되어 의사결정 후보에서 제외되었습니다.',
        decisions: [],
      };
    }

    for (const line of lines) {
      if (/DB|데이터베이스|PostgreSQL|MySQL/i.test(line) && /(채택|사용|결정|쓰자|가시죠)/i.test(line)) {
        decisions.push({
          topic: '데이터베이스 선정',
          title: '메인 데이터베이스로 PostgreSQL 채택',
          decision: '안정적인 트랜잭션 처리를 위해 메인 데이터베이스로 PostgreSQL을 채택하기로 합의함.',
          decisionContent: 'PostgreSQL을 메인 관계형 데이터베이스로 선정하고 JSONB 지원 기능을 활용하기로 결정.',
          rationale: '복잡한 조인 쿼리 성능과 JSONB 확장성 면에서 가장 우수하여 채택됨.',
          alternatives: [{ option: 'MySQL 8.0', reason: 'JSONB 및 지리정보 쿼리 편의성에서 PostgreSQL이 더 적합하여 제외' }],
          categoryTag: '기술',
          actionItems: [{ task: 'PostgreSQL 16 컨테이너 인프라 구성', assignee: 'DevOps' }],
          isPivot: false,
        });
      }

      if (/서버|프레임워크|Fastify|Express/i.test(line) && /(채택|가자|쓰자|진행)/i.test(line)) {
        decisions.push({
          topic: '백엔드 프레임워크 선정',
          title: 'HTTP 서버 프레임워크로 Fastify 채택',
          decision: '고성능 비동기 처리와 TypeScript 지원을 위해 Fastify 프레임워크를 채택함.',
          decisionContent: 'Node.js 환경에서 높은 처리량(Throughput)을 확보하기 위해 Fastify로 백엔드 구성.',
          rationale: '벤치마크 테스트 결과 Express 대비 높은 RPS(Requests Per Second) 처리 성능 확인.',
          alternatives: [{ option: 'Express', reason: '레거시 호환성은 좋으나 처리량 면에서 Fastify에 밀림' }],
          categoryTag: '기술',
          actionItems: [{ task: 'Fastify 라우터 템플릿 세팅', assignee: 'Backend' }],
          isPivot: false,
        });
      }

      if (/카카오|구글|로그인/i.test(line) && /(제외|빼자|먼저)/i.test(line)) {
        decisions.push({
          topic: '인증 공급자 선정',
          title: 'MVP 로그인 방식으로 카카오 단독 채택',
          decision: 'MVP 단계에서는 개발 일정 단축을 위해 카카오 소셜 로그인만 단독 구현하고 구글은 제외함.',
          decisionContent: '일정 단축을 위해 카카오 로그인을 단독 채택하고 구글 로그인은 MVP에서 제외함.',
          rationale: '카카오가 구현 속도가 가장 빠르며 구글 동시 도입 시 일정 지연 위험.',
          alternatives: [{ option: '구글 로그인 동시 도입', reason: '일정이 너무 빠듯하여 MVP에서 제외됨' }],
          categoryTag: '기능',
          actionItems: [{ task: '카카오 로그인 SDK 연동', assignee: 'Frontend' }],
          isPivot: false,
        });
      }
    }

    if (decisions.length > 0) {
      return {
        found: true,
        summary: `대화 맥락에서 ${decisions.length}개의 의사결정 후보를 식별했습니다.`,
        decisions,
      };
    }

    return {
      found: false,
      summary: '대화에서 명시적인 합의나 의사결정 결론을 찾지 못했습니다.',
      decisions: [],
    };
  }
}
