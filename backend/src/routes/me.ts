import { Router } from 'express';
import { requireSupabaseUser } from '../middleware/requireSupabaseUser';
import { supabaseAdmin } from '../supabaseClient';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ERROR_CODES, HTTP_STATUS } from '../utils/responseUtils';

const router = Router();

/**
 * GET /api/me
 * Mengembalikan data profil user saat ini.
 * User akan otomatis dibuat oleh trigger saat signup.
 */
router.get('/', requireSupabaseUser, async (req: any, res) => {
  try {
    const userId = req.user.id as string;
    const userEmail = req.user.email as string;


    // Fetch user profile (should exist due to trigger)
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, avatar_url, role, is_active, email_verified, last_login_at, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error) {
      
      if (error.code === 'PGRST116') {
        // User not found - this shouldn't happen with trigger, but handle gracefully
        return res.status(HTTP_STATUS.NOT_FOUND).json(createErrorResponse(
          'User profile not found. Please try logging out and logging in again.',
          ERROR_CODES.NOT_FOUND,
          undefined,
          HTTP_STATUS.NOT_FOUND
        ));
      }
      
      throw error;
    }

    if (!data) {
      throw new Error('No user data found');
    }

    // Update last_login_at
    await supabaseAdmin
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userId);


    res.json(createSuccessResponse(data));
  } catch (err: any) {
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Internal server error',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

/**
 * PUT /api/me
 * Update current user profile
 */
router.put('/', requireSupabaseUser, async (req: any, res) => {
  try {
    
    const userId = req.user.id as string;
    const userEmail = req.user.email as string;


    // Validate input data
    let updateData;
    try {
      updateData = z.object({
        full_name: z.string().max(100, 'Full name is too long').optional(),
        avatar_url: z.union([
          z.string().url('Invalid avatar URL'), // Full URL
          z.string().startsWith('avatars/', 'Invalid avatar path'), // Storage path with avatars/ prefix
          z.string().regex(/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|jpeg|png|gif|webp)$/i, 'Invalid avatar path format'), // Storage path without avatars/ prefix (legacy)
          z.string().length(0), // Allow empty string
          z.null(), // Allow null
          z.undefined() // Allow undefined
        ]).optional(),
        // Legacy fields for backward compatibility
        name: z.string().optional(),
        avatarUrl: z.string().optional(),
        avatar: z.string().optional()
      }).parse(req.body);
      
    } catch (validationError: any) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
        validationError.errors?.[0]?.message || 'Validation error',
        ERROR_CODES.VALIDATION_ERROR,
        validationError.errors?.[0]?.path?.join('.') || 'unknown',
        HTTP_STATUS.BAD_REQUEST
      ));
    }

    // First check if user exists in public.users
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();


    let updatedProfile;

    if (checkError && checkError.code === 'PGRST116') {
      // User doesn't exist, create new user record
      
      // Handle avatar_url: convert empty string to null
      const avatarUrl = updateData.avatar_url === '' ? null : (updateData.avatar_url || null);
      
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: userEmail,
          full_name: updateData.full_name || req.user.user_metadata?.full_name || '',
          avatar_url: avatarUrl,
          email_verified: req.user.email_confirmed_at ? true : false,
          role: 'user',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id, email, full_name, avatar_url, role, is_active, email_verified, last_login_at, created_at, updated_at')
        .single();

      if (createError) {
        console.error('Failed to create user record:', createError);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
          'Failed to create user profile',
          ERROR_CODES.CREATE_FAILED,
          undefined,
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        ));
      }

      updatedProfile = newUser;
    } else if (checkError) {
      console.error('Error checking user existence:', checkError);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
        'Database error',
        ERROR_CODES.DATABASE_ERROR,
        undefined,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      ));
    } else {
      // User exists, update profile
      
      // Handle avatar_url: convert empty string to null
      const updatePayload: any = {
        updated_at: new Date().toISOString()
      };
      
      // Only include valid database fields
      if (updateData.full_name !== undefined) {
        updatePayload.full_name = updateData.full_name;
      }
      
      if (updateData.avatar_url !== undefined) {
        updatePayload.avatar_url = updateData.avatar_url === '' ? null : updateData.avatar_url;
      }
      
      
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('users')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, email, full_name, avatar_url, role, is_active, email_verified, last_login_at, created_at, updated_at')
        .single();


      if (updateError) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(createErrorResponse(
          'Failed to update profile',
          ERROR_CODES.UPDATE_FAILED,
          undefined,
          HTTP_STATUS.BAD_REQUEST
        ));
      }

      updatedProfile = updated;
    }

    res.json(createSuccessResponse(updatedProfile, 'Profile updated successfully'));

  } catch (err: any) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(
      'Internal server error. Please try again later',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    ));
  }
});

export default router;