import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.6-luna'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().default(''),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});
export function readConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error('Invalid environment variables: ' + result.error.issues.map(i => i.path.join('.')).join(', '));
  if (result.data.NODE_ENV === 'production' && (!result.data.FRONTEND_URL.startsWith('https://') || !result.data.OPENAI_API_KEY))
    throw new Error('Production requires HTTPS FRONTEND_URL and OPENAI_API_KEY');
  return result.data;
}
