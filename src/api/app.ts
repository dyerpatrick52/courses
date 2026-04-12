import express, { Request, Response, NextFunction } from 'express';
import { getTerms } from '../db/queries/terms';
import { getAllSubjects } from '../db/queries/subjects';
import { getCoursesBySubjectCode } from '../db/queries/courses';
import { getSectionsByCourseCode } from '../db/queries/sections';
import { generateSchedules, GenerateRequest } from './schedules';
import { getRmpRating } from './rmp';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/terms', async (_req, res, next) => {
  try {
    res.json(await getTerms());
  } catch (err) { next(err); }
});

app.get('/subjects', async (_req, res, next) => {
  try {
    res.json(await getAllSubjects());
  } catch (err) { next(err); }
});

app.get('/subjects/:subjectCode/courses', async (req, res, next) => {
  try {
    const courses = await getCoursesBySubjectCode(req.params.subjectCode);
    if (courses.length === 0) {
      res.status(404).json({ error: 'Subject not found or has no courses' });
      return;
    }
    res.json(courses);
  } catch (err) { next(err); }
});

app.get('/terms/:termCode/subjects/:subjectCode/courses/:courseCode/sections', async (req, res, next) => {
  try {
    const sections = await getSectionsByCourseCode(
      req.params.termCode,
      req.params.subjectCode,
      req.params.courseCode
    );
    if (sections.length === 0) {
      res.status(404).json({ error: 'Course not found or has no sections in this term' });
      return;
    }
    res.json(sections);
  } catch (err) { next(err); }
});

app.post('/schedules/generate', async (req, res, next) => {

  try {
    const body = req.body as GenerateRequest;
    if(!body.term_code || !Array.isArray(body.courses) || body.courses.length === 0){
      res.status(400).json({error: 'term code and at least one course required'});
      return;
    }
    const schedules = await generateSchedules(body);
    res.json({count: schedules.length, schedules});


   } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }

});

app.get('/rmp/rating', async (req, res, next) => {
  try {
    const name = req.query.name as string;
    if (!name?.trim()) {
      res.status(400).json({ error: 'name query parameter required' });
      return;
    }
    res.json(await getRmpRating(name.trim()));
  } catch (err) { next(err); }
});

// 404 for unregistered routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 500 handler — four-argument signature required by Express
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
