import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { QueryResultRow } from 'pg';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function initializeDatabase() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(currentDir, '../db/schema.sql');
  const schema = await readFile(schemaPath, 'utf8');

  await pool.query(schema);
}
