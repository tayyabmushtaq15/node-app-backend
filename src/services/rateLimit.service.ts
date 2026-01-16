import { redisClient } from '../config/redis';

const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '10', 10);
const LOCKOUT_SECONDS = LOGIN_LOCKOUT_MINUTES * 60;

/**
 * Get Redis key for login attempts
 */
const getAttemptKey = (email: string, ip: string): string => {
  return `login:attempts:${email}:${ip}`;
};

/**
 * Check if user is locked out
 * Returns lockout info if locked, null if not locked
 */
export const checkLoginLockout = async (
  email: string,
  ip: string
): Promise<{ locked: boolean; retryAfter?: number } | null> => {
  try {
    const key = getAttemptKey(email, ip);
    const attempts = await redisClient.get(key);

    if (!attempts) {
      return null; // No attempts recorded
    }

    const attemptCount = parseInt(attempts, 10);

    if (attemptCount >= MAX_LOGIN_ATTEMPTS) {
      // Check TTL to get remaining lockout time
      const ttl = await redisClient.ttl(key);
      return {
        locked: true,
        retryAfter: ttl > 0 ? ttl : LOCKOUT_SECONDS,
      };
    }

    return null; // Not locked out yet
  } catch (error) {
    console.error('❌ Error checking login lockout:', error);
    return null; // On error, allow attempt (fail open)
  }
};

/**
 * Increment failed login attempt
 */
export const incrementFailedAttempt = async (
  email: string,
  ip: string
): Promise<{ attempts: number; remaining: number; locked: boolean }> => {
  try {
    const key = getAttemptKey(email, ip);
    
    // Get current attempts or start at 0
    const currentAttempts = await redisClient.get(key);
    const attemptCount = currentAttempts ? parseInt(currentAttempts, 10) : 0;
    const newAttemptCount = attemptCount + 1;

    // Set new count with TTL (lockout period)
    // If this is the 5th attempt, the key will expire after lockout period
    await redisClient.setEx(key, LOCKOUT_SECONDS, newAttemptCount.toString());

    const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - newAttemptCount);
    const locked = newAttemptCount >= MAX_LOGIN_ATTEMPTS;

    return {
      attempts: newAttemptCount,
      remaining,
      locked,
    };
  } catch (error) {
    console.error('❌ Error incrementing failed attempt:', error);
    return {
      attempts: 0,
      remaining: MAX_LOGIN_ATTEMPTS,
      locked: false,
    };
  }
};

/**
 * Reset login attempts (on successful login)
 */
export const resetLoginAttempts = async (
  email: string,
  ip: string
): Promise<void> => {
  try {
    const key = getAttemptKey(email, ip);
    await redisClient.del(key);
  } catch (error) {
    console.error('❌ Error resetting login attempts:', error);
    // Don't throw - this is not critical
  }
};

/**
 * Get remaining login attempts
 */
export const getRemainingAttempts = async (
  email: string,
  ip: string
): Promise<number> => {
  try {
    const key = getAttemptKey(email, ip);
    const attempts = await redisClient.get(key);

    if (!attempts) {
      return MAX_LOGIN_ATTEMPTS;
    }

    const attemptCount = parseInt(attempts, 10);
    return Math.max(0, MAX_LOGIN_ATTEMPTS - attemptCount);
  } catch (error) {
    console.error('❌ Error getting remaining attempts:', error);
    return MAX_LOGIN_ATTEMPTS; // Fail open
  }
};

/**
 * Get lockout time remaining in seconds
 */
export const getLockoutTimeRemaining = async (
  email: string,
  ip: string
): Promise<number | null> => {
  try {
    const key = getAttemptKey(email, ip);
    const ttl = await redisClient.ttl(key);
    
    if (ttl > 0) {
      return ttl;
    }
    
    return null; // Not locked out
  } catch (error) {
    console.error('❌ Error getting lockout time:', error);
    return null;
  }
};

