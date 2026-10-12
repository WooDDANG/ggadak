import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { Service } from 'typedi';
import { ExternalFeedback } from '@ggaddak/shared';
import { EXTRACTION_SYSTEM_PROMPT } from '../extractor/prompt.js';
import { ExtractionResult, ExtractionResultSchema } from '../extractor/schemas.js';

import config, { AppConfig } from '../config/index.js';

export interface IAiAdapter {
  analyzeTranscript(transcript: string, feedbacks?: ExternalFeedback[]): Promise<ExtractionResult>;
}

@Service({ factory: () => new AiAdapter() })
export class AiAdapter implements IAiAdapter {
  constructor(
    private readonly options: AppConfig['ai'] = config.ai,
    private readonly environment = config.nodeEnv,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async analyzeTranscript(
    transcript: string,
    feedbacks: ExternalFeedback[] = [],
  ): Promise<ExtractionResult> {
    const { provider, geminiApiKey, openaiApiKey } = this.options;
    if (!['gemini', 'openai', 'mock'].includes(provider))
      throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
    if (provider === 'mock') {
      if (!['development', 'test'].includes(this.environment))
        throw new Error('Mock AI requires development or test environment');
      return this.mockExtract(transcript);
    }
    if (!(provider === 'gemini' ? geminiApiKey : openaiApiKey))
      throw new Error(`Missing API key for AI_PROVIDER=${provider}`);
    if (!transcript.trim())
      return { found: false, summary: '대화 내용이 비어있습니다.', decisions: [] };
    const prompt = `다음 디스코드 대화록을 분석하십시오:\n${transcript}\n외부 피드백:\n${feedbacks.map(f => `${f.source}: ${f.content}`).join('\n')}`;
    if (provider === 'gemini') {
      const response = await this.transport(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey! },
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify({
            system_instruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        },
      );
      if (!response.ok) throw new Error(`Gemini extraction failed (HTTP ${response.status})`);
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
      if (!text) throw new Error('Gemini extraction returned no content');
      return ExtractionResultSchema.parse(JSON.parse(text));
    }
    const result = await generateObject({
      model: createOpenAI({ apiKey: openaiApiKey! })('gpt-4o-mini') as any,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt,
      schema: ExtractionResultSchema,
      abortSignal: AbortSignal.timeout(45_000),
    });
    return ExtractionResultSchema.parse(result.object);
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

        if (
          /DB|데이터베이스|Postgres|MySQL|Redis|몽고|서버|프레임워크|Fastify|Express|Nest|Next|React|Vue|Vite|배포|인프라|AWS|도커/i.test(
            contentPart,
          )
        ) {
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
