import { Router } from 'express';
import {
  syncInstagramInsights,
  getInstagramInsights,
  getInstagramDashboardStats,
  getInstagramTrends,
} from '../controllers/instagram-insights.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync Instagram data - Admin only
router.post('/sync', requireAdmin, syncInstagramInsights);

// Get Instagram insights data - Authenticated users
router.get('/', getInstagramInsights);

// Get summary stats for dashboard card - Authenticated users
router.get('/summary', getInstagramDashboardStats);

// Get dashboard stats - Authenticated users (legacy endpoint)
router.get('/dashboard', getInstagramDashboardStats);

// Get trends data - Authenticated users
router.get('/trends', getInstagramTrends);

export default router;

