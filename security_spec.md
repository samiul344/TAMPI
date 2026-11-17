# Firestore Security Specification (Tampi)

## 1. Data Invariants
- Every user document under `/users/{userId}` and `/users/{userId}/settings/{settingId}` (including `secretWakePhrase`, `secretShutdownPhrase`, `voiceCodesConfigured`, `liveVoiceName`, `personaInstructions`, and `lastActiveAt`) can only be read, created, updated, or deleted by the verified authenticated owner (`request.auth != null && request.auth.uid == userId && request.auth.token.email_verified == true`), and `uid`/`userId` and `createdAt` are immutable after creation.
- Listing `/users` is strictly disabled (`allow list: if false`) so no user can enumerate or scrape another user's profile or secret phrases.
- Every subcollection document under `/users/{userId}/settings/{settingId}`, `/users/{userId}/memories/{memoryId}`, `/users/{userId}/history/{turnId}`, `/users/{userId}/tasks/{taskId}`, and `/users/{userId}/sessions/{sessionId}` must contain `userId == userId` (matching both path and `request.auth.uid`), adhere strictly to field allowlists and size bounds, and enforce `request.time` server timestamps on create.
- Default-deny catch-all (`match /{document=**} { allow read, write: if false; }`) rejects all unmapped paths including unauthenticated or cross-user access.

## 2. Adversarial "Dirty Dozen" Payloads
1. Unauthenticated read of `/users/uidA` -> `PERMISSION_DENIED`
2. Cross-user read of `/users/uidA` (trying to view another user's `secretWakePhrase`) signed in as `uidB` -> `PERMISSION_DENIED`
3. Unverified email write to `/users/uidA` -> `PERMISSION_DENIED`
4. Shadow field injection (`isAdmin: true`) on `/users/uidA` create or update -> `PERMISSION_DENIED`
5. Mutating `uid` or `createdAt` during `/users/uidA` update -> `PERMISSION_DENIED`
6. Spoofed client timestamp on `/users/uidA` (`createdAt != request.time`) -> `PERMISSION_DENIED`
7. Oversized `secretWakePhrase` (>500 chars) or `personaInstructions` (>4000 chars) -> `PERMISSION_DENIED`
8. Invalid `voiceMode: 'invalid'` -> `PERMISSION_DENIED`
9. Creating `/users/uidA/memories/mem1` or `/users/uidA/history/turn1` with `userId: 'uidB'` -> `PERMISSION_DENIED`
10. Invalid document ID containing special characters (`../../evil`) -> `PERMISSION_DENIED`
11. Cross-user `list` query on `/users/uidA/history` or `/users/uidA/memories` by `uidB` -> `PERMISSION_DENIED`
12. Mutating immutable `/users/uidA/history/{turnId}` or `/users/uidA/sessions/{sessionId}` after creation -> `PERMISSION_DENIED`
