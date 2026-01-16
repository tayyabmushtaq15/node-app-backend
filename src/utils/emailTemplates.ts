export const getPasswordResetOTPTemplate = (otp: string, expiryMinutes: number): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .otp-box { background-color: #fff; border: 2px dashed #4CAF50; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #4CAF50; letter-spacing: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { color: #ff9800; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>You have requested to reset your password. Use the OTP below to verify your identity:</p>
          <div class="otp-box">
            <p style="margin: 0 0 10px 0;">Your OTP Code:</p>
            <div class="otp-code">${otp}</div>
          </div>
          <p class="warning">⚠️ This OTP will expire in ${expiryMinutes} minutes.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const getEmailVerificationOTPTemplate = (otp: string, expiryMinutes: number): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .otp-box { background-color: #fff; border: 2px dashed #2196F3; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #2196F3; letter-spacing: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { color: #ff9800; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email Address</h1>
        </div>
        <div class="content">
          <p>Thank you for registering! Please verify your email address using the OTP below:</p>
          <div class="otp-box">
            <p style="margin: 0 0 10px 0;">Your Verification Code:</p>
            <div class="otp-code">${otp}</div>
          </div>
          <p class="warning">⚠️ This OTP will expire in ${expiryMinutes} minutes.</p>
          <p>If you did not create an account, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const getGenericOTPTemplate = (otp: string, purpose: string, expiryMinutes: number): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #9C27B0; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .otp-box { background-color: #fff; border: 2px dashed #9C27B0; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #9C27B0; letter-spacing: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { color: #ff9800; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>OTP Verification</h1>
        </div>
        <div class="content">
          <p>You have requested an OTP for: <strong>${purpose}</strong></p>
          <div class="otp-box">
            <p style="margin: 0 0 10px 0;">Your OTP Code:</p>
            <div class="otp-code">${otp}</div>
          </div>
          <p class="warning">⚠️ This OTP will expire in ${expiryMinutes} minutes.</p>
          <p>If you did not request this OTP, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

