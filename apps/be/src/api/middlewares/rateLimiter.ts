import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true',
  message: {
    error: 'Too Many Requests',
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  },
});

export const aiAnalyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 AI analysis requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true',
  message: {
    error: 'Too Many Requests',
    message: 'AI 분석 요청 빈도가 너무 높습니다. 잠시 후 다시 시도해 주세요.',
  },
});
