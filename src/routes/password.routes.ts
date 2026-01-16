import { Router } from 'express';
import {
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} from '../controllers/password.controller';
import {
  validateForgotPassword,
  validateVerifyResetOTP,
  validateResetPassword,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

router.post(
  '/forgot',
  validateForgotPassword,
  handleValidationErrors,
  forgotPassword
);

router.post(
  '/verify-otp',
  validateVerifyResetOTP,
  handleValidationErrors,
  verifyResetOTP
);

router.post(
  '/reset',
  validateResetPassword,
  handleValidationErrors,
  resetPassword
);

export default router;

