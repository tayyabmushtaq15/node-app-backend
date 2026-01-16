import { redisClient } from '../config/redis';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);

export type OTPType = 'password-reset' | 'email-verification' | 'generic';

/**
 * Generate a random OTP
 */
export const generateOTP = (): string => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
};

/**
 * Store OTP in Redis with expiry
 */
export const storeOTP = async (
  type: OTPType,
  identifier: string,
  otp: string
): Promise<void> => {
  try {
    const key = `otp:${type}:${identifier}`;
    const expirySeconds = OTP_EXPIRY_MINUTES * 60;

    await redisClient.setEx(key, expirySeconds, otp);
    console.log(`✅ OTP stored for ${type}:${identifier}`);
  } catch (error) {
    console.error('❌ Error storing OTP:', error);
    throw new Error('Failed to store OTP');
  }
};

/**
 * Verify OTP from Redis
 */
export const verifyOTP = async (
  type: OTPType,
  identifier: string,
  otp: string
): Promise<boolean> => {
  try {
    const key = `otp:${type}:${identifier}`;
    const storedOTP = await redisClient.get(key);

    if (!storedOTP) {
      return false; // OTP not found or expired
    }

    if (storedOTP !== otp) {
      return false; // OTP mismatch
    }

    // Delete OTP after successful verification (one-time use)
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('❌ Error verifying OTP:', error);
    return false;
  }
};

/**
 * Check if OTP exists (without verifying)
 */
export const checkOTPExists = async (
  type: OTPType,
  identifier: string
): Promise<boolean> => {
  try {
    const key = `otp:${type}:${identifier}`;
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('❌ Error checking OTP:', error);
    return false;
  }
};

/**
 * Delete OTP from Redis
 */
export const deleteOTP = async (
  type: OTPType,
  identifier: string
): Promise<void> => {
  try {
    const key = `otp:${type}:${identifier}`;
    await redisClient.del(key);
  } catch (error) {
    console.error('❌ Error deleting OTP:', error);
  }
};

/**
 * Get OTP expiry time in minutes
 */
export const getOTPExpiryMinutes = (): number => {
  return OTP_EXPIRY_MINUTES;
};

