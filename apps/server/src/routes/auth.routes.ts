import { Hono } from 'hono';
import { z } from 'zod';
import { registerEngineer } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { authFailureRateLimiter } from '../middleware/rate-limit';

export const authRoutes = new Hono();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
});

// POST /api/auth/register
authRoutes.post('/register', authFailureRateLimiter, async (c) => {
  const body = await c.req.json();
  const input = registerSchema.parse(body);
  const result = await registerEngineer(input);
  return c.json({ data: result }, 201);
});

// GET /api/auth/me
authRoutes.get('/me', authMiddleware, async (c) => {
  const engineer = c.get('engineer');
  return c.json({
    data: {
      id: engineer.id,
      name: engineer.name,
      email: engineer.email,
      role: engineer.role,
    },
  });
});
