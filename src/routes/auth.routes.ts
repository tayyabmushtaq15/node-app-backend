import { Router } from 'express';
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
} from '../controllers/auth.controller';
import {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
  validateResendVerification,
  handleValidationErrors,
} from '../middleware/validation.middleware';

const router = Router();

router.post(
  '/register',
  validateRegister,
  handleValidationErrors,
  register
);

router.post(
  '/login',
  validateLogin,
  handleValidationErrors,
  login
);

router.post(
  '/verify-email',
  validateVerifyEmail,
  handleValidationErrors,
  verifyEmail
);

router.post(
  '/resend-verification',
  validateResendVerification,
  handleValidationErrors,
  resendVerificationEmail
);

export default router;

