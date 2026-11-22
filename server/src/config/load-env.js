import { parseEnv } from './env.js';

/**
 * The validated environment of the running process. Entry points (server, migration CLI) import
 * this; everything else receives config by injection so tests never touch process.env.
 */
export const env = parseEnv(process.env);
