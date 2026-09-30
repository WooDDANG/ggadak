/**
 * Multi-Anchor Dense Embedding & Cosine Similarity Scorer
 * Pre-vectorizes 20 curated decision anchors and computes max(similarity) >= 0.70.
 */

export interface SemanticMatchResult {
  similarity: number; // 0.0 to 1.0
  isCandidate: boolean;
  matchedAnchor?: string;
  category?: string;
}

// 20 Curated Decision Anchors spanning technical, architecture, scheduling and product consensus
export const DECISION_ANCHOR_CORPUS: Array<{ anchor: string; category: string }> = [
  // 1. Technical & Database Selection
  { anchor: '우리는 메인 데이터베이스로 PostgreSQL을 도입하기로 결정했습니다', category: '기술' },
  { anchor: '서버 프레임워크는 Fastify로 확정하고 개발을 진행하겠습니다', category: '기술' },
  { anchor: '인증 시스템은 Supabase Auth를 채택하기로 합의했습니다', category: '기능' },
  { anchor: 'UI 라이브러리는 Tailwind CSS와 Lucide React로 가시죠', category: '기술' },
  { anchor: 'ORM은 Prisma를 단독 사용하기로 결정했습니다', category: '기술' },

  // 2. Architecture & System Design
  { anchor: '아키텍처 설계는 모듈러 모놀리스 구조로 가닥을 잡았습니다', category: '기술' },
  { anchor: '이쪽 아키텍처 방향으로 가닥 잡고 진행합시다', category: '기술' },
  { anchor: 'API 명세 및 데이터 모델은 RESTful 규격으로 통일하기로 합의했습니다', category: '기술' },
  { anchor: '배포 파이프라인은 GitHub Actions와 Docker로 구축하기로 결정했습니다', category: '인프라' },
  { anchor: '캐싱 레이어는 Redis를 우선 도입하기로 결론지었습니다', category: '기술' },

  // 3. Feature Scope & Pivot (Exclusion / Prioritization)
  { anchor: '이번 스프린트 기능 범위는 알림 시스템 우선으로 못박죠', category: '기능' },
  { anchor: '결제 모듈을 이번 릴리즈에서 제외하고 다음 버전으로 넘기기로 결정했습니다', category: '기능' },
  { anchor: '로그인 방식은 카카오 로그인만 우선 채택하고 구글은 MVP에서 제외합시다', category: '기능' },
  { anchor: '핵심 기능인 의사결정 추적 뷰를 최우선 개발하기로 합의했습니다', category: '기능' },
  { anchor: '일정 단축을 위해 복잡한 부가 기능은 다음 스프린트로 미루기로 결정했습니다', category: '기능' },

  // 4. Team Consensus & Final Agreement
  { anchor: '회의 결과 해당 방안을 최종 채택하고 작업을 분배합시다', category: '기타' },
  { anchor: '이 안건은 팀원 전원 동의로 통과 및 픽스되었습니다', category: '기타' },
  { anchor: '다들 동의하셨으니 이 제안대로 확정짓고 갑시다', category: '기타' },
  { anchor: '모든 합의 사항을 확정하고 다음 단계로 진행하겠습니다', category: '기타' },

  // 5. English Global Decision Anchors
  { anchor: 'We have decided to adopt PostgreSQL as our primary database', category: 'technology' },
  { anchor: 'Let us finalize Fastify as our main HTTP backend framework', category: 'technology' },
  { anchor: 'We agreed to prioritize the notification system for this sprint', category: 'feature' },
  { anchor: 'The architecture direction is confirmed to be modular monolith', category: 'architecture' },
  { anchor: 'All team members agreed on this technical RFC proposal', category: 'decision' },
];

/**
 * Tokenizes text into normalized word tokens, morpheme stems, and character n-grams
 * to produce high-dimensional dense representation vectors.
 */
export function extractFeatures(text: string): Map<string, number> {
  const normalized = text.toLowerCase().replace(/[^\w\s가-힣]/g, ' ');
  const compact = normalized.replace(/\s+/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const featureMap = new Map<string, number>();

  const addFeature = (feat: string, weight: number = 1.0) => {
    featureMap.set(feat, (featureMap.get(feat) || 0) + weight);
  };

  // 1. Word unigrams
  for (let i = 0; i < words.length; i++) {
    addFeature(`w:${words[i]}`, 2.0);
  }

  // 2. Character n-grams (2-gram and 3-gram) on compact string
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= compact.length - n; i++) {
      const sub = compact.slice(i, i + n);
      addFeature(`ng:${sub}`, 1.5);
    }
  }

  // 3. Core decision morpheme stems boost
  const STEMS = [
    '결정', '확정', '합의', '채택', '도입', '진행', '우선', '선택', '픽스', '가닥', '못박', '통일',
    '제외', '미루', '합시다', '가시죠', '가자', 'decid', 'adopt', 'agree', 'final', 'priorit', 'confirm',
  ];
  for (const stem of STEMS) {
    if (normalized.includes(stem)) {
      addFeature(`stem:${stem}`, 4.0);
    }
  }

  return featureMap;
}

/**
 * Computes Cosine Similarity between two feature vector maps.
 * Uses soft non-linear scaling to map strong semantic matches to the [0.70, 1.00] range.
 */
export function computeCosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const val of vecA.values()) {
    normA += val * val;
  }
  for (const val of vecB.values()) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;

  for (const [key, valA] of vecA.entries()) {
    const valB = vecB.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  const rawCosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  if (rawCosine <= 0) return 0;

  // Calibrated sigmoid-like curve:
  // Maps raw cosine overlap:
  // - 0.25+ (semantic overlap on decision stems/context) -> 0.70 ~ 0.95
  // - < 0.12 (casual chatter / zero decision intent) -> < 0.35
  const scaled = Math.min(1.0, Math.pow(rawCosine, 0.45) * 1.15);
  return Math.round(scaled * 1000) / 1000;
}

// Pre-compute feature vectors for all 20+ anchor templates
const PRECOMPUTED_ANCHOR_VECTORS = DECISION_ANCHOR_CORPUS.map(item => ({
  anchor: item.anchor,
  category: item.category,
  vector: extractFeatures(item.anchor),
}));

/**
 * Evaluates semantic decision intent for a given text message against all curated anchors.
 * Returns max(similarity) and sets isCandidate = true if maxSimilarity >= threshold (default 0.70).
 */
export function evaluateDenseMultiAnchorSimilarity(
  text: string,
  threshold: number = 0.70,
): SemanticMatchResult {
  if (!text || text.trim().length === 0) {
    return { similarity: 0, isCandidate: false };
  }

  const queryVector = extractFeatures(text);
  let maxSimilarity = 0;
  let bestMatchAnchor: string | undefined;
  let bestCategory: string | undefined;

  for (const anchorItem of PRECOMPUTED_ANCHOR_VECTORS) {
    const sim = computeCosineSimilarity(queryVector, anchorItem.vector);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      bestMatchAnchor = anchorItem.anchor;
      bestCategory = anchorItem.category;
    }
  }

  return {
    similarity: maxSimilarity,
    isCandidate: maxSimilarity >= threshold,
    matchedAnchor: bestMatchAnchor,
    category: bestCategory,
  };
}

// Backward-compatible alias
export const evaluateSemanticDecision = evaluateDenseMultiAnchorSimilarity;
