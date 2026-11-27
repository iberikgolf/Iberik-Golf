# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Authentication Gate**: All reads and writes across `/users/{userId}`, `/users/{userId}/reservations/{reservationKey}`, and `/admins/{adminUid}` require `request.auth != null && request.auth.token.email_verified == true`.
2. **Ownership & Role Integrity**: A user document at `/users/{userId}` can only be created when `userId == request.auth.uid`, `data.uid == request.auth.uid`, `data.email == request.auth.token.email.lower()`, and `data.role == 'player'` (unless `isAdmin()`). Users can never self-escalate `role` or alter `uid`, `email`, or `createdAt`.
3. **Master Gate on Subcollections**: `/users/{userId}/reservations/{reservationKey}` documents cannot exist without a valid parent `/users/{userId}` document whose `uid == userId`, and `ownerUid` must equal `userId` and `request.auth.uid`.
4. **PII Isolation**: Reading `/users/{userId}` (`get` or `list`) is strictly restricted to the owner (`request.auth.uid == userId`) or a verified admin (`isAdmin()`). `list` queries check `resource.data.uid == request.auth.uid || isAdmin()` directly.
5. **Terminal State Locking**: Reservation snapshots in `status == 'cancelled'` cannot be modified by non-admins.
6. **Temporal Integrity & Bounded Payloads**: `createdAt` and `updatedAt` must equal `request.time`, all strings enforce explicit `size()` limits matching `firebase-blueprint.json`, and all path IDs match `^[a-zA-Z0-9_\-]+$`.

## 2. Dirty Dozen Adversarial Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write**: Accessing `/users/user_1` with `request.auth == null`.
2. **Unverified Email Spoof**: Accessing `/users/admin_1` with `email: "jbarcalaiglesias@gmail.com"` and `email_verified: false`.
3. **Self-Assigned Admin Role**: Creating `/users/player_1` with `role: "admin"` as a standard user.
4. **Role Escalation Update**: Updating `/users/player_1` changing `role` from `"player"` to `"admin"`.
5. **Ghost / Shadow Field Injection**: Creating `/users/player_1` with an extra field `isVerifiedAdmin: true`.
6. **Cross-Tenant Identity Spoofing**: Creating `/users/victim_uid` while signed in as `attacker_uid`.
7. **Blanket User List Scraping**: Running `list` on `/users` without filtering to `uid == request.auth.uid` as a non-admin.
8. **Orphaned Subcollection Write**: Creating `/users/nonexistent_uid/reservations/tee_time_1` without a valid parent `/users/{userId}` document.
9. **ID Poisoning**: Creating `/users/player_1/reservations/bad$id..with/chars` or >128 chars.
10. **Client-Forged Timestamp**: Creating `/users/player_1` with `createdAt` set to a client-supplied past timestamp instead of `request.time`.
11. **Terminal State Bypass**: Updating a reservation snapshot from `status: "cancelled"` back to `"confirmed"` as a non-admin.
12. **Resource Exhaustion ("Value Poisoning")**: Updating `playerNote` with a 5,000-character string exceeding `maxLength: 300`.
