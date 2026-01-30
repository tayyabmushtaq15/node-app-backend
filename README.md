# Dashboard Backend API

A comprehensive Node.js backend system built with TypeScript and Express.js that powers a business intelligence dashboard. This system integrates with multiple external services to synchronize financial, sales, procurement, and social media data, providing a unified API for real-time business insights.

## What This System Does

This backend serves as the central data hub for a business dashboard, automatically collecting and organizing information from various sources:

- **Financial Data**: Bank reserves, expenses, and cash flow tracking from Microsoft Dynamics 365
- **Sales & Revenue**: Collection data and revenue reservations from Zoho Analytics
- **Procurement**: Purchase orders and vendor information from Dynamics 365
- **Social Media**: Instagram insights and Google My Business reviews from Windsor.ai
- **User Management**: Secure authentication, role-based access control, and user administration

The system runs automated daily sync jobs to keep all data up-to-date, ensuring your dashboard always shows the latest information without manual intervention.

## Key Features

### 🔐 Authentication & Security
- JWT-based authentication with secure token management
- Role-based access control (Admin/User roles)
- Password hashing with bcrypt
- One-time password (OTP) support for email verification
- Password reset functionality
- Rate limiting to prevent abuse
- Input validation and sanitization

### 📊 Data Synchronization
- **Automated Daily Syncs**: Runs scheduled jobs every day at 11:34 AM Dubai time
- **Multi-Source Integration**: Connects to Microsoft Dynamics 365, Zoho Analytics, and Windsor.ai APIs
- **Intelligent Sync**: Tracks sync status, prevents duplicates, and handles errors gracefully
- **Comprehensive Logging**: Detailed logs for monitoring sync operations and troubleshooting

### 🗄️ Data Management
- MongoDB for persistent data storage
- Redis for caching and session management
- Optimized database queries with proper indexing
- Data models for all business entities (entities, projects, financial records, etc.)

### 📧 Communication
- Email service integration for OTP delivery and notifications
- Configurable email templates
- SMTP support for reliable email delivery

## System Architecture

### Technology Stack
- **Runtime**: Node.js (v18+)
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis
- **Scheduling**: node-cron for automated sync jobs
- **Email**: Nodemailer
- **HTTP Client**: Axios for external API calls

### Project Structure

```
src/
├── config/          # Configuration files (database, Redis, email, JWT, environment)
├── models/          # Mongoose data models
├── routes/          # Express route definitions
├── controllers/     # Business logic handlers
├── services/        # Core services (sync, API integrations, utilities)
├── middleware/      # Custom middleware (auth, validation, rate limiting)
├── utils/           # Helper functions and utilities
├── types/           # TypeScript type definitions
├── scripts/         # Database seeding and maintenance scripts
├── app.ts           # Express application setup
└── index.ts         # Application entry point
```

## Prerequisites

Before running this system, ensure you have:

- **Node.js** (v18 or higher)
- **MongoDB** running and accessible (default: localhost:27017)
- **Redis** running and accessible (default: localhost:6379)
- **Environment Variables** configured (see Configuration section)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Copy `.env.example` to `.env` (if available) or create a new `.env` file
   - Configure all required environment variables (see Configuration section)

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

   Or start the production server:
   ```bash
   npm start
   ```

## Configuration

The system requires several environment variables to function properly. Create a `.env` file in the root directory with the following:

### Database Configuration
- `MONGODB_URI` - MongoDB connection string
- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)

### Authentication & Security
- `JWT_SECRET` - Secret key for JWT token signing (use a strong, random string)
- `JWT_EXPIRES_IN` - JWT token expiration time (e.g., "24h")
- `NODE_ENV` - Environment mode (development/production)

### External API Keys
- `DYNAMICS_CLIENT_ID` - Microsoft Dynamics 365 client ID
- `DYNAMICS_CLIENT_SECRET` - Microsoft Dynamics 365 client secret
- `DYNAMICS_TENANT_ID` - Microsoft Dynamics 365 tenant ID
- `ZOHO_CLIENT_ID` - Zoho Analytics client ID
- `ZOHO_CLIENT_SECRET` - Zoho Analytics client secret
- `ZOHO_REFRESH_TOKEN` - Zoho Analytics refresh token
- `WINDSOR_INSTAGRAM_API_KEY` - Windsor.ai Instagram API key
- `WINDSOR_GOOGLE_API_KEY` - Windsor.ai Google My Business API key

### Email Configuration
- `EMAIL_HOST` - SMTP server host
- `EMAIL_PORT` - SMTP server port
- `EMAIL_USER` - SMTP username
- `EMAIL_PASS` - SMTP password
- `EMAIL_FROM` - Default sender email address

### Server Configuration
- `PORT` - Server port (default: 3000)

## Automated Data Synchronization

The system includes a built-in scheduler that automatically syncs data from external sources daily. The sync runs at **11:34 AM Dubai time (Asia/Dubai timezone)** and processes the following data sources in sequence:

