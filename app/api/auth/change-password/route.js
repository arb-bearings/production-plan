import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { getSessionUser, verifyPassword, hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    await dbConnect();
    const sessionUser = await getSessionUser(request);

    if (!sessionUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required.' },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const user = await User.findById(sessionUser._id);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 }
      );
    }

    const isCurrentValid = verifyPassword(currentPassword, user.salt, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { success: false, error: 'Incorrect current password.' },
        { status: 400 }
      );
    }

    const { salt, hash } = hashPassword(newPassword);
    user.salt = salt;
    user.passwordHash = hash;
    await user.save();

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (err) {
    console.error('Change password error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update password: ' + err.message },
      { status: 500 }
    );
  }
}
