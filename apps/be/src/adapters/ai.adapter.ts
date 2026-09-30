import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Service } from 'typedi';
import { createLogger, ExternalFeedback } from '@ggaddak/shared';
import { EXTRACTION_SYSTEM_PROMPT } from '../extractor/prompt.js';
import { ExtractionResult, ExtractionResultSchema } from '../extractor/schemas.js';

const logger = createLogger('AI-ADAPTER');

export interface IAiAdapter {
  analyzeTranscript(transcript: string, feedbacks?: ExternalFeedback[]): Promise<ExtractionResult>;
}

@Service()
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

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        logger.info('Calling Google Gemini 2.5 Flash for decision extraction...');
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
              logger.info(`[Gemini AI] Successfully extracted ${validated.data.decisions.length} decisions.`);
              return validated.data;
            }
          }
        } else {
          const errorBody = await res.text();
          logger.warn(
            `Gemini API returned status ${res.status}: ${errorBody.slice(0, 200)}. Falling back to dynamic heuristic parser.`,
          );
        }
      } catch (err: any) {
        logger.error(
          `Gemini API call failed: ${err.message}. Falling back to dynamic heuristic parser.`,
        );
      }
    }

    if (process.env.OPENAI_API_KEY) {
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
          `OpenAI API call failed: ${err.message}. Falling back to dynamic heuristic parser.`,
        );
      }
    }

    // Dynamic Heuristic Fallback parser
    return this.mockExtract(transcript);
  }

  private mockExtract(transcript: string): ExtractionResult {
    const lines = transcript
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const decisions: any[] = [];
    const consensusPattern =
      /(~?합시다|~?합세|~?하자|~?하죠|~?해요|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?가자|~?가요|~?진행할게요|~?완료|픽스|fix|agree|찬성|좋습니다|이걸로)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip pure time headers or timestamps
      const contentPart = line.replace(/^\[.*?\]\s*[^:]+:\s*/, '');

      if (consensusPattern.test(contentPart) && contentPart.length >= 4) {
        // Infer topic & decision
        let topic = '팀 합의 사항';
        let categoryTag: '기술' | '기능' | '타깃' | '문제정의' | 'BM' | '기타' = '기타';

        if (/DB|데이터베이스|Postgres|MySQL|Redis|몽고|서버|프레임워크|Fastify|Express|Nest|Next|React|Vue|Vite|배포|인프라|AWS|도커/i.test(contentPart)) {
          topic = '기술 스택 및 아키텍처';
          categoryTag = '기술';
        } else if (/기능|로그인|인증|카카오|구글|결제|화면|UI|UX|페이지/i.test(contentPart)) {
          topic = '제품 기능 및 스펙';
          categoryTag = '기능';
        } else if (/타깃|고객|사용자|유저|연령|대상/i.test(contentPart)) {
          topic = '타깃 고객 정의';
          categoryTag = '타깃';
        } else if (/문제|페인포인트|불편|원인/i.test(contentPart)) {
          topic = '핵심 문제 정의';
          categoryTag = '문제정의';
        } else if (/가격|수익|BM|비즈니스|유료|구독/i.test(contentPart)) {
          topic = '비즈니스 모델';
          categoryTag = 'BM';
        }

        // Surrounding context as rationale
        const prevContext = i > 0 ? lines[i - 1].replace(/^\[.*?\]\s*[^:]+:\s*/, '') : '';
        const rationale = prevContext
          ? `논의 배경: "${prevContext}"에 대한 합의로 채택됨.`
          : `팀 대화 중 "${contentPart}"에 대한 상호 합의가 확인되어 도출됨.`;

        decisions.push({
          topic,
          title: contentPart.length > 30 ? `${contentPart.slice(0, 30)}...` : contentPart,
          decision: contentPart,
          decisionContent: contentPart,
          rationale,
          alternatives: [],
          categoryTag,
          actionItems: [{ task: `${contentPart} 후속 실행 및 구현` }],
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
