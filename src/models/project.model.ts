import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  projectName: string;
  projectShortName: string;
  projectCode: string;
  entity: mongoose.Types.ObjectId;
  parentEntity?: mongoose.Types.ObjectId | null;
  address?: string;
  lat?: number;
  long?: number;
  type: 'Residential' | 'Commercial' | 'Mixed-Use' | 'Industrial' | 'Retail' | 'Office';
  totalUnits: number;
  isAvailable: boolean;
  status: 'Planning' | 'Under Construction' | 'Completed' | 'On Hold' | 'Cancelled';
  completionDate?: Date;
  aiOverview?: string;
  lastSyncDateTime?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  isActive(): boolean;
  isCompleted(): boolean;
  isUnderConstruction(): boolean;
  getLocation(): any;
  getProjectSummary(): any;
}

const projectSchema = new Schema<IProject>(
  {
    projectName: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      minlength: [2, 'Project name must be at least 2 characters'],
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    projectShortName: {
      type: String,
      required: [true, 'Project short name is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Project short name must be at least 2 characters'],
      maxlength: [10, 'Project short name cannot exceed 10 characters'],
      match: [/^[A-Z0-9]+$/, 'Project short name must contain only uppercase letters and numbers'],
    },
    projectCode: {
      type: String,
      required: [true, 'Project code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9]+$/, 'Project code must contain only uppercase letters and numbers'],
    },
    entity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    parentEntity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      default: null,
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters'],
    },
    lat: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    long: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    type: {
      type: String,
      enum: ['Residential', 'Commercial', 'Mixed-Use', 'Industrial', 'Retail', 'Office'],
      default: 'Residential',
    },
    totalUnits: {
      type: Number,
      default: 0,
      min: [0, 'Total units cannot be negative'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['Planning', 'Under Construction', 'Completed', 'On Hold', 'Cancelled'],
      default: 'Planning',
    },
    completionDate: {
      type: Date,
    },
    aiOverview: {
      type: String,
      trim: true,
    },
    lastSyncDateTime: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better performance
projectSchema.index({ projectCode: 1 }, 
  // { unique: true }
);
projectSchema.index({ projectShortName: 1 }, 
  // { unique: true }
);
projectSchema.index({ entity: 1 });
projectSchema.index({ parentEntity: 1 });
projectSchema.index({ type: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ isAvailable: 1 });

// Business logic methods
projectSchema.methods.isActive = function () {
  return this.isAvailable && this.status !== 'Cancelled';
};

projectSchema.methods.isCompleted = function () {
  return this.status === 'Completed';
};

projectSchema.methods.isUnderConstruction = function () {
  return this.status === 'Under Construction';
};

projectSchema.methods.getLocation = function () {
  if (this.lat && this.long) {
    return {
      latitude: this.lat,
      longitude: this.long,
      hasCoordinates: true,
    };
  }
  return {
    address: this.address,
    hasCoordinates: false,
  };
};

projectSchema.methods.getProjectSummary = function () {
  return {
    name: this.projectName,
    shortName: this.projectShortName,
    code: this.projectCode,
    type: this.type,
    status: this.status,
    totalUnits: this.totalUnits,
    isActive: this.isActive(),
    location: this.getLocation(),
  };
};

// Virtual for project status
projectSchema.virtual('projectStatus').get(function () {
  if (this.isCompleted()) return 'completed';
  if (this.isUnderConstruction()) return 'construction';
  if (this.status === 'Planning') return 'planning';
  return 'other';
});

// Static methods for business logic
projectSchema.statics.findByEntity = function (entityId: mongoose.Types.ObjectId) {
  return this.find({ entity: entityId, isAvailable: true });
};

projectSchema.statics.findByType = function (type: string) {
  return this.find({ type, isAvailable: true });
};

projectSchema.statics.findByStatus = function (status: string) {
  return this.find({ status, isAvailable: true });
};

projectSchema.statics.getProjectStatistics = function (entityId: mongoose.Types.ObjectId | null = null) {
  const matchQuery: any = { isAvailable: true };
  if (entityId) matchQuery.entity = entityId;

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalProjects: { $sum: 1 },
        totalUnits: { $sum: '$totalUnits' },
        byType: {
          $push: {
            type: '$type',
            units: '$totalUnits',
          },
        },
        byStatus: {
          $push: {
            status: '$status',
            count: 1,
          },
        },
      },
    },
  ]);
};

const Project = mongoose.model<IProject>('Project', projectSchema);

export default Project;

