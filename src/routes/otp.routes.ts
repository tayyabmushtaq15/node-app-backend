import { Router } from 'express';
import {
  generateOTPForPurpose,
  verifyOTPForPurpose,
} from '../controllers/otp.controller';
import {
  validateGenerateOTP,
  validateVerifyOTP,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

router.post(
  '/generate',
  validateGenerateOTP,
  handleValidationErrors,
  generateOTPForPurpose
);

router.post(
  '/verify',
  validateVerifyOTP,
  handleValidationErrors,
  verifyOTPForPurpose
);

export default router;

