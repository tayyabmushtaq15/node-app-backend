import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import passwordRoutes from './password.routes';
import otpRoutes from './otp.routes';
import financeReserveRoutes from './financeReserve.routes';
import expensePaidoutRoutes from './expensePaidout.routes';
import procurementRoutes from './procurement.routes';
import salesCollectionRoutes from './salesCollection.routes';
import revenueReservationRoutes from './revenue-reservation.routes';
import instagramInsightsRoutes from './instagram-insights.routes';
import googleReviewRoutes from './google-review.routes';

/**
 * Route configuration interface
 */
interface RouteConfig {
  path: string;
  router: Router;
}

/**
 * All application routes configuration
 */
export const routes: RouteConfig[] = [
  { path: '/api/auth', router: authRoutes },
  { path: '/api/users', router: userRoutes },
  { path: '/api/password', router: passwordRoutes },
  { path: '/api/otp', router: otpRoutes },
  { path: '/api/finance-reserve', router: financeReserveRoutes },
  { path: '/api/expense-paidout', router: expensePaidoutRoutes },
  { path: '/api/procurement', router: procurementRoutes },
  { path: '/api/sales-collection', router: salesCollectionRoutes },
  { path: '/api/revenue-reservation', router: revenueReservationRoutes },
  { path: '/api/instagram-insights', router: instagramInsightsRoutes },
  { path: '/api/google-reviews', router: googleReviewRoutes },
];

export default routes;

