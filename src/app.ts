import "./config/env";
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import connectDB from './config/database';
import { connectRedis } from './config/redis';
import { verifyEmailConnection } from './config/email';
import { routes } from './routes';
import { sendErrorResponse } from './utils/errors';

const app: Application = express();

// Trust proxy to get correct IP address
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
routes.forEach((route) => {
  app.use(route.path, route.router);
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  sendErrorResponse(res, err);
});

// Initialize database connections
const initializeConnections = async (): Promise<void> => {
  try {
    await connectDB();
    await connectRedis();
    await verifyEmailConnection();
  } catch (error) {
    console.error('Failed to initialize connections:', error);
    process.exit(1);
  }
};

export { initializeConnections };
export default app;

