import { Router } from 'express';
import {
  syncProcurement,
  getProcurementOrders,
  getProcurementOrderById,
  getProcurementSummary,
  getProcurementCardData,
  getProcurementDetail,
} from '../controllers/procurement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sync procurement purchase order data - Admin only
router.post('/sync', requireAdmin, syncProcurement);

// Get procurement summary - Authenticated users (must come before /:purchId)
router.get('/summary', getProcurementSummary);

// Get procurement card data - Authenticated users (must come before /:purchId)
router.get('/card-data', getProcurementCardData);

// Get procurement detail with date grouping - Authenticated users (must come before /:purchId)
router.get('/detail', getProcurementDetail);

// Get procurement purchase orders - Authenticated users
router.get('/', getProcurementOrders);

// Get procurement purchase order by ID - Authenticated users
router.get('/:purchId', getProcurementOrderById);

export default router;

