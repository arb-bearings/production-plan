import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { getSessionUser, hashPassword, DEFAULT_ADMIN } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT/PATCH: Update user details or reset password
export async function PUT(request, { params }) {
  try {
    await dbConnect();
    const currentUser = await getSessionUser(request);

    if (!currentUser || currentUser.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Admin privileges required.' },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { name, role, isActive, resetPassword } = body;

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // Protect primary default admin from role downgrade or deactivation
    if (user.email.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase()) {
      if (role && role !== 'Admin') {
        return NextResponse.json(
          { success: false, error: 'Cannot demote the primary administrator account.' },
          { status: 400 }
        );
      }
      if (isActive === false) {
        return NextResponse.json(
          { success: false, error: 'Cannot deactivate the primary administrator account.' },
          { status: 400 }
        );
      }
    }

    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined && ['Admin', 'Production Planner', 'Viewer'].includes(role)) {
      user.role = role;
    }
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    if (resetPassword) {
      if (String(resetPassword).length < 6) {
        return NextResponse.json(
          { success: false, error: 'Password must be at least 6 characters long.' },
          { status: 400 }
        );
      }
      const { salt, hash } = hashPassword(resetPassword);
      user.salt = salt;
      user.passwordHash = hash;
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: 'User account updated successfully.',
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('Update user error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update user: ' + err.message },
      { status: 500 }
    );
  }
}

// DELETE: Delete user account
export async function DELETE(request, { params }) {
  try {
    await dbConnect();
    const currentUser = await getSessionUser(request);

    if (!currentUser || currentUser.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Admin privileges required.' },
        { status: 403 }
      );
    }

    const { id } = params;

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    // Cannot delete primary admin
    if (user.email.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete the primary administrator account.' },
        { status: 400 }
      );
    }

    // Cannot delete yourself
    if (user._id.toString() === currentUser._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own account while signed in.' },
        { status: 400 }
      );
    }

    await User.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: `User ${user.email} removed successfully.`
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user: ' + err.message },
      { status: 500 }
    );
  }
}
