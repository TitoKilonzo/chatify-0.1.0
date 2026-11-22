import { ZodError } from 'zod';
import { validationFailed } from '../utils/errors.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validate request params, query, and body with zod schemas.
 * Parsed values are exposed on req.validated (Express 5 makes req.query read-only), and handlers
 * must read from req.validated instead of the raw request parts.
 *
 * Usage: router.post('/x', validate({ body: schema }), controller)
 */
export function validate(schemas) {
  return function validateRequest(req, _res, next) {
    try {
      const validated = {};
      for (const part of PARTS) {
        if (schemas[part]) {
          validated[part] = schemas[part].parse(req[part]);
        }
      }
      req.validated = validated;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          validationFailed(
            err.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}
