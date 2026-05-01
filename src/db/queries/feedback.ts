import pool from '../client';

export async function insertFeedback(message: string): Promise<void> {
  await pool.query('INSERT INTO feedback (message) VALUES ($1)', [message]);
}
