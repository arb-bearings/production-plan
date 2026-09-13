import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { verifyToken, seedInitialAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await dbConnect();
    // Ensure default admin user is seeded
    await seedInitialAdmin();

    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );

    const token = cookies['arb_auth_token'] || request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        user: null
      }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || !payload.id) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        user: null
      }, { status: 401 });
    }

    const user = await User.findById(payload.id).select('-passwordHash -salt');
    if (!user || !user.isActive) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        user: null
      }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name || user.email.split('@')[0],
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    console.error('Session check error:', err);
    return NextResponse.json({
      success: false,
      authenticated: false,
      error: err.message
    }, { status: 500 });
  }
}
