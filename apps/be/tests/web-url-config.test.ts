import { test, expect } from 'vitest';
import { parseAuthConfig, parseCorsOrigins } from '../src/config/index.js';
import { AuthConfigurationError } from '../src/errors/AuthConfigurationError.js';

const web = 'https://frontend-f28i.vercel.app';

test('WEB_URL만 넣으면 로그인 복귀 주소가 그 주소로 정해지고, 기존 DISCORD_REDIRECT_URI는 우선한다', () => {
  expect(parseAuthConfig({ WEB_URL: `${web}/` }).redirectUri).toBe(`${web}/`);
  expect(parseAuthConfig({ WEB_URL: web }).redirectUri).toBe(`${web}/`);
  expect(
    parseAuthConfig({ WEB_URL: web, DISCORD_REDIRECT_URI: 'https://other.example.com/cb' })
      .redirectUri,
  ).toBe('https://other.example.com/cb');
  expect(parseAuthConfig({}).redirectUri).toBe('');
  expect(parseAuthConfig({ WEB_URL: 'not a url' }).redirectUri).toBe('');
});

test('WEB_URL 주소는 허용 출처에 자동으로 한 번만 들어간다', () => {
  expect(parseCorsOrigins(undefined, `${web}/`)).toEqual([
    'http://localhost:5173',
    'http://localhost:3002',
    web,
  ]);
  expect(parseCorsOrigins(`${web}/`, web)).toEqual([web]);
});

test('로그인 미설정 안내는 WEB_URL을 안내한다', () => {
  expect(new AuthConfigurationError(['redirectUri']).message).toContain('WEB_URL');
});
