import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../utils/errors';

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
    });
    return;
  }

  next();
};

export const requireUser = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  // Users can access their own resources or admins can access any
  const requestedUserId = req.params.id;
  
  if (req.user.role === 'admin') {
    // Admin can access any user's resources
    next();
    return;
  }

  if (requestedUserId && requestedUserId !== req.user.userId) {
    res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.',
    });
    return;
  }

  next();
};

