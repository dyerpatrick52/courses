import type { Term, Course, GenerateRequest, GenerateResponse } from './types';

const BASE = '/api';

export async function fetchTerms(): Promise<Term[]> {
  const res = await fetch(`${BASE}/terms`);
  if (!res.ok) throw new Error('Failed to fetch terms');
  return res.json();
}

export async function fetchCourses(subjectCode: string): Promise<Course[]> {
  const res = await fetch(`${BASE}/subjects/${subjectCode}/courses`);
  if (!res.ok) throw new Error('Failed to fetch courses');
  return res.json();
}

export async function generateSchedules(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch(`${BASE}/schedules/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to generate schedules');
  return data;
}
