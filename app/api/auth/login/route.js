import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { verifyPassword, signToken, seedInitialAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    await dbConnect();
    // Ensure initial admin exists
    await seedInitialAdmin();

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: 'Account has been deactivated. Please contact an administrator.' },
        { status: 403 }
      );
    }

    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name
    });

    const userPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name || user.email.split('@')[0],
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    const response = NextResponse.json({
      success: true,
      user: userPayload,
      message: 'Login successful'
    });

    // Set HTTP-only secure cookie
    response.cookies.set('arb_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error during login: ' + err.message },
      { status: 500 }
    );
  }
}
