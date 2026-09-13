import crypto from 'crypto';
import dbConnect from '@/lib/db';
import User from '@/models/User';

const AUTH_SECRET = process.env.AUTH_SECRET || 'arb-bearings-secret-key-prod-plan-2026-secure-auth-jwt';
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const DEFAULT_ADMIN = {
  email: 'arbbearings.marketing@gmail.com',
  password: '12345678',
  name: 'ARB Marketing Admin',
  role: 'Admin'
};

/**
 * Hashes a plaintext password with pbkdf2 and salt
 */
export function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

/**
 * Verifies a plaintext password against a stored salt & hash
 */
export function verifyPassword(password, salt, storedHash) {
  try {
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch (err) {
    console.error('Password verification error:', err);
    return false;
  }
}

/**
 * Creates a signed session token
 */
export function signToken(payload) {
  const data = {
    ...payload,
    exp: Date.now() + TOKEN_EXPIRY_MS,
    iat: Date.now()
  };
  const jsonStr = JSON.stringify(data);
  const base64Data = Buffer.from(jsonStr).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(base64Data).digest('base64url');
  return `${base64Data}.${signature}`;
}

/**
 * Verifies a signed session token
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(base64Data).digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const jsonStr = Buffer.from(base64Data, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr);
    if (data.exp && Date.now() > data.exp) {
      return null; // Expired
    }
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Auto-seeds default admin if not existing in DB
 */
export async function seedInitialAdmin() {
  await dbConnect();
  const normalizedEmail = DEFAULT_ADMIN.email.toLowerCase().trim();
  let admin = await User.findOne({ email: normalizedEmail });

  if (!admin) {
    const { salt, hash } = hashPassword(DEFAULT_ADMIN.password);
    admin = await User.create({
      email: normalizedEmail,
      passwordHash: hash,
      salt: salt,
      name: DEFAULT_ADMIN.name,
      role: DEFAULT_ADMIN.role,
      isActive: true
    });
    console.log(`[AUTH] Default admin user initialized: ${normalizedEmail}`);
  }

  return admin;
}

/**
 * Helper to get user from request cookie
 */
export async function getSessionUser(request) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );

    const token = cookies['arb_auth_token'] || request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || !payload.id) return null;

    await dbConnect();
    const user = await User.findById(payload.id).select('-passwordHash -salt');
    if (!user || !user.isActive) return null;

    return user;
  } catch (err) {
    console.error('Session retrieval error:', err);
    return null;
  }
}
