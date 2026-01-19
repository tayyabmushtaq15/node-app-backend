import mongoose, { Schema } from 'mongoose';

export interface IFinanceReserveBank extends mongoose.Document {
  entity: mongoose.Types.ObjectId | null;
  date: string; // yyyy-mm-dd format
  EscrowReserve: number;
  NonEscrowReserve: number;
  OtherReserve: number;
  TotalReserve: number;
  Currency: string;
  dataSource: string;
  lastSyncDateTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const financeReserveBankSchema = new Schema<IFinanceReserveBank>(
  {
    entity: {
      type: Schema.Types.ObjectId,
      ref: 'Entity',
      required: false, // Allow null for aggregate data
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in yyyy-mm-dd format'],
    },
    EscrowReserve: {
      type: Number,
      default: 0,
    },
    NonEscrowReserve: {
      type: Number,
      default: 0,
    },
    OtherReserve: {
      type: Number,
      default: 0,
    },
    TotalReserve: {
      type: Number,
      default: 0,
    },
    Currency: {
      type: String,
      trim: true,
      uppercase: true,
    },
    dataSource: {
      type: String,
      required: [true, 'Data source is required'],
      trim: true,
    },
    lastSyncDateTime: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicates (entity + date + dataSource)
// Note: entity can be null for aggregate data, so we use sparse index
financeReserveBankSchema.index(
  { entity: 1, date: 1, dataSource: 1 },
  { unique: true, sparse: true }
);
// Separate unique index for aggregate data (no entity)
financeReserveBankSchema.index(
  { date: 1, dataSource: 1 },
  { unique: true, partialFilterExpression: { entity: null } }
);

// Indexes for faster queries
financeReserveBankSchema.index({ date: 1 });
financeReserveBankSchema.index({ dataSource: 1 });
financeReserveBankSchema.index({ entity: 1, date: 1 });

const FinanceReserveBank = mongoose.model<IFinanceReserveBank>(
  'FinanceReserveBank',
  financeReserveBankSchema
);

export default FinanceReserveBank;

