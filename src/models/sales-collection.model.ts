import mongoose, { Schema } from 'mongoose';

export interface ISalesCollection extends mongoose.Document {
  entity: mongoose.Types.ObjectId | null;
  project: mongoose.Types.ObjectId | null;
  date: Date;
  escrowCollection: number;
  nonEscrowCollection: number;
  mtdEscrowCollection: number;
  mtdNonEscrowCollection: number;
  dataSource: string;
  lastSyncDateTime: Date;
  specialType?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const salesCollectionSchema = new Schema<ISalesCollection>(
  {
    entity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: false, // Allow null for special types
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: false, // Allow null for special types
    },
    date: {
      type: Date,
    //   required: [true, 'Date is required'],
    },
    escrowCollection: {
      type: Number,
      default: 0,
      min: 0,
    },
    nonEscrowCollection: {
      type: Number,
      default: 0,
      min: 0,
    },
    mtdEscrowCollection: {
      type: Number,
      default: 0,
      min: 0,
    },
    mtdNonEscrowCollection: {
      type: Number,
      default: 0,
      min: 0,
    },
    dataSource: {
      type: String,
      required: [true, 'Data source is required'],
      trim: true,
      default: 'ZOHO SALES API',
    },
    lastSyncDateTime: {
      type: Date,
      default: Date.now,
    },
    specialType: {
      type: String,
      enum: ['Grand Summary', 'No Value'],
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

salesCollectionSchema.index(
  { specialType: 1, date: 1 },
  { 
    unique: true, 
    partialFilterExpression: { specialType: { $ne: null } } 
  }
);

// Indexes for faster queries
salesCollectionSchema.index({ date: 1 });
salesCollectionSchema.index({ entity: 1, date: 1 });
salesCollectionSchema.index({ project: 1, date: 1 });
salesCollectionSchema.index({ dataSource: 1 });
salesCollectionSchema.index({ specialType: 1 });

const SalesCollection = mongoose.model<ISalesCollection>(
  'SalesCollection',
  salesCollectionSchema
);

export default SalesCollection;

