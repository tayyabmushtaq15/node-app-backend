import { Response } from 'express';
import { AuthRequest, RegisterRequest, LoginRequest } from '../types';
import User from '../models/user.model';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../config/jwt';
import { sendErrorResponse } from '../utils/errors';
import { generateOTP, storeOTP, verifyOTP, getOTPExpiryMinutes } from '../services/otp.service';
import { sendEmail } from '../config/email';
import { getEmailVerificationOTPTemplate } from '../utils/emailTemplates';
import {
  checkLoginLockout,
  incrementFailedAttempt,
  resetLoginAttempts,
  getRemainingAttempts,
} from '../services/rateLimit.service';

const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '10', 10);

export const register = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { username, email, password, role = 'user' }: RegisterRequest = req.body;

    // Check if user already exists by email
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
      return;
    }

    // Check if username already exists
    const existingUserByUsername = await User.findOne({ username });
    if (existingUserByUsername) {
      res.status(400).json({
        success: false,
        message: 'Username already taken',
      });
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user with only username, email, password, and role
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role,
    });

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Send email verification OTP
    try {
      const otp = generateOTP();
      const expiryMinutes = getOTPExpiryMinutes();
      
      await storeOTP('email-verification', email, otp);
      
      const emailHtml = getEmailVerificationOTPTemplate(otp, expiryMinutes);
      await sendEmail(
        email,
        'Verify Your Email Address',
        emailHtml
      );
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification code.',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        token,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

export const login = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;
    
    // Get client IP address
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Check if user is locked out
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

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    
    // Increment failed attempt if user doesn't exist or password is wrong
    // This prevents email enumeration attacks
    if (!user) {
      const attemptInfo = await incrementFailedAttempt(email, clientIp);
      
      // Check if locked out after incrementing
      if (attemptInfo.locked) {
        const lockoutCheck = await checkLoginLockout(email, clientIp);
        const retryAfterMinutes = Math.ceil((lockoutCheck?.retryAfter || LOGIN_LOCKOUT_MINUTES * 60) / 60);
        res.status(429).json({
          success: false,
          message: `Too many failed login attempts. Please try again after ${retryAfterMinutes} minute(s).`,
          lockout: true,
          retryAfter: lockoutCheck?.retryAfter || LOGIN_LOCKOUT_MINUTES * 60,
        });
        return;
      }

      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        remainingAttempts: attemptInfo.remaining,
      });
      return;
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    
    if (!isPasswordValid) {
      const attemptInfo = await incrementFailedAttempt(email, clientIp);
      
      // Check if locked out after incrementing
      if (attemptInfo.locked) {
        const lockoutCheck = await checkLoginLockout(email, clientIp);
        const retryAfterMinutes = Math.ceil((lockoutCheck?.retryAfter || LOGIN_LOCKOUT_MINUTES * 60) / 60);
        res.status(429).json({
          success: false,
          message: `Too many failed login attempts. Please try again after ${retryAfterMinutes} minute(s).`,
          lockout: true,
          retryAfter: lockoutCheck?.retryAfter || LOGIN_LOCKOUT_MINUTES * 60,
        });
        return;
      }

      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        remainingAttempts: attemptInfo.remaining,
      });
      return;
    }

    // Login successful - reset failed attempts
    await resetLoginAttempts(email, clientIp);

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          age: user.age,
          gender: user.gender,
          phoneNumber: user.phoneNumber,
          address: user.address,
          city: user.city,
          state: user.state,
          zip: user.zip,
          country: user.country,
        },
        token,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Verify email with OTP
 */
export const verifyEmail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const isValid = await verifyOTP('email-verification', email, otp);

    if (!isValid) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
      return;
    }

    // Find user and update email verification status
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Update email verification
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Resend verification email
 */
export const resendVerificationEmail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Check if already verified
    if (user.emailVerified) {
      res.status(400).json({
        success: false,
        message: 'Email is already verified',
      });
      return;
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiryMinutes = getOTPExpiryMinutes();

    // Store OTP
    await storeOTP('email-verification', email, otp);

    // Send email
    const emailHtml = getEmailVerificationOTPTemplate(otp, expiryMinutes);
    await sendEmail(
      email,
      'Verify Your Email Address',
      emailHtml
    );

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully',
      data: {
        email: email, // For testing, remove in production
        expiresIn: expiryMinutes,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

