import { Response } from 'express';
import { AuthRequest } from '../types';
import { generateOTP, storeOTP, verifyOTP, getOTPExpiryMinutes, OTPType } from '../services/otp.service';
import { sendEmail } from '../config/email';
import { getGenericOTPTemplate } from '../utils/emailTemplates';
import { sendErrorResponse } from '../utils/errors';

/**
 * Generate OTP for any purpose
 */
export const generateOTPForPurpose = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, type = 'generic', purpose = 'verification' } = req.body;

    // Validate OTP type
    const validTypes: OTPType[] = ['password-reset', 'email-verification', 'generic'];
    if (!validTypes.includes(type as OTPType)) {
      res.status(400).json({
        success: false,
        message: 'Invalid OTP type. Must be: password-reset, email-verification, or generic',
      });
      return;
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryMinutes = getOTPExpiryMinutes();

    // Store OTP in Redis
    await storeOTP(type as OTPType, email, otp);

    // Send email with OTP
    const emailHtml = getGenericOTPTemplate(otp, purpose, expiryMinutes);
    await sendEmail(
      email,
      `OTP for ${purpose}`,
      emailHtml
    );

    res.status(200).json({
      success: true,
      message: 'OTP generated and sent successfully',
      data: {
        email: email, // For testing, remove in production
        type,
        purpose,
        expiresIn: expiryMinutes,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Verify OTP
 */
export const verifyOTPForPurpose = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, otp, type = 'generic' } = req.body;

    // Validate OTP type
    const validTypes: OTPType[] = ['password-reset', 'email-verification', 'generic'];
    if (!validTypes.includes(type as OTPType)) {
      res.status(400).json({
        success: false,
        message: 'Invalid OTP type. Must be: password-reset, email-verification, or generic',
      });
      return;
    }

    // Verify OTP
    const isValid = await verifyOTP(type as OTPType, email, otp);

    if (!isValid) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