1. **Finance Reserve** - Bank group summaries from Dynamics 365
2. **Sales Collection** - Yesterday's sales collection data from Zoho Analytics
3. **Revenue Reservation** - Yesterday's revenue reservation data from Zoho Analytics
4. **Procurement** - Purchase orders from Dynamics 365
5. **Expense Paidout** - Expense data for the last 30 days from Dynamics 365
6. **Instagram Insights** - Social media metrics from Windsor.ai

Each sync operation:
- Tracks execution time and success status
- Prevents duplicate records
- Logs detailed information for monitoring
- Handles errors gracefully without stopping other syncs
- Provides a comprehensive summary at the end

The scheduler automatically starts when the server starts and can be gracefully stopped during server shutdown.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and receive JWT token
- `GET /api/auth/profile` - Get current user profile (protected)
- `PUT /api/auth/profile` - Update user profile (protected)

### Password Management
- `POST /api/password/forgot` - Request password reset
- `POST /api/password/reset` - Reset password with token
- `PUT /api/password/change` - Change password (protected)

### OTP (One-Time Password)
- `POST /api/otp/send` - Send OTP to email
- `POST /api/otp/verify` - Verify OTP code

### Users (Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Financial Data
- `GET /api/finance-reserve` - Get finance reserve data (protected)
- `GET /api/expense-paidout` - Get expense paidout data (protected)

### Sales & Revenue
- `GET /api/sales-collection` - Get sales collection data (protected)
- `GET /api/revenue-reservation` - Get revenue reservation data (protected)

### Procurement
- `GET /api/procurement` - Get procurement purchase orders (protected)

### Social Media
- `GET /api/instagram-insights` - Get Instagram insights data (protected)
- `POST /api/instagram-insights/sync` - Manually trigger Instagram sync (protected)
- `GET /api/google-reviews` - Get Google reviews data (protected)

### Health Check
- `GET /health` - Server health status

## Usage Examples

### Register a New User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "role": "user"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

Response includes a JWT token that should be used for authenticated requests.

### Access Protected Routes
Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Manually Trigger Instagram Sync
```bash
POST /api/instagram-insights/sync
Authorization: Bearer <your-jwt-token>
```

## Development

### Running in Development Mode
```bash
npm run dev
```
This starts the server with hot-reload using `ts-node-dev`.

### Building for Production
```bash
npm run build
```
This compiles TypeScript to JavaScript in the `dist/` directory.

### Linting
```bash
npm run lint
```

### Database Scripts
The system includes utility scripts for database maintenance:
- `scripts/seedEntities.ts` - Seed entity data
- `scripts/seedProjects.ts` - Seed project data
- `scripts/fixSalesCollectionIndexes.ts` - Fix database indexes

## Error Handling

The system includes comprehensive error handling:
- Global error handler middleware catches all unhandled errors
- Standardized error response format
- Detailed error logging for debugging
- Graceful error recovery in sync operations

## Security Features

- **Password Security**: Passwords are hashed using bcrypt before storage
- **JWT Tokens**: Secure token-based authentication with expiration
- **Rate Limiting**: Prevents API abuse and brute force attacks
- **Input Validation**: All inputs are validated and sanitized
- **CORS**: Configurable cross-origin resource sharing
- **Environment Variables**: Sensitive data stored in environment variables

## Monitoring & Logging

The system provides detailed logging for:
- Server startup and shutdown
- Database connection status
- Sync job execution and results
- API requests and responses
- Error occurrences and stack traces
- Authentication attempts

All sync operations generate comprehensive summaries showing:
- Total execution time
- Success/failure status for each sync
- Number of records processed
- Any errors encountered

## Graceful Shutdown

The server implements graceful shutdown handling:
- Stops the sync scheduler before shutting down
- Closes HTTP server connections properly
- Handles SIGTERM and SIGINT signals
- Force shutdown after 10 seconds if needed
- Catches unhandled promise rejections and exceptions

## Troubleshooting

### Common Issues

**MongoDB Connection Failed**
- Verify MongoDB is running
- Check `MONGODB_URI` in `.env` file
- Ensure network connectivity to MongoDB server

**Redis Connection Failed**
- Verify Redis is running
- Check `REDIS_HOST` and `REDIS_PORT` in `.env` file
- Test Redis connection: `redis-cli ping`

**Sync Jobs Not Running**
- Check server logs for scheduler initialization
- Verify cron expression in `scheduler.service.ts`
- Ensure server timezone is correct (should use Asia/Dubai)

**Authentication Errors**
- Verify `JWT_SECRET` is set in `.env`
- Check token expiration time
- Ensure token is included in Authorization header

**External API Errors**
- Verify API keys are correct in `.env`
- Check API rate limits
- Review error logs for specific API error messages

## Future Enhancements

Potential improvements and features:
- Enhanced monitoring dashboard
- Webhook support for real-time updates
- Data export functionality
- Advanced analytics and reporting
- Multi-tenant support
- API documentation with Swagger/OpenAPI
- Unit and integration tests
- Docker containerization
- CI/CD pipeline integration

## Support

For issues, questions, or contributions, please refer to the project documentation or contact the development team.

## License

ISC
