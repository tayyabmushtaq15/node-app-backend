import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import InstagramInsights from '../models/instagram-insights.model';
import { syncInstagramData } from '../services/instagram-sync.service';
import { sendErrorResponse, AppError } from '../utils/errors';

/**
 * Manual trigger for Instagram data sync (Admin only)
 */
export const syncInstagramInsights = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    console.log('🔄 Manual Instagram sync triggered by user');

    await syncInstagramData();

    res.status(200).json({
      success: true,
      message: 'Instagram data synced successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Instagram insights with pagination and filters
 */
export const getInstagramInsights = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Filter parameters
    const entityId = req.query.entityId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build match query
    const match: any = {
      platform: 'INSTAGRAM',
    };

    // Apply entity filter
    if (entityId && typeof entityId === 'string' && entityId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(entityId)) {
        match.entity = new mongoose.Types.ObjectId(entityId);
      }
    }

    // Date range filter
    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        match.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    // Get total count
    const total = await InstagramInsights.countDocuments(match);

    // Get paginated results
    const records = await InstagramInsights.find(match)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('entity', 'entityName entityCode')
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Instagram insights retrieved successfully',
      data: {
        records,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          entityId: entityId || null,
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Instagram dashboard stats (latest snapshot with month-to-date)
 * Returns: Total followers, Yesterday's new followers and reach, Month-to-date sum
 */
export const getInstagramDashboardStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityId = req.query.entityId as string | undefined;

    // Build base match query
    const baseMatch: any = {
      platform: 'INSTAGRAM',
    };

    // Apply entity filter only if provided and valid
    // If entityId is empty or invalid, show aggregate data (all entities)
    if (entityId && typeof entityId === 'string' && entityId.trim() !== '') {
      if (mongoose.Types.ObjectId.isValid(entityId)) {
        baseMatch.entity = new mongoose.Types.ObjectId(entityId);
      }
      // If entityId is provided but invalid, we'll query without entity filter (aggregate)
    }

    // Get latest record for Instagram (for total followers)
    const latest = await InstagramInsights.findOne(baseMatch)
      .sort({ date: -1, updatedAt: -1 });

    // Calculate yesterday's date range
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    today.setUTCMilliseconds(0);

    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCMilliseconds(0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setUTCHours(23, 59, 59, 999);
    yesterdayEnd.setUTCMilliseconds(999);

    // Get yesterday's record
    const yesterdayMatch = {
      ...baseMatch,
      date: {
        $gte: yesterday,
        $lte: yesterdayEnd,
      },
    };
    const yesterdayRecord = await InstagramInsights.findOne(yesterdayMatch);

    // Calculate Month-To-Date range
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );

    // Sum all newFollowers from month start to now (including today)
    const monthToDateMatch = {
      ...baseMatch,
      date: {
        $gte: monthStart,
        $lte: now,
      },
    };

    const monthToDateResult = await InstagramInsights.aggregate([
      {
        $match: monthToDateMatch,
      },
      {
        $group: {
          _id: null,
          totalNewFollowers: { $sum: '$newFollowers' },
        },
      },
    ]);

    const monthToDate = monthToDateResult[0]?.totalNewFollowers || 0;

    // Return formatted response
    res.status(200).json({
      success: true,
      data: {
        totalFollowers: latest?.totalFollower || 0,
        yesterday: {
          newFollowers: yesterdayRecord?.newFollowers || 0,
          newReach: yesterdayRecord?.newReach || 0,
        },
        monthToDate,
        lastSync: latest?.lastSyncDateTime || null,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get Instagram trends over time period
 */
export const getInstagramTrends = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const entityId = req.query.entityId as string;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match: any = {
      platform: 'INSTAGRAM',
      date: { $gte: startDate },
    };

    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      match.entity = new mongoose.Types.ObjectId(entityId);
    }

    const trends = await InstagramInsights.find(match)
      .sort({ date: 1 })
      .select('date totalFollower newFollowers totalReach posts')
      .lean();

    res.status(200).json({
      success: true,
      message: 'Instagram trends retrieved successfully',
      data: {
        trends,
        period: {
          days,
          startDate,
          endDate: new Date(),
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

