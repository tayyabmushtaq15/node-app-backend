import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin, requireUser } from '../middleware/role.middleware';
import {
  validateUpdateUser,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Get all users - Admin only
router.get('/', requireAdmin, getAllUsers);

// Get user by ID - Admin can get any, User can get own
router.get('/:id', requireUser, getUserById);

// Update user - Admin can update any, User can update own
router.put(
  '/:id',
  requireUser,
  validateUpdateUser,
  handleValidationErrors,
  updateUser
);

// Delete user - Admin only
router.delete('/:id', requireAdmin, deleteUser);

export default router;

