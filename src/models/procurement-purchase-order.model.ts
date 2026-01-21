import mongoose, { Schema, Document } from 'mongoose';

export interface IProcurementPurchaseOrder extends Document {
  purchId: string;
  entityId: mongoose.Types.ObjectId;
  venderAccount: string;
  venderName: string;
  totalAmount: number;
  dataAreaId: string;
  dataSource: 'Dynamics365' | 'Manual' | 'Seeder' | 'API';
  currency: string;
  purchaseOrderStatus: 'None' | 'Backorder' | 'Received' | 'Invoiced' | 'Canceled' | 'Open order';
  approvalStatus: 'Draft' | 'In review' | 'Rejected' | 'Approved' | 'In external review' | 'Finalized' | 'Confirmed';
  createdTimestamp: Date;
  updatedTimestamp: Date;
  aiOverview?: string;
  lastSyncDateTime: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isApproved(): boolean;
  isCompleted(): boolean;
  isActive(): boolean;
  getOrderSummary(): any;
  getFormattedAmount(): string;
}

const procurementPurchaseOrderSchema = new Schema<IProcurementPurchaseOrder>(
  {
    purchId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: true,
    },
    venderAccount: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    venderName: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Vendor name must be at least 2 characters'],
      maxlength: [200, 'Vendor name cannot exceed 200 characters'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative'],
    },
    dataAreaId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9]+$/, 'Data area ID must contain only uppercase letters and numbers'],
    },
    dataSource: {
      type: String,
      enum: ['Dynamics365', 'Manual', 'Seeder', 'API'],
      default: 'Dynamics365',
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a 3-letter code'],
      default: 'AED',
    },
    purchaseOrderStatus: {
      type: String,
      required: true,
      trim: true,
      enum: ['None', 'Backorder', 'Received', 'Invoiced', 'Canceled', 'Open order'],
      default: 'None',
    },
    approvalStatus: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'Draft',
        'In review',
        'Rejected',
        'Approved',
        'In external review',
        'Finalized',
        'Confirmed',
      ],
      default: 'Draft',
    },
    createdTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    updatedTimestamp: {
      type: Date,
      default: Date.now,
    },
    aiOverview: {
      type: String,
      trim: true,
    },
    lastSyncDateTime: {
      type: Date,
      default: Date.now,
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

// Indexes for better performance
procurementPurchaseOrderSchema.index({ purchId: 1 }, { unique: true });
procurementPurchaseOrderSchema.index({ venderAccount: 1 });
procurementPurchaseOrderSchema.index({ dataAreaId: 1 });
procurementPurchaseOrderSchema.index({ purchaseOrderStatus: 1 });
procurementPurchaseOrderSchema.index({ approvalStatus: 1 });
procurementPurchaseOrderSchema.index({ createdTimestamp: -1 });
procurementPurchaseOrderSchema.index({ totalAmount: -1 });

// Business logic methods
procurementPurchaseOrderSchema.methods.isApproved = function () {
  return this.approvalStatus === 'Approved';
};

procurementPurchaseOrderSchema.methods.isCompleted = function () {
  return this.purchaseOrderStatus === 'Completed';
};

procurementPurchaseOrderSchema.methods.isActive = function () {
  return this.purchaseOrderStatus !== 'Cancelled' && this.purchaseOrderStatus !== 'Completed';
};

procurementPurchaseOrderSchema.methods.getOrderSummary = function () {
  return {
    purchId: this.purchId,
    venderName: this.venderName,
    totalAmount: this.totalAmount,
    currency: this.currency,
    status: this.purchaseOrderStatus,
    approvalStatus: this.approvalStatus,
    isActive: this.isActive(),
    isApproved: this.isApproved(),
  };
};

procurementPurchaseOrderSchema.methods.getFormattedAmount = function () {
  return `${this.totalAmount.toLocaleString()} ${this.currency}`;
};

// Virtual for order age
procurementPurchaseOrderSchema.virtual('orderAge').get(function () {
  const now = new Date();
  const created = this.createdTimestamp;
  const diffTime = Math.abs(now.getTime() - created.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for high value order
procurementPurchaseOrderSchema.virtual('isHighValue').get(function () {
  return this.totalAmount > 100000; // 100K threshold
});

// Static methods for business logic
procurementPurchaseOrderSchema.statics.getOrdersByVendor = function (venderAccount: string) {
  return this.find({ venderAccount, approvalStatus: { $ne: 'Draft' } }).sort({
    createdTimestamp: -1,
  });
};

procurementPurchaseOrderSchema.statics.getOrdersByStatus = function (status: string) {
  return this.find({ purchaseOrderStatus: status, approvalStatus: { $ne: 'Draft' } }).sort({
    createdTimestamp: -1,
  });
};

procurementPurchaseOrderSchema.statics.getOrdersByApprovalStatus = function (approvalStatus: string) {
  return this.find({ approvalStatus, approvalStatus: { $ne: 'Draft' } }).sort({
    createdTimestamp: -1,
  });
};

procurementPurchaseOrderSchema.statics.getOrdersByDateRange = function (
  startDate: Date,
  endDate: Date,
  dataAreaId: string | null = null
) {
  const query: any = {
    createdTimestamp: { $gte: startDate, $lte: endDate },
  };

  if (dataAreaId) {
    query.dataAreaId = dataAreaId;
  }

  return this.find({ ...query, approvalStatus: { $ne: 'Draft' } }).sort({ createdTimestamp: -1 });
};

procurementPurchaseOrderSchema.statics.getOrdersByAmountRange = function (minAmount: number, maxAmount: number) {
  return this.find({
    totalAmount: { $gte: minAmount, $lte: maxAmount },
    approvalStatus: { $ne: 'Draft' },
  }).sort({ totalAmount: -1 });
};

procurementPurchaseOrderSchema.statics.getProcurementSummary = function (
  dataAreaId: string | null = null,
  startDate: Date | null = null,
  endDate: Date | null = null
) {
  const matchQuery: any = {};

  if (dataAreaId) matchQuery.dataAreaId = dataAreaId;
  if (startDate && endDate) {
    matchQuery.createdTimestamp = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: { ...matchQuery, approvalStatus: { $ne: 'Draft' } } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        averageAmount: { $avg: '$totalAmount' },
        byStatus: {
          $push: {
            status: '$purchaseOrderStatus',
            amount: '$totalAmount',
          },
        },
        byApprovalStatus: {
          $push: {
            approvalStatus: '$approvalStatus',
            amount: '$totalAmount',
          },
        },
        byVendor: {
          $push: {
            vendor: '$venderName',
            amount: '$totalAmount',
          },
        },
      },
    },
    {
      $project: {
        totalOrders: 1,
        totalAmount: 1,
        averageAmount: { $round: ['$averageAmount', 2] },
        statusBreakdown: {
          $reduce: {
            input: '$byStatus',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $arrayToObject: [
                    [
                      {
                        k: '$$this.status',
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                { $getField: { field: '$$this.status', input: '$$value' } },
                                0,
                              ],
                            },
                            1,
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
        approvalBreakdown: {
          $reduce: {
            input: '$byApprovalStatus',
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $arrayToObject: [
                    [
                      {
                        k: '$$this.approvalStatus',
                        v: {
                          $add: [
                            {
                              $ifNull: [
                                { $getField: { field: '$$this.approvalStatus', input: '$$value' } },
                                0,
                              ],
                            },
                            1,
                          ],
                        },
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
      },
    },
  ]);
};

procurementPurchaseOrderSchema.statics.getProcurementSummary30Days = async function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Last 30 days (excluding today)
  const last30DaysEnd = new Date(today);
  last30DaysEnd.setDate(last30DaysEnd.getDate() - 1);
  const last30DaysStart = new Date(last30DaysEnd);
  last30DaysStart.setDate(last30DaysStart.getDate() - 29);

  // Previous 30 days (31-60 days ago)
  const prev30DaysEnd = new Date(last30DaysStart);
  prev30DaysEnd.setDate(prev30DaysEnd.getDate() - 1);
  const prev30DaysStart = new Date(prev30DaysEnd);
  prev30DaysStart.setDate(prev30DaysStart.getDate() - 29);

  // Helper function to get summary for a date range
  const getSummaryForRange = async (startDate: Date, endDate: Date) => {
    const result = await this.aggregate([
      {
        $match: {
          createdTimestamp: { $gte: startDate, $lte: endDate },
          approvalStatus: { $ne: 'Draft' },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          averageAmount: { $avg: '$totalAmount' },
        },
      },
    ]);

    return (
      result[0] || {
        totalOrders: 0,
        totalAmount: 0,
        averageAmount: 0,
      }
    );
  };

  // Get summaries for both periods
  const [last30DaysSummary, prev30DaysSummary] = await Promise.all([
    getSummaryForRange(last30DaysStart, last30DaysEnd),
    getSummaryForRange(prev30DaysStart, prev30DaysEnd),
  ]);

  // Calculate percentage changes
  const calculateChangePercent = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  };

  const ordersChangePercent = calculateChangePercent(
    last30DaysSummary.totalOrders,
    prev30DaysSummary.totalOrders
  );

  const amountChangePercent = calculateChangePercent(
    last30DaysSummary.totalAmount,
    prev30DaysSummary.totalAmount
  );

  const averageChangePercent = calculateChangePercent(
    last30DaysSummary.averageAmount,
    prev30DaysSummary.averageAmount
  );

  return {
    last30Days: {
      startDate: last30DaysStart,
      endDate: last30DaysEnd,
      totalOrders: last30DaysSummary.totalOrders,
      totalAmount: last30DaysSummary.totalAmount,
      averageAmount: Number(last30DaysSummary.averageAmount.toFixed(2)),
    },
    previous30Days: {
      startDate: prev30DaysStart,
      endDate: prev30DaysEnd,
      totalOrders: prev30DaysSummary.totalOrders,
      totalAmount: prev30DaysSummary.totalAmount,
      averageAmount: Number(prev30DaysSummary.averageAmount.toFixed(2)),
    },
    changePercent: {
      orders: ordersChangePercent,
      amount: amountChangePercent,
      average: averageChangePercent,
    },
  };
};

// Pre-save middleware to update updatedTimestamp
procurementPurchaseOrderSchema.pre('save', function (next) {
  this.updatedTimestamp = new Date();
  next();
});

// Pre-update middleware to update updatedTimestamp
procurementPurchaseOrderSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedTimestamp: new Date() });
  next();
});

const ProcurementPurchaseOrder = mongoose.model<IProcurementPurchaseOrder>(
  'ProcurementPurchaseOrder',
  procurementPurchaseOrderSchema
);

export default ProcurementPurchaseOrder;

