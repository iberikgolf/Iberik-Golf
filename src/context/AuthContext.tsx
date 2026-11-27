import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  hasFirestoreDatabase,
} from '../lib/firebase';
import {
  saveReservationNoteInFirestore,
  subscribeToUserProfileDoc,
  subscribeToUserReservations,
  syncReservationsToFirestore,
  syncUserProfileToFirestore,
  type FirestoreReservationSnapshotDoc,
  type FirestoreUserProfileDoc,
  type PreferredCourseSlug,
} from '../lib/firestore-sync';
import type { UserProfile } from '../types/golf';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  firestoreProfile: FirestoreUserProfileDoc | null;
  firestoreReservations: FirestoreReservationSnapshotDoc[];
  preferredCourseSlug: PreferredCourseSlug;
  authReady: boolean;
  loading: boolean;
  authError: string | null;
  isStaff: boolean;
  isSuperuser: boolean;
  isInstructor: boolean;
  canManageAcademy: boolean;
  managedCourseSlugs: string[];
  canManageCourse: (courseSlug: string) => boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  saveProfileToFirestore: (fields: {
    nombre?: string;
    apellidos?: string;
    telefono?: string;
    licencia?: string;
    poblacion?: string;
    preferredCourseSlug?: PreferredCourseSlug;
  }) => Promise<void>;
  syncReservationsSnapshot: (
    items: Parameters<typeof syncReservationsToFirestore>[1]
  ) => Promise<void>;
  saveReservationNote: (reservationKey: string, note: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firestoreProfile, setFirestoreProfile] = useState<FirestoreUserProfileDoc | null>(null);
  const [firestoreReservations, setFirestoreReservations] = useState<
    FirestoreReservationSnapshotDoc[]
  >([]);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const authFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const currentUser = auth.currentUser;
    const headers = new Headers(init.headers);
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${idToken}`);
    }
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, { ...init, headers });
  }, []);

  const fetchProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setFirestoreProfile(null);
      setFirestoreReservations([]);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('No se pudo cargar la ficha del usuario');
      }
      const data: UserProfile = await res.json();
      setProfile(data);

      if (hasFirestoreDatabase) {
        try {
          const syncedDoc = await syncUserProfileToFirestore(user, {
            nombre: data.nombre,
            apellidos: data.apellidos,
            telefono: data.telefono,
            licencia: data.licencia,
            poblacion: data.poblacion,
            defaultCourseSlug: data.defaultCourseSlug,
          });
          if (syncedDoc) {
            setFirestoreProfile(syncedDoc);
          }
        } catch (fsErr) {
          console.error('Firestore profile sync error:', fsErr);
        }
      }
    } catch (err) {
      console.error('Failed to sync user profile:', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setLoading(true);
      await fetchProfile(user);
      setAuthReady(true);
      setLoading(false);
    });
    return () => unsub();
  }, [fetchProfile]);

  useEffect(() => {
    if (!hasFirestoreDatabase || !authReady || !firebaseUser || !firebaseUser.emailVerified) {
      return;
    }
    const unsubProfile = subscribeToUserProfileDoc(firebaseUser.uid, (docData) => {
      setFirestoreProfile(docData);
    });
    const unsubReservations = subscribeToUserReservations(firebaseUser.uid, (rows) => {
      setFirestoreReservations(rows);
    });
    return () => {
      unsubProfile();
      unsubReservations();
    };
  }, [authReady, firebaseUser]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      console.error('Google Sign-In error:', err);
      setAuthError(
        'No se pudo completar el inicio de sesión con Google. Revisa si el navegador bloqueó la ventana emergente.'
      );
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setProfile(null);
    setFirestoreProfile(null);
    setFirestoreReservations([]);
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchProfile(auth.currentUser);
  }, [fetchProfile]);

  const saveProfileToFirestore = useCallback(
    async (fields: {
      nombre?: string;
      apellidos?: string;
      telefono?: string;
      licencia?: string;
      poblacion?: string;
      preferredCourseSlug?: PreferredCourseSlug;
    }) => {
      const user = auth.currentUser;
      if (!user || !hasFirestoreDatabase) return;
      const synced = await syncUserProfileToFirestore(user, fields);
      if (synced) {
        setFirestoreProfile(synced);
      }
    },
    []
  );

  const syncReservationsSnapshot = useCallback(
    async (items: Parameters<typeof syncReservationsToFirestore>[1]) => {
      const user = auth.currentUser;
      if (!user || !hasFirestoreDatabase) return;
      await syncReservationsToFirestore(user.uid, items);
    },
    []
  );

  const saveReservationNote = useCallback(async (reservationKey: string, note: string) => {
    const user = auth.currentUser;
    if (!user || !hasFirestoreDatabase) return;
    await saveReservationNoteInFirestore(user.uid, reservationKey, note);
  }, []);

  const isStaff = Boolean(profile && ['admin', 'reception'].includes(profile.role));
  const isSuperuser = Boolean(profile?.isSuperuser);
  const isInstructor = Boolean(profile?.isInstructor || profile?.role === 'instructor');
  const canManageAcademy = Boolean(
    isInstructor || (isStaff && (profile?.canManageAcademy ?? true))
  );
  const managedCourseSlugs = profile?.managedCourseSlugs
    ? profile.managedCourseSlugs
    : isStaff
    ? ['guitiriz', 'aguas-santas']
    : [];
  const canManageCourse = useCallback(
    (courseSlug: string) => managedCourseSlugs.includes(courseSlug),
    [managedCourseSlugs]
  );
  const preferredCourseSlug: PreferredCourseSlug =
    firestoreProfile?.preferredCourseSlug === 'aguas-santas' ? 'aguas-santas' : 'guitiriz';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        firestoreProfile,
        firestoreReservations,
        preferredCourseSlug,
        authReady,
        loading,
        authError,
        isStaff,
        isSuperuser,
        isInstructor,
        canManageAcademy,
        managedCourseSlugs,
        canManageCourse,
        signInWithGoogle,
        logout,
        refreshProfile,
        authFetch,
        saveProfileToFirestore,
        syncReservationsSnapshot,
        saveReservationNote,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
