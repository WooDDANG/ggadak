export interface NvidiaCredential {
  name: string;
  apiKey: string;
}

export function nvidiaCredentials(env: NodeJS.ProcessEnv): NvidiaCredential[] {
  const numbered = [1, 2, 3, 4].map(n => `NVIDIA_API_KEY_${n}`);
  const names = numbered.some(name => env[name]?.trim()) ? numbered : ['NVIDIA_API_KEY'];
  const seen = new Set<string>();
  return names.flatMap(name => {
    const apiKey = env[name]?.trim();
    if (!apiKey || seen.has(apiKey)) return [];
    seen.add(apiKey);
    return [{ name, apiKey }];
  });
}
