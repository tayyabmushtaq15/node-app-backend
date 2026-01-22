import mongoose, { Schema, Document } from 'mongoose';

export interface IInstagramInsights extends Document {
  entity?: mongoose.Types.ObjectId;
  date: Date;
  platform: 'INSTAGRAM';
  totalFollower: number;
  newFollowers: number;
  totalLikes: number;
  newLikes: number;
  totalViews: number;
  newViews: number;
  totalReach: number;
  newReach: number;
  impressions: number;
  clicks: number;
  engagement: number;
  posts: number;
  aiOverview?: string;
  lastSyncDateTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const instagramInsightsSchema = new Schema<IInstagramInsights>(
  {
    entity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: false,
    },
    date: {
      type: Date,
      required: true,
      validate: {
        validator: function (date: Date) {
          return date <= new Date();
        },
        message: 'Instagram insights date cannot be in the future',
      },
    },
    platform: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      enum: ['INSTAGRAM'],
      default: 'INSTAGRAM',
    },
    totalFollower: {
      type: Number,
      default: 0,
      min: [0, 'Total followers cannot be negative'],
    },
    newFollowers: {
      type: Number,
      default: 0,
      min: [0, 'New followers cannot be negative'],
    },
    totalLikes: {
      type: Number,
      default: 0,
      min: [0, 'Total likes cannot be negative'],
    },
    newLikes: {
      type: Number,
      default: 0,
      min: [0, 'New likes cannot be negative'],
    },
    totalViews: {
      type: Number,
      default: 0,
      min: [0, 'Total views cannot be negative'],
    },
    newViews: {
      type: Number,
      default: 0,
      min: [0, 'New views cannot be negative'],
    },
    totalReach: {
      type: Number,
      default: 0,
      min: [0, 'Total reach cannot be negative'],
    },
    newReach: {
      type: Number,
      default: 0,
      min: [0, 'New reach cannot be negative'],
    },
    impressions: {
      type: Number,
      default: 0,
      min: [0, 'Impressions cannot be negative'],
    },
    clicks: {
      type: Number,
      default: 0,
      min: [0, 'Clicks cannot be negative'],
    },
    engagement: {
      type: Number,
      default: 0,
    },
    posts: {
      type: Number,
      default: 0,
    },
    aiOverview: {
      type: String,
    },
    lastSyncDateTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Ensure one record per entity + platform + date
instagramInsightsSchema.index({ entity: 1, platform: 1, date: 1 }, { unique: true });
instagramInsightsSchema.index({ platform: 1 });
instagramInsightsSchema.index({ date: -1 });

// Business logic methods
instagramInsightsSchema.methods.getEngagementRate = function (): number {
  if (this.totalFollower === 0) return 0;
  return Math.round((this.engagement / this.totalFollower) * 100);
};

instagramInsightsSchema.methods.getGrowthRate = function (): number {
  if (this.totalFollower === 0) return 0;
  return Math.round((this.newFollowers / this.totalFollower) * 100);
};

instagramInsightsSchema.methods.getClickThroughRate = function (): number {
  if (this.impressions === 0) return 0;
  return Math.round((this.clicks / this.impressions) * 100);
};

// Prevent OverwriteModelError when using Nodemon/Hot reload
const InstagramInsights =
  mongoose.models.InstagramInsights ||
  mongoose.model<IInstagramInsights>('InstagramInsights', instagramInsightsSchema);

export default InstagramInsights;

