const UNIQUE_PATTERN = /UNIQUE constraint failed: (\w+)\.(\w+)/;

/**
 * If err (or anything in its cause chain) is a SQLite unique-constraint violation, return
 * { table, column }. Otherwise return null. Drizzle wraps driver errors, so the cause chain
 * is walked.
 */
export function uniqueViolation(err) {
  let current = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const match = UNIQUE_PATTERN.exec(String(current.message ?? ''));
    if (match) {
      return { table: match[1], column: match[2] };
    }
    current = current.cause;
  }
  return null;
}
