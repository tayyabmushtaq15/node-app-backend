import mongoose, { Schema, Document } from 'mongoose';

export interface IGoogleReview extends Document {
  reviewId?: string;
  date?: Date;
  reviewer: string;
  comment: string;
  starRating?: number;
  avgRating: number;
  totalReviewCount: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const googleReviewSchema = new Schema<IGoogleReview>(
  {
    reviewId: {
      type: String,
      unique: true,
      sparse: true,
    },
    date: {
      type: Date,
    },
    reviewer: {
      type: String,
    },
    comment: {
      type: String,
    },
    starRating: {
      type: Number,
    },
    avgRating: {
      type: Number,
    },
    totalReviewCount: {
      type: Number,
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError when using Nodemon/Hot reload
const GoogleReview =
  mongoose.models.GoogleReview ||
  mongoose.model<IGoogleReview>('GoogleReview', googleReviewSchema);

export default GoogleReview;

