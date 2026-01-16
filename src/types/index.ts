import { Request } from 'express';
import { Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  gender?: 'male' | 'female' | 'other';
  email: string;
  password: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user';
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: 'admin' | 'user';
  };
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface LoginRequest {
  email: string;
  password: string;
}

