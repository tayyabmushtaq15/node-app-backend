import { Router } from 'express';
import {
  syncRevenueReservation,
  getRevenueReservationData,
  getRevenueReservationSummary,
  getRevenueReservationDetail,
  getRevenueReservationByManager,
  getRevenueReservationByDirector,
  getRevenueReservationByProject,
} from '../controllers/revenue-reservation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import {
  validateSyncRevenueReservation,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync revenue reservation data - Admin only
router.post(
  '/sync',
  requireAdmin,
  validateSyncRevenueReservation,
  handleValidationErrors,
  syncRevenueReservation
);

// Get revenue reservation data - Authenticated users
router.get('/', getRevenueReservationData);

// Get revenue reservation summary - Authenticated users
router.get('/summary', getRevenueReservationSummary);

// Get revenue reservation detail with date grouping - Authenticated users
router.get('/detail', getRevenueReservationDetail);

// Get revenue reservation data aggregated by manager - Authenticated users
router.get('/by-manager', getRevenueReservationByManager);

// Get revenue reservation data aggregated by director - Authenticated users
router.get('/by-director', getRevenueReservationByDirector);

// Get revenue reservation data aggregated by project - Authenticated users
router.get('/by-project', getRevenueReservationByProject);

export default router;

