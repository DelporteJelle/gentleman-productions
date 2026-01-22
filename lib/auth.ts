import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
}

/**
 * Get the current authenticated user from the JWT token
 * Returns null if not authenticated or token is invalid
 */
export async function getCurrentUser(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if user has a specific role
 */
export async function hasRole(requiredRole: string): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === requiredRole;
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(roles: string[]): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? roles.includes(user.role) : false;
}
