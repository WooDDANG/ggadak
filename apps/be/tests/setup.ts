export {};
// Test entrypoints must never fall through to a workspace database or external AI provider.
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.DATABASE_URL = 'file:/__ggaddak_tests_must_inject_repository__/database.sqlite';
for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'])
  delete process.env[key];
const localFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return Promise.reject(
      new Error('External network is disabled in automated tests; inject a provider'),
    );
  return localFetch(input, init);
};
