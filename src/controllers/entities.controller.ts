import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import Entity from '../models/entities.model';
import { sendErrorResponse } from '../utils/errors';

/**
 * Get all entities
 */
export const getEntities = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const entityType = req.query.entityType as string | undefined;

    // Build query
    const query: Record<string, any> = {};

    // Filter by entityType if provided
    if (entityType !== undefined) {
      const typeNum = parseInt(entityType, 10);
      if (!isNaN(typeNum)) {
        query.entityType = typeNum;
      }
    }

    const entities = await Entity.find(query).sort({ entityCode: 1 });

    res.status(200).json({
      success: true,
      data: entities, // Return array directly, not wrapped in object
      count: entities.length,
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

/**
 * Get entity by ID
 */
export const getEntityById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid entity ID format',
      });
      return;
    }

    const entity = await Entity.findById(id);

    if (!entity) {
      res.status(404).json({
        success: false,
        message: 'Entity not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        entity,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

