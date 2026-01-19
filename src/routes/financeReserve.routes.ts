import { Router } from 'express';
import {
  syncFinanceReserve,
  getFinanceReserveData,
  getEntities,
  getEntityById,
  getLiquidityData,
} from '../controllers/financeReserve.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import {
  validateSyncFinanceReserve,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync finance reserve data - Admin only
router.post(
  '/sync',
  requireAdmin,
  validateSyncFinanceReserve,
  handleValidationErrors,
  syncFinanceReserve
);

// Get finance reserve data - Authenticated users
router.get('/', getFinanceReserveData);

// Get liquidity data for dashboard card - Authenticated users
router.get('/liquidity', getLiquidityData);

// Get all entities - Authenticated users
router.get('/entities', getEntities);

// Get entity by ID - Authenticated users
router.get('/entities/:id', getEntityById);

export default router;

