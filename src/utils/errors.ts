import { Response } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const sendErrorResponse = (res: Response, error: Error | AppError): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  } else {
    // Log error details in development mode for debugging
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      console.error('❌ Internal Server Error:', error);
      console.error('Error stack:', error.stack);
    } else {
      console.error('❌ Internal Server Error:', error.message);
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      ...(isDevelopment && { error: error.message, stack: error.stack }),
    });
  }
};

