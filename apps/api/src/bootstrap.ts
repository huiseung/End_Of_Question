import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { HttpException, LogLevel } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { json, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { AnonymousRequest } from './controller';

export function configure(app: INestApplication) {
  const config = readConfig();
  const origin = new URL(config.FRONTEND_URL).origin;
  app.enableCors({ origin, credentials: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] });
  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // CORS alone does not prevent writes. Reject foreign origins and simple-form POSTs.
    if (req.method === 'POST' && (req.headers.origin && req.headers.origin !== origin || !req.is('application/json')))
      return res.status(403).json({ message: '허용되지 않은 요청입니다.' });
    const cookie = z.string().uuid().safeParse(req.cookies?.eoq_anonymous);
    const id = cookie.success ? cookie.data : randomUUID();
    (req as AnonymousRequest).anonymousId = id;
    if (!cookie.success) res.cookie('eoq_anonymous', id, {
      httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production' || config.COOKIE_SECURE === 'true',
      maxAge: 365 * 24 * 60 * 60 * 1000, path: '/', ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
    });
    next();
  });
  app.useGlobalFilters({
    catch(error: unknown, host) {
      const res = host.switchToHttp().getResponse<Response>();
      const status = error instanceof HttpException ? error.getStatus() : 500;
      res.status(status).json({ message: error instanceof HttpException ? error.message : '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    },
  });
  app.enableShutdownHooks();
}
export async function createApp() {
  const levels: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: levels.slice(0, levels.indexOf(readConfig().LOG_LEVEL) + 1) });
  configure(app);
  return app;
}
