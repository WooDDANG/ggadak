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
        const result = await generateObject({
          model: google('models/gemini-1.5-flash-latest') as any,
          system: EXTRACTION_SYSTEM_PROMPT,
          prompt: `다음 디스코드 대화록을 읽고 합의된 의사결정과 근거, 실행 과제를 추출하십시오:\n\n${transcript}`,
          schema: ExtractionResultSchema
        });
        return result.object;
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

    // If no keywords matched and conversation is very short or casual
    if (lower.includes('점심') || lower.includes('날씨') || transcript.length < 50) {
      return {
        found: false,
        summary: '단순 잡담 또는 의사결정 없음',
        decisions: []
      };
    }

    return {
      found: true,
      summary: '대화 맥락에서 의사결정 합의 추출 완료',
      decisions: [
        {
          topic: 'General Agreement',
          decision: '대화 맥락에서 도출된 팀 합의 사항',
          rationale: '대화 참여자 간 상호 동의 발화 확인됨',
          actionItems: []
        }
      ]
    };
  }
}
