export interface DirtyDozenCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  authContext: {
    uid: string | null;
    email: string | null;
    emailVerified: boolean;
  };
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Read/Write',
    path: 'users/player_1',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: null, email: null, emailVerified: false },
    payload: {},
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    path: 'users/admin_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'admin_1', email: 'jbarcalaiglesias@gmail.com', emailVerified: false },
    payload: { uid: 'admin_1', email: 'jbarcalaiglesias@gmail.com', role: 'admin' },
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Role',
    path: 'users/player_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: {
      uid: 'player_1',
      email: 'player@club.es',
      nombre: 'Ana',
      apellidos: 'Paz',
      telefono: '',
      licencia: '',
      poblacion: '',
      preferredCourseSlug: 'guitiriz',
      role: 'admin',
    },
  },
  {
    id: 4,
    name: 'Role Escalation Update',
    path: 'users/player_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { role: 'admin' },
  },
  {
    id: 5,
    name: 'Ghost / Shadow Field Injection',
    path: 'users/player_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { uid: 'player_1', email: 'player@club.es', role: 'player', isVerifiedAdmin: true },
  },
  {
    id: 6,
    name: 'Cross-Tenant Identity Spoofing',
    path: 'users/victim_uid',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'attacker_uid', email: 'attacker@club.es', emailVerified: true },
    payload: { uid: 'victim_uid', email: 'victim@club.es', role: 'player' },
  },
  {
    id: 7,
    name: 'Blanket User List Scraping',
    path: 'users',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: {},
  },
  {
    id: 8,
    name: 'Orphaned Subcollection Write',
    path: 'users/nonexistent_uid/reservations/tee_time_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'nonexistent_uid', email: 'ghost@club.es', emailVerified: true },
    payload: { ownerUid: 'nonexistent_uid', reservationType: 'tee_time', externalId: 1 },
  },
  {
    id: 9,
    name: 'ID Poisoning',
    path: 'users/player_1/reservations/bad$id..with/chars',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { ownerUid: 'player_1', reservationType: 'tee_time', externalId: 1 },
  },
  {
    id: 10,
    name: 'Client-Forged Timestamp',
    path: 'users/player_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { uid: 'player_1', createdAt: '1999-01-01T00:00:00Z' },
  },
  {
    id: 11,
    name: 'Terminal State Bypass',
    path: 'users/player_1/reservations/tee_time_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { status: 'confirmed' },
  },
  {
    id: 12,
    name: 'Resource Exhaustion (Value Poisoning)',
    path: 'users/player_1/reservations/tee_time_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    authContext: { uid: 'player_1', email: 'player@club.es', emailVerified: true },
    payload: { playerNote: 'X'.repeat(5000) },
  },
];
