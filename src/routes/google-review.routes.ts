import { Router } from 'express';
import {
  syncGoogleReviews,
  getGoogleReviews,
  getReviewStatistics,
  getAllGoogleReviews,
} from '../controllers/google-review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync Google Reviews - Admin only
router.post('/sync', requireAdmin, syncGoogleReviews);

// Get Google Reviews with filters - Authenticated users
router.get('/', getGoogleReviews);

// Get review statistics - Authenticated users
router.get('/statistics', getReviewStatistics);

// Get all reviews for dashboard - Authenticated users
router.get('/dashboard', getAllGoogleReviews);

export default router;

