import { Router } from 'express';
import {
  getEntities,
  getEntityById,
} from '../controllers/entities.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all entities - Authenticated users
router.get('/', getEntities);

// Get entity by ID - Authenticated users
router.get('/:id', getEntityById);

export default router;

