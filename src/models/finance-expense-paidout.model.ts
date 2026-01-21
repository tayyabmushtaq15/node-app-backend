import mongoose, { Schema } from 'mongoose';

export interface IFinanceExpensePaidout extends mongoose.Document {
  entity: mongoose.Types.ObjectId | null;
  date: Date;
  Ops_Expenses: number;
  Land_Expenses: number;
  Construction_Expenses: number;
  cash_expense: number;
  Currency: string;
  data_source: string;
  last_sync_date_time: Date;
  createdAt: Date;
  updatedAt: Date;
}

const financeExpensePaidoutSchema = new Schema<IFinanceExpensePaidout>(
  {
    entity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: false, // Allow null for aggregate data
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    Ops_Expenses: {
      type: Number,
      default: 0,
    },
    Land_Expenses: {
      type: Number,
      default: 0,
    },
    Construction_Expenses: {
      type: Number,
      default: 0,
    },
    cash_expense: {
      type: Number,
      default: 0,
    },
    Currency: {
      type: String,
      default: 'AED',
      trim: true,
      uppercase: true,
    },
    data_source: {
      type: String,
      required: [true, 'Data source is required'],
      trim: true,
    },
    last_sync_date_time: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicates (entity + date + data_source)
financeExpensePaidoutSchema.index(
  { entity: 1, date: 1, data_source: 1 },
  { unique: true, sparse: true }
);

// Separate unique index for aggregate data (no entity)
financeExpensePaidoutSchema.index(
  { date: 1, data_source: 1 },
  { unique: true, partialFilterExpression: { entity: null } }
);

// Indexes for faster queries
financeExpensePaidoutSchema.index({ date: 1 });
financeExpensePaidoutSchema.index({ data_source: 1 });
financeExpensePaidoutSchema.index({ entity: 1, date: 1 });

const FinanceExpensePaidout = mongoose.model<IFinanceExpensePaidout>(
  'FinanceExpensePaidout',
  financeExpensePaidoutSchema
);

export default FinanceExpensePaidout;

