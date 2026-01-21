import mongoose, { Schema, Document } from 'mongoose';

export interface IRevenueReservation extends Document {
  projectId: mongoose.Types.ObjectId;
  projectName: string;
  projectShortName: string;
  date: Date;
  stName: string;
  salesManagerName?: string;
  salesDirectorName?: string;
  reservedAmount: number;
  reservedUnits: number;
  cancelledAmount: number;
  cancelledUnits: number;
  type: string;
  dataSource: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  netReservedAmount: number;
  netReservedUnits: number;
  cancellationRate: number;

  // Methods
  getReservationSummary(): any;
}

const revenueReservationSchema = new Schema<IRevenueReservation>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Project ID is required'],
      ref: 'Project',
    },
    projectName: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    projectShortName: {
      type: String,
      required: [true, 'Project short name is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    stName: {
      type: String,
      required: [true, 'Sales team name is required'],
      trim: true,
    },
    salesManagerName: {
      type: String,
      trim: true,
    },
    salesDirectorName: {
      type: String,
      trim: true,
    },
    reservedAmount: {
      type: Number,
      required: [true, 'Reserved amount is required'],
      min: [0, 'Reserved amount cannot be negative'],
    },
    reservedUnits: {
      type: Number,
      required: [true, 'Reserved units is required'],
      min: [0, 'Reserved units cannot be negative'],
    },
    cancelledUnits: {
      type: Number,
      required: [true, 'Cancelled units is required'],
      min: [0, 'Cancelled units cannot be negative'],
      default: 0,
    },
    cancelledAmount: {
      type: Number,
      required: [true, 'Cancelled amount is required'],
      min: [0, 'Cancelled amount cannot be negative'],
      default: 0,
    },
    type: {
      type: String,
      required: [true, 'Type is required'],
      trim: true,
      default: 'Reservation',
    },
    dataSource: {
      type: String,
      required: [true, 'Data source is required'],
      trim: true,
      default: 'ZohoAnalytics',
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      trim: true,
      default: 'AED',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
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
revenueReservationSchema.index({ projectId: 1, date: 1 });
revenueReservationSchema.index({ projectName: 1 });
revenueReservationSchema.index({ projectShortName: 1 });
revenueReservationSchema.index({ date: 1 });
revenueReservationSchema.index({ stName: 1 });
revenueReservationSchema.index({ salesManagerName: 1 });
revenueReservationSchema.index({ salesDirectorName: 1 });
revenueReservationSchema.index({ type: 1 });
revenueReservationSchema.index({ dataSource: 1 });

// Virtual for net reserved amount
revenueReservationSchema.virtual('netReservedAmount').get(function () {
  return this.reservedAmount - this.cancelledAmount;
});

// Virtual for net reserved units
revenueReservationSchema.virtual('netReservedUnits').get(function () {
  return this.reservedUnits - this.cancelledUnits;
});

// Virtual for cancellation rate
revenueReservationSchema.virtual('cancellationRate').get(function () {
  if (this.reservedUnits === 0) return 0;
  return (this.cancelledUnits / this.reservedUnits) * 100;
});

// Static methods for business logic
revenueReservationSchema.statics.findByProject = function (projectId: mongoose.Types.ObjectId) {
  return this.find({ projectId });
};

revenueReservationSchema.statics.findByProjectName = function (projectName: string) {
  return this.find({ projectName });
};

revenueReservationSchema.statics.findByProjectShortName = function (projectShortName: string) {
  return this.find({ projectShortName });
};

revenueReservationSchema.statics.findByDateRange = function (startDate: Date, endDate: Date) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  });
};

revenueReservationSchema.statics.findBySalesTeam = function (stName: string) {
  return this.find({ stName });
};

revenueReservationSchema.statics.findBySalesManager = function (salesManagerName: string) {
  return this.find({ salesManagerName });
};

revenueReservationSchema.statics.findBySalesDirector = function (salesDirectorName: string) {
  return this.find({ salesDirectorName });
};

revenueReservationSchema.statics.findByType = function (type: string) {
  return this.find({ type });
};

revenueReservationSchema.statics.findByDataSource = function (dataSource: string) {
  return this.find({ dataSource });
};

// Instance method to get reservation summary
revenueReservationSchema.methods.getReservationSummary = function () {
  return {
    projectName: this.projectName,
    projectShortName: this.projectShortName,
    date: this.date,
    salesTeam: this.stName,
    salesManagerName: this.salesManagerName,
    salesDirectorName: this.salesDirectorName,
    reservedAmount: this.reservedAmount,
    reservedUnits: this.reservedUnits,
    cancelledAmount: this.cancelledAmount,
    cancelledUnits: this.cancelledUnits,
    netReservedAmount: this.netReservedAmount,
    netReservedUnits: this.netReservedUnits,
    cancellationRate: this.cancellationRate,
    type: this.type,
    currency: this.currency,
  };
};

const RevenueReservation = mongoose.model<IRevenueReservation>(
  'RevenueReservation',
  revenueReservationSchema
);

export default RevenueReservation;

