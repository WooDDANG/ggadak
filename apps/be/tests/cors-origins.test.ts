import { test, expect } from 'vitest';
import { parseCorsOrigins } from '../src/config/index.js';

test('CORS 허용 주소는 브라우저 Origin 형식으로 맞추고 전체 허용(*)은 버린다', () => {
  expect(
    parseCorsOrigins(
      ' https://frontend-f28i.vercel.app/ ,http://localhost:5173,*,, https://a.example.com/app/ ',
    ),
  ).toEqual(['https://frontend-f28i.vercel.app', 'http://localhost:5173', 'https://a.example.com']);
  expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:5173', 'http://localhost:3002']);
});
