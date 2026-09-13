import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { getSessionUser, hashPassword, seedInitialAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users - List all users
export async function GET(request) {
  try {
    await dbConnect();
    await seedInitialAdmin();

    const currentUser = await getSessionUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const users = await User.find({})
      .select('-passwordHash -salt')
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      users: users.map(u => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
      }))
    });
  } catch (err) {
    console.error('Fetch users error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users: ' + err.message },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user account
export async function POST(request) {
  try {
    await dbConnect();
    await seedInitialAdmin();

    const currentUser = await getSessionUser(request);
    if (!currentUser || currentUser.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Admin privileges required to create accounts.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, role = 'Viewer', name = '' } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const validRoles = ['Admin', 'Production Planner', 'Viewer'];
    const assignedRole = validRoles.includes(role) ? role : 'Viewer';

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: `A user with email "${normalizedEmail}" already exists.` },
        { status: 409 }
      );
    }

    const { salt, hash } = hashPassword(password);
    const newUser = await User.create({
      email: normalizedEmail,
      passwordHash: hash,
      salt: salt,
      name: String(name).trim() || normalizedEmail.split('@')[0],
      role: assignedRole,
      isActive: true
    });

    return NextResponse.json({
      success: true,
      message: `User account "${normalizedEmail}" created successfully.`,
      user: {
        id: newUser._id.toString(),
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt
      }
    }, { status: 201 });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create user: ' + err.message },
      { status: 500 }
    );
  }
}
