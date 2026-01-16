# Node.js Authentication System

A secure authentication system built with TypeScript, Express.js, MongoDB, and Redis.

## Features

- User registration and login
- JWT-based authentication
- Role-based access control (Admin/User)
- Password hashing with bcrypt
- Input validation
- MongoDB for data storage
- Redis for caching (ready for OTP/2FA)

## Prerequisites

- Node.js (v18 or higher)
- MongoDB running on localhost:27017
- Redis running on localhost:6379

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
- Copy `.env` and update the values as needed
- Make sure `JWT_SECRET` is set to a strong secret key

3. Start the development server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token

### Users (Protected)
- `GET /api/users` - Get all users (Admin only)
- `GET /api/users/:id` - Get user by ID (Admin: any, User: own only)
- `PUT /api/users/:id` - Update user (Admin: any, User: own only)
- `DELETE /api/users/:id` - Delete user (Admin only)

## Usage

### Register a new user
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "user"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Access protected routes
Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Project Structure

```
src/
├── config/          # Database and configuration files
├── models/          # Mongoose models
├── routes/          # Express routes
├── controllers/     # Business logic
├── middleware/      # Custom middleware
├── utils/           # Utility functions
├── types/           # TypeScript interfaces
├── app.ts           # Express app setup
└── index.ts         # Entry point
```

## Future Enhancements

- Forgot password flow
- Email verification with OTP
- Two-factor authentication (2FA)
- OTP setup and verification

