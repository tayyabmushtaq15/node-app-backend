import { Response } from 'express';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import { hashPassword } from '../utils/password';
import { sendErrorResponse } from '../utils/errors';

export const getAllUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Sorting parameters
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder };

    // Search parameter
    const search = req.query.search as string;

    // Filter parameters
    const role = req.query.role as string;
    const emailVerified = req.query.emailVerified as string;
    const gender = req.query.gender as string;
    const city = req.query.city as string;
    const state = req.query.state as string;
    const country = req.query.country as string;

    // Build query
    const query: Record<string, any> = {};

    // Search filter (searches in username, email, firstName, lastName)
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }

    // Role filter
    if (role && (role === 'admin' || role === 'user')) {
      query.role = role;
    }

    // Email verified filter
    if (emailVerified !== undefined) {
      query.emailVerified = emailVerified === 'true';
    }

    // Gender filter
    if (gender && ['male', 'female', 'other'].includes(gender)) {
      query.gender = gender;
    }

    // City filter
    if (city) {
      query.city = { $regex: city, $options: 'i' };
    }

    // State filter
    if (state) {
      query.state = { $regex: state, $options: 'i' };
    }

    // Country filter
    if (country) {
      query.country = { $regex: country, $options: 'i' };
    }

    // Execute query with pagination and sorting
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        filters: {
          search: search || null,
          role: role || null,
          emailVerified: emailVerified !== undefined ? emailVerified === 'true' : null,
          gender: gender || null,
          city: city || null,
          state: state || null,
          country: country || null,
        },
        sort: {
          sortBy,
          sortOrder: sortOrder === 1 ? 'asc' : 'desc',
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // If user is not admin, they can only access their own data
    if (req.user?.role !== 'admin' && id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your own account.',
      });
      return;
    }

    const user = await User.findById(id).select('-password');

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      data: {
        user,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

export const updateUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { username, firstName, lastName, age, phoneNumber, address, city, state, zip, country, gender, email, password, role } = req.body;

    // If user is not admin, they can only update their own data
    if (req.user?.role !== 'admin' && id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied. You can only update your own account.',
      });
      return;
    }

    // Regular users cannot change their role
    if (req.user?.role !== 'admin' && role && role !== req.user?.role) {
      res.status(403).json({
        success: false,
        message: 'You cannot change your role',
      });
      return;
    }

    const user = await User.findById(id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Check if username is being changed and already exists
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'Username already taken',
        });
        return;
      }
      user.username = username;
    }

    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'Email already in use',
        });
        return;
      }
      user.email = email;
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (age !== undefined) user.age = age;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (address !== undefined) user.address = address;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    if (zip !== undefined) user.zip = zip;
    if (country !== undefined) user.country = country;
    if (gender !== undefined) user.gender = gender;
    if (password) {
      user.password = await hashPassword(password);
    }
    if (role && req.user?.role === 'admin') {
      user.role = role;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          age: user.age,
          phoneNumber: user.phoneNumber,
          address: user.address,
          city: user.city,
          state: user.state,
          zip: user.zip,
          country: user.country,
          gender: user.gender,
          role: user.role,
        },
      },
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    sendErrorResponse(res, error as Error);
  }
};

