import { Response } from 'express';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import { hashPassword } from '../utils/password';
import { sendErrorResponse } from '../utils/errors';
import { generateOTP, storeOTP, verifyOTP, getOTPExpiryMinutes } from '../services/otp.service';
import { sendEmail } from '../config/email';
import { getPasswordResetOTPTemplate } from '../utils/emailTemplates';
import { generateToken, verifyToken } from '../config/jwt';

/**
 * Forgot Password - Send OTP to user's email
 */
export const forgotPassword = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset OTP has been sent.',
      });
      return;
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryMinutes = getOTPExpiryMinutes();

    // Store OTP in Redis
    await storeOTP('password-reset', email, otp);

    // Send email with OTP
    const emailHtml = getPasswordResetOTPTemplate(otp, expiryMinutes);
    await sendEmail(
      email,
      'Password Reset Request',
      emailHtml
    );

    res.status(200).json({
      success: true,
      message: 'Password reset OTP has been sent to your email.',
      data: {
        email: email, // For testing, remove in production
        expiresIn: expiryMinutes,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Verify OTP for password reset
 * Returns a temporary token that can be used to reset password
 */
export const verifyResetOTP = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const isValid = await verifyOTP('password-reset', email, otp);

    if (!isValid) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
      return;
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Generate temporary token for password reset (expires in 15 minutes)
    const resetToken = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        resetToken,
        expiresIn: 15, // minutes
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Reset password using the temporary token from verifyResetOTP
 */
export const resetPassword = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, newPassword, resetToken } = req.body;

    // Verify reset token
    let decoded;
    try {
      decoded = verifyToken(resetToken);
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
      return;
    }

    // Verify email matches token
    if (decoded.email !== email) {
      res.status(400).json({
        success: false,
        message: 'Email does not match reset token',
      });
      return;
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

