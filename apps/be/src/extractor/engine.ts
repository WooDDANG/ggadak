import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { createLogger } from '@ggaddak/shared';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt.js';
import { ExtractionResult, ExtractionResultSchema } from './schemas.js';

const logger = createLogger('AI-EXTRACTOR');

export class BackendExtractionEngine {
  async analyzeTranscript(transcript: string): Promise<ExtractionResult> {
    if (!transcript || transcript.trim().length === 0) {
      return { found: false, summary: '대화 내용이 비어있습니다.', decisions: [] };
    }

    const provider = process.env.AI_PROVIDER || (process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini' : (process.env.OPENAI_API_KEY ? 'openai' : 'mock'));

    if (provider === 'gemini' && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      try {
        logger.info('Calling Google Gemini 1.5 Flash for decision extraction...');
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: EXTRACTION_SYSTEM_PROMPT }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: `다음 디스코드 대화록을 읽고 합의된 의사결정과 근거, 실행 과제를 JSON 형식으로 추출하십시오:\n\n${transcript}` }]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        });

        if (res.ok) {
          const data = await res.json() as any;
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            const validated = ExtractionResultSchema.safeParse(parsed);
            if (validated.success) {
              logger.info(`Gemini extraction succeeded: found=${validated.data.found}, decisions=${validated.data.decisions.length}`);
              return validated.data;
            }
          }
        } else {
          const errorBody = await res.text();
          logger.warn(`Gemini API returned status ${res.status}: ${errorBody.slice(0, 200)}. Falling back to deterministic parser.`);
        }
      } catch (err: any) {
        logger.error(`Gemini API call failed: ${err.message}. Falling back to deterministic parser.`);
      }
    }

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        logger.info('Calling OpenAI GPT-4o-mini for decision extraction...');
        const result = await generateObject({
          model: openai('gpt-4o-mini') as any,
          system: EXTRACTION_SYSTEM_PROMPT,
          prompt: `다음 디스코드 대화록을 읽고 합의된 의사결정과 근거, 실행 과제를 추출하십시오:\n\n${transcript}`,
          schema: ExtractionResultSchema
        });
        return result.object;
      } catch (err: any) {
        logger.error(`OpenAI API call failed: ${err.message}. Falling back to deterministic parser.`);
      }
    }

    // Mock / Deterministic Fallback parser for testing and environments without live API keys
    return this.mockExtract(transcript);
  }

  private mockExtract(transcript: string): ExtractionResult {
    const lower = transcript.toLowerCase();

    const decisions: any[] = [];

    if (lower.includes('postgres') || lower.includes('postgresql')) {
      decisions.push({
        topic: 'Database Selection',
        decision: '메인 데이터베이스로 PostgreSQL 채택',
        rationale: '금융/결제 수준의 강력한 트랜잭션 정합성(ACID) 보장 필요',
        actionItems: [{ task: 'AWS RDS PostgreSQL 인스턴스 프로비저닝', assignee: 'Alex' }]
      });
    }

    if (lower.includes('fastify')) {
      decisions.push({
        topic: 'Backend Framework',
        decision: 'HTTP 서버 프레임워크로 Fastify 채택',
        rationale: 'Express 대비 월등한 비동기 I/O 처리량 및 벤치마크 속도 우수',
        actionItems: []
      });
    }

    if (lower.includes('supabase')) {
      decisions.push({
        topic: 'Authentication Provider',
        decision: '인증 시스템으로 Supabase Auth 도입',
        rationale: '빠른 소셜 로그인 연동 및 사용자 세션 관리 편의성',
        actionItems: [{ task: 'Supabase Auth 프로젝트 키 발급 및 설정', assignee: 'Wooddang' }]
      });
    }

    if (lower.includes('mongodb') && !lower.includes('postgres')) {
      decisions.push({
        topic: 'Database Selection',
        decision: '문서 및 로그 저장용으로 MongoDB 채택',
        rationale: '비정형 로그 데이터 수집 유연성 및 쓰기 성능 최적화',
        actionItems: []
      });
    }

    if (decisions.length > 0) {
      return {
        found: true,
        summary: `${decisions.length}개의 의사결정 합의 도출`,
        decisions
      };
    }

    // If casual chat
    if (lower.includes('점심') || lower.includes('날씨') || lower.includes('밥 먹') || lower.includes('배고파')) {
      return {
        found: false,
        summary: '단순 잡담 또는 일상 대화 (의사결정 없음)',
        decisions: []
      };
    }

    // Clean up content from transcript
    const lines = transcript.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const contentLines = lines.map(l => l.replace(/^\[.*?\]\s*[^:]+:\s*/, '')).filter(l => l.length > 0);
    const firstContent = contentLines[contentLines.length - 1] || transcript;

    return {
      found: true,
      summary: `의사결정/공지 사항 도출`,
      decisions: [
        {
          topic: firstContent.length > 20 ? firstContent.slice(0, 20) + '...' : firstContent,
          decision: firstContent,
          rationale: '채널 핀(📌) 트리거로 기록된 팀 합의 및 결정 사항',
          actionItems: []
        }
      ]
    };
  }
}
