import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { checkLoginLockout } from '../services/rateLimit.service';

const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '10', 10);

/**
 * Middleware to check login rate limit
 * Can be used for other endpoints that need rate limiting
 */
export const checkLoginRateLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const email = req.body.email;
    
    if (!email) {
      // If no email, skip rate limiting
      next();
      return;
    }

    // Get client IP address
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Check if locked out
    const lockoutCheck = await checkLoginLockout(email, clientIp);
    
    if (lockoutCheck?.locked) {
      const retryAfterMinutes = Math.ceil((lockoutCheck.retryAfter || 0) / 60);
      res.status(429).json({
        success: false,
        message: `Too many failed login attempts. Please try again after ${retryAfterMinutes} minute(s).`,
        lockout: true,
        retryAfter: lockoutCheck.retryAfter,
      });
      return;
    }

    next();
  } catch (error) {
    // On error, allow request (fail open)
    console.error('❌ Rate limit middleware error:', error);
    next();
  }
};

