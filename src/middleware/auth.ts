import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser, isInstructorEmail, isSuperuserEmail } from '../db/users.ts';

export interface AppUserRecord {
  id: number;
  uid: string | null;
  email: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  licencia: string;
  poblacion: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  appUser?: AppUserRecord;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    const email = (decodedToken.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(401).json({ error: 'El token no incluye un correo electrónico válido' });
    }

    const appUser = await getOrCreateUser(
      decodedToken.uid,
      email,
      typeof decodedToken.name === 'string' ? decodedToken.name : ''
    );
    req.appUser = appUser;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
  }
};

export const requireStaff = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.appUser || !['admin', 'reception'].includes(req.appUser.role)) {
    return res.status(403).json({ error: 'Acceso restringido a recepción y administración' });
  }
  next();
};

export const requireSuperuser = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.appUser || !isSuperuserEmail(req.appUser.email)) {
    return res.status(403).json({
      error:
        'Solo los dos superusuarios autorizados pueden cambiar el estado de mantenimiento de los vehículos.',
    });
  }
  next();
};

export function isAcademyManagerUser(appUser?: AppUserRecord): boolean {
  if (!appUser) return false;
  return (
    ['admin', 'reception', 'instructor'].includes(appUser.role) ||
    isSuperuserEmail(appUser.email) ||
    isInstructorEmail(appUser.email)
  );
}
