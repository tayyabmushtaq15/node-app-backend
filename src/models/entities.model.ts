import mongoose, { Schema } from 'mongoose';

export interface IEntity extends mongoose.Document {
  entityName: string;
  entityCode: string;
  entityType: number;
  entityCurrency: string;
  lastSyncDateTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const entitySchema = new Schema<IEntity>(
  {
    entityName: {
      type: String,
      required: [true, 'Entity name is required'],
      trim: true,
    },
    entityCode: {
      type: String,
      required: [true, 'Entity code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    entityType: {
      type: Number,
      default: 1,
    },
    entityCurrency: {
      type: String,
      default: 'AED',
      trim: true,
      uppercase: true,
    },
    lastSyncDateTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for entity_code for faster lookups
// entitySchema.index({ entityCode: 1 });

const Entity = mongoose.model<IEntity>('Entity', entitySchema);

export default Entity;

