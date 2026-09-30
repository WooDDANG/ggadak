/**
 * Lightweight Semantic Text Embedding & Cosine Similarity Scorer
 * Performs semantic decision matching for Korean and English text without external heavy dependencies.
 */

export interface SemanticMatchResult {
  similarity: number; // 0.0 to 1.0
  isCandidate: boolean;
  matchedAnchor?: string;
  category?: string;
}

// Curated Decision Anchors spanning technical, architecture, scheduling and product consensus
export const DECISION_ANCHOR_CORPUS: Array<{ anchor: string; category: string }> = [
  // Korean Technical & Architecture Decision Anchors
  { anchor: '우리는 메인 데이터베이스로 PostgreSQL을 도입하기로 결정했습니다', category: '기술' },
  { anchor: '서버 프레임워크는 Fastify로 확정하고 개발을 진행하겠습니다', category: '기술' },
  { anchor: '인증 시스템은 Supabase Auth를 채택하기로 합의했습니다', category: '기능' },
  { anchor: '이번 스프린트 기능 범위는 알림 시스템 우선으로 못박죠', category: '기능' },
  { anchor: '아키텍처 설계는 모듈러 모놀리스 구조로 가닥을 잡았습니다', category: '기술' },
  { anchor: '결제 모듈을 이번 릴리즈에서 제외하고 다음 버전으로 넘기기로 결정했습니다', category: '기능' },
  { anchor: '회의 결과 해당 방안을 최종 채택하고 작업을 분배합시다', category: '기타' },
  { anchor: '이 안건은 팀원 전원 동의로 통과 및 픽스되었습니다', category: '기타' },
  { anchor: 'API 명세 및 데이터 모델은 RESTful 규격으로 통일하기로 합의했습니다', category: '기술' },
  { anchor: '배포 파이프라인은 GitHub Actions와 Docker로 구축하기로 결정했습니다', category: '인프라' },
  { anchor: 'UI 라이브러리는 Tailwind CSS와 Lucide React로 가시죠', category: '기술' },
  { anchor: '모든 합의 사항을 확정하고 다음 단계로 진행하겠습니다', category: '기타' },

  // English Decision Anchors
  { anchor: 'We have decided to adopt PostgreSQL as our primary database', category: 'technology' },
  { anchor: 'Let us finalize Fastify as our main HTTP backend framework', category: 'technology' },
  { anchor: 'We agreed to prioritize the notification system for this sprint', category: 'feature' },
  { anchor: 'The architecture direction is confirmed to be modular monolith', category: 'architecture' },
  { anchor: 'All team members agreed on this technical RFC proposal', category: 'decision' },
];

/**
 * Tokenizes text into normalized word tokens and character n-grams (2-gram, 3-gram)
 * to effectively capture Korean agglutinative morphemes and semantic stems.
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
    addFeature(`w:${words[i]}`, 1.5);
  }

  // 2. Character n-grams (2-gram and 3-gram) on compact string
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= compact.length - n; i++) {
      const sub = compact.slice(i, i + n);
      addFeature(`ng:${sub}`, 1.2);
    }
  }

  // 3. Core decision morpheme stems boost
  const STEMS = ['결정', '확정', '합의', '채택', '도입', '진행', '우선', '선택', '픽스', 'decid', 'adopt', 'agree', 'final'];
  for (const stem of STEMS) {
    if (normalized.includes(stem)) {
      addFeature(`stem:${stem}`, 3.0);
    }
  }

  return featureMap;
}

/**
 * Computes Cosine Similarity between two sparse feature vector maps.
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

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Pre-compute feature vectors for all anchor templates
const PRECOMPUTED_ANCHOR_VECTORS = DECISION_ANCHOR_CORPUS.map(item => ({
  anchor: item.anchor,
  category: item.category,
  vector: extractFeatures(item.anchor),
}));

/**
 * Evaluates semantic decision intent for a given text message against anchor corpus.
 * Returns the highest cosine similarity and whether it qualifies as a decision candidate.
 */
export function evaluateSemanticDecision(
  text: string,
  threshold: number = 0.28,
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

  const roundedSim = Math.round(maxSimilarity * 1000) / 1000;

  return {
    similarity: roundedSim,
    isCandidate: roundedSim >= threshold,
    matchedAnchor: bestMatchAnchor,
    category: bestCategory,
  };
}
