import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/node-app';
    
    await mongoose.connect(dbUrl);
    
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('❌ MongoDB error:', error);
});

export default connectDB;

