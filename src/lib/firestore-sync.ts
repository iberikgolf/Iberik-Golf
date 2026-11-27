import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

// Synchronized verbatim with firebase-blueprint.json
export const FIRESTORE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const FIRESTORE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FIRESTORE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const FIRESTORE_TIME_PATTERN = /^\d{2}:\d{2}$/;

export const FIRESTORE_LIMITS = {
  uid: 128,
  email: 160,
  nombre: 80,
  apellidos: 120,
  telefono: 32,
  licencia: 32,
  poblacion: 80,
  courseName: 80,
  summary: 240,
  confirmationEmail: 160,
  playerNote: 300,
} as const;

export const BOOTSTRAPPED_ADMIN_EMAILS = new Set([
  'jbarcalaiglesias@gmail.com',
  'guitirizgolf@gmail.com',
]);

export type PreferredCourseSlug = 'guitiriz' | 'aguas-santas';
export type FirestoreRole = 'player' | 'reception' | 'admin' | 'instructor';
export type FirestoreReservationType = 'tee_time' | 'academy' | 'vehicle';
export type FirestoreReservationStatus = 'confirmed' | 'reserved' | 'cancelled' | 'completed';

export interface FirestoreUserProfileDoc {
  uid: string;
  email: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  licencia: string;
  poblacion: string;
  preferredCourseSlug: PreferredCourseSlug;
  role: FirestoreRole;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface FirestoreReservationSnapshotDoc {
  id: string;
  ownerUid: string;
  reservationType: FirestoreReservationType;
  externalId: number;
  courseSlug: PreferredCourseSlug;
  courseName: string;
  date: string;
  slotTime: string;
  summary: string;
  status: FirestoreReservationStatus;
  confirmationEmail: string;
  playerNote: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

function clampString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeCourseSlug(value: unknown): PreferredCourseSlug {
  return value === 'aguas-santas' ? 'aguas-santas' : 'guitiriz';
}

function normalizeStatus(value: unknown): FirestoreReservationStatus {
  if (value === 'reserved' || value === 'cancelled' || value === 'completed') {
    return value;
  }
  return 'confirmed';
}

function normalizeDate(value: unknown): string {
  const s = clampString(value, 10);
  return FIRESTORE_DATE_PATTERN.test(s) ? s : new Date().toISOString().slice(0, 10);
}

function normalizeTime(value: unknown): string {
  const s = clampString(value, 5);
  return FIRESTORE_TIME_PATTERN.test(s) ? s : '09:00';
}

function assertVerifiedSession(uid: string): boolean {
  const current = auth.currentUser;
  return Boolean(current && current.uid === uid && current.emailVerified);
}

export async function syncUserProfileToFirestore(
  firebaseUser: User,
  profileInput: {
    nombre?: string;
    apellidos?: string;
    telefono?: string;
    licencia?: string;
    poblacion?: string;
    preferredCourseSlug?: PreferredCourseSlug;
  }
): Promise<FirestoreUserProfileDoc | null> {
  if (!firebaseUser.emailVerified || !FIRESTORE_ID_PATTERN.test(firebaseUser.uid)) {
    return null;
  }

  const email = clampString((firebaseUser.email || '').toLowerCase(), FIRESTORE_LIMITS.email);
  if (!FIRESTORE_EMAIL_PATTERN.test(email)) {
    return null;
  }

  const docPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  const safeCourseSlug = normalizeCourseSlug(profileInput.preferredCourseSlug);

  if (!existingSnap.exists()) {
    const isBootstrappedAdmin = BOOTSTRAPPED_ADMIN_EMAILS.has(email);
    const initialRole: FirestoreRole = isBootstrappedAdmin ? 'admin' : 'player';
    const payload = {
      uid: firebaseUser.uid.slice(0, FIRESTORE_LIMITS.uid),
      email,
      nombre: clampString(profileInput.nombre, FIRESTORE_LIMITS.nombre),
      apellidos: clampString(profileInput.apellidos, FIRESTORE_LIMITS.apellidos),
      telefono: clampString(profileInput.telefono, FIRESTORE_LIMITS.telefono),
      licencia: clampString(profileInput.licencia, FIRESTORE_LIMITS.licencia).toUpperCase(),
      poblacion: clampString(profileInput.poblacion, FIRESTORE_LIMITS.poblacion),
      preferredCourseSlug: safeCourseSlug,
      role: initialRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, payload);
      return payload;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  }

  const currentData = existingSnap.data() as FirestoreUserProfileDoc;
  const updatePayload = {
    nombre: clampString(
      profileInput.nombre !== undefined ? profileInput.nombre : currentData.nombre,
      FIRESTORE_LIMITS.nombre
    ),
    apellidos: clampString(
      profileInput.apellidos !== undefined ? profileInput.apellidos : currentData.apellidos,
      FIRESTORE_LIMITS.apellidos
    ),
    telefono: clampString(
      profileInput.telefono !== undefined ? profileInput.telefono : currentData.telefono,
      FIRESTORE_LIMITS.telefono
    ),
    licencia: clampString(
      profileInput.licencia !== undefined ? profileInput.licencia : currentData.licencia,
      FIRESTORE_LIMITS.licencia
    ).toUpperCase(),
    poblacion: clampString(
      profileInput.poblacion !== undefined ? profileInput.poblacion : currentData.poblacion,
      FIRESTORE_LIMITS.poblacion
    ),
    preferredCourseSlug:
      profileInput.preferredCourseSlug !== undefined
        ? safeCourseSlug
        : normalizeCourseSlug(currentData.preferredCourseSlug),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, updatePayload);
    return {
      ...currentData,
      ...updatePayload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export function subscribeToUserProfileDoc(
  uid: string,
  onChange: (docData: FirestoreUserProfileDoc | null) => void
): Unsubscribe {
  if (!assertVerifiedSession(uid) || !FIRESTORE_ID_PATTERN.test(uid)) {
    return () => {};
  }
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  return onSnapshot(
    userRef,
    (snapshot) => {
      onChange(snapshot.exists() ? (snapshot.data() as FirestoreUserProfileDoc) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToUserReservations(
  uid: string,
  onChange: (rows: FirestoreReservationSnapshotDoc[]) => void
): Unsubscribe {
  if (!assertVerifiedSession(uid) || !FIRESTORE_ID_PATTERN.test(uid)) {
    return () => {};
  }
  const path = `users/${uid}/reservations`;
  const q = query(collection(db, 'users', uid, 'reservations'), where('ownerUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreReservationSnapshotDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreReservationSnapshotDoc, 'id'>),
      }));
      items.sort((a, b) => `${b.date} ${b.slotTime}`.localeCompare(`${a.date} ${a.slotTime}`));
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function syncReservationsToFirestore(
  uid: string,
  items: Array<{
    reservationKey: string;
    reservationType: FirestoreReservationType;
    externalId: number;
    courseSlug: string;
    courseName: string;
    date: string;
    slotTime: string;
    summary: string;
    status: string;
    confirmationEmail: string;
  }>
): Promise<void> {
  if (!assertVerifiedSession(uid) || !FIRESTORE_ID_PATTERN.test(uid)) {
    return;
  }

  const parentRef = doc(db, 'users', uid);
  let parentSnap;
  try {
    parentSnap = await getDoc(parentRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  if (!parentSnap.exists()) return;

  for (const item of items) {
    if (
      !FIRESTORE_ID_PATTERN.test(item.reservationKey) ||
      !Number.isInteger(item.externalId) ||
      item.externalId <= 0
    ) {
      continue;
    }

    const docPath = `users/${uid}/reservations/${item.reservationKey}`;
    const resRef = doc(db, 'users', uid, 'reservations', item.reservationKey);

    let existingSnap;
    try {
      existingSnap = await getDoc(resRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }

    const nextCourseSlug = normalizeCourseSlug(item.courseSlug);
    const nextCourseName =
      clampString(item.courseName, FIRESTORE_LIMITS.courseName) || 'Golf Guitiriz';
    const nextDate = normalizeDate(item.date);
    const nextSlotTime = normalizeTime(item.slotTime);
    const nextSummary = clampString(item.summary, FIRESTORE_LIMITS.summary) || 'Reserva';
    const nextStatus = normalizeStatus(item.status);
    const nextConfirmationEmail = clampString(
      item.confirmationEmail,
      FIRESTORE_LIMITS.confirmationEmail
    );

    if (!existingSnap.exists()) {
      try {
        await setDoc(resRef, {
          ownerUid: uid.slice(0, FIRESTORE_LIMITS.uid),
          reservationType: item.reservationType,
          externalId: item.externalId,
          courseSlug: nextCourseSlug,
          courseName: nextCourseName,
          date: nextDate,
          slotTime: nextSlotTime,
          summary: nextSummary,
          status: nextStatus,
          confirmationEmail: nextConfirmationEmail,
          playerNote: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, docPath);
      }
    } else {
      const current = existingSnap.data() as FirestoreReservationSnapshotDoc;
      if (current.status === 'cancelled' || current.status === 'completed') {
        continue;
      }
      const changed =
        current.courseSlug !== nextCourseSlug ||
        current.courseName !== nextCourseName ||
        current.date !== nextDate ||
        current.slotTime !== nextSlotTime ||
        current.summary !== nextSummary ||
        current.status !== nextStatus ||
        current.confirmationEmail !== nextConfirmationEmail;

      if (!changed) continue;

      try {
        await updateDoc(resRef, {
          courseSlug: nextCourseSlug,
          courseName: nextCourseName,
          date: nextDate,
          slotTime: nextSlotTime,
          summary: nextSummary,
          status: nextStatus,
          confirmationEmail: nextConfirmationEmail,
          playerNote: clampString(current.playerNote, FIRESTORE_LIMITS.playerNote),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    }
  }
}

export async function saveReservationNoteInFirestore(
  uid: string,
  reservationKey: string,
  playerNote: string
): Promise<void> {
  if (
    !assertVerifiedSession(uid) ||
    !FIRESTORE_ID_PATTERN.test(uid) ||
    !FIRESTORE_ID_PATTERN.test(reservationKey)
  ) {
    return;
  }

  const docPath = `users/${uid}/reservations/${reservationKey}`;
  const resRef = doc(db, 'users', uid, 'reservations', reservationKey);

  try {
    await updateDoc(resRef, {
      playerNote: clampString(playerNote, FIRESTORE_LIMITS.playerNote),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}
