import { z } from 'zod';

const origin = z.url().refine((value) => new URL(value).origin === value, {
  message: 'must be an origin (scheme, host, optional port) with no path or trailing slash',
});

const corsOrigins = z
  .string()
  .default('http://localhost:5173')
  .transform((value) =>
    value
      .split(',')
      // A trailing slash is the most common copy-paste slip (browsers show URLs with one), and an
      // origin never has one, so it is removed instead of failing the deploy.
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
  .pipe(z.array(origin).min(1));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: corsOrigins,
    DATABASE_URL: z.string().min(1).default('file:./data/chatify.db'),
    DATABASE_AUTH_TOKEN: z
      .string()
      .optional()
      .transform((value) => value || undefined),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).default(604800),
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    // Cloudflare R2 (required when STORAGE_DRIVER=r2)
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ENDPOINT: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.url().optional()),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    // Optional public URL of this service (for example https://chatify.onrender.com). When set,
    // the server pings its own health endpoint every 10 minutes so a free instance stays awake.
    KEEP_ALIVE_URL: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.url().optional()),
    UPLOAD_DIR: z.string().min(1).default('./data/uploads'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(26214400),
    CLIENT_DIST_DIR: z
      .string()
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((value, ctx) => {
    const isLocalFile = value.DATABASE_URL.startsWith('file:');
    if (!isLocalFile && !value.DATABASE_AUTH_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_AUTH_TOKEN'],
        message: 'is required when DATABASE_URL points at a remote Turso database',
      });
    }
    if (value.STORAGE_DRIVER === 'r2') {
      for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
        if (!value[name]) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when STORAGE_DRIVER=r2',
          });
        }
      }
      if (!value.R2_ENDPOINT && !value.R2_ACCOUNT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['R2_ACCOUNT_ID'],
          message: 'is required when STORAGE_DRIVER=r2 and R2_ENDPOINT is not set',
        });
      }
    }
    if (value.NODE_ENV === 'production' && isLocalFile) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'must be a Turso libsql:// URL in production, not a local file',
      });
    }
  });

/**
 * Validate a raw environment object and return a frozen, typed config.
 * Throws one error listing every problem so misconfiguration is fixed in a single pass.
 */
export function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze({
    ...result.data,
    isProduction: result.data.NODE_ENV === 'production',
  });
}
