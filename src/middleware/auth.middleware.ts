import { Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
import { AuthRequest } from '../types';
import { AppError } from '../utils/errors';

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = verifyToken(token);
    
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        res.status(401).json({
          success: false,
          message: 'Token expired',
        });
        return;
      }
      if (error.message === 'Invalid token') {
        res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
        return;
      }
    }
    
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

