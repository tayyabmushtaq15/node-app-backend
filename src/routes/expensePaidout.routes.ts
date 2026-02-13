import { Router } from 'express';
import {
  syncExpensePaidout,
  getExpensePaidoutData,
  getExpenseSummary,
  getExpenseCategorySummary,
  getExpensePaidoutDetail,
} from '../controllers/expensePaidout.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import {
  validateSyncExpensePaidout,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync expense paidout data - Admin only
router.post(
  '/sync',
  requireAdmin,
  validateSyncExpensePaidout,
  handleValidationErrors,
  syncExpensePaidout
);

// Get expense paidout data - Authenticated users
router.get('/', getExpensePaidoutData);

// Get expense summary - Authenticated users
router.get('/summary', getExpenseSummary);

// Get expense category summary - Authenticated users
router.get('/category-summary', getExpenseCategorySummary);

// Get expense paidout detail with month grouping - Authenticated users
router.get('/detail', getExpensePaidoutDetail);

export default router;

