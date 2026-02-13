import { Router } from 'express';
import {
  syncSalesCollection,
  getSalesCollectionData,
  getSalesCollectionSummary,
  getSalesCollectionDetail,
  getSalesCollectionChartData,
} from '../controllers/salesCollection.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import {
  validateSyncSalesCollection,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync sales collection data - Admin only
router.post(
  '/sync',
  requireAdmin,
  validateSyncSalesCollection,
  handleValidationErrors,
  syncSalesCollection
);

// Get sales collection data - Authenticated users
router.get('/', getSalesCollectionData);

// Get sales collection summary - Authenticated users
router.get('/summary', getSalesCollectionSummary);

// Get sales collection detail with date grouping - Authenticated users
router.get('/detail', getSalesCollectionDetail);

// Get sales collection chart data - Authenticated users
router.get('/chart-data', getSalesCollectionChartData);

export default router;

