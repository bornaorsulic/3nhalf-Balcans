# Accounts, connections, calendar and messaging

How people sign in, how a patient and a doctor become connected, and what each of
them is allowed to see. The database tables are listed in [DATABASE.md](DATABASE.md);
this page explains the rules.

## Roles

| Role | How the account is created | Sees |
|---|---|---|
| **patient** | self-registers at `/register` | only their own record |
| **clinician** | registers with an **invite code** | only patients who accepted them |

Doctor accounts are not self-service on purpose: anyone able to declare themselves a
doctor could request access to real health records. Seeded invite codes are printed
by `scripts/seed_accounts.py`.

Passwords are hashed with scrypt from the Python standard library (no extra
dependency). A session is a random token in the `sessions` table, sent to the browser
as an HttpOnly cookie, so JavaScript never sees it.

## The care network (N:N)

A patient can have several doctors and a doctor has many patients. One row in
`care_connections` per pair, carrying the whole lifecycle:

```txt
        patient asks                 doctor accepts
  none ──────────────▶ pending ──────────────────▶ accepted ──▶ ended
        doctor invites           doctor declines                (either side)
                                      ▼
                                  rejected
```

* **Access follows the connection.** A doctor can read a patient's record only while
  the status is `accepted`. Every patient route checks this.
* **Either side can end it.** Messages and appointments stay as history; nothing new
  can be written.
* The patient searches the directory (`GET /doctors`) by name, specialty or city.
  A doctor with `accepting_new_patients = false` cannot be asked.

## Appointments

The doctor publishes open times; the patient books one:

1. Doctor adds slots on `/clinician/calendar` (or "Add 5 mornings" for a demo).
2. Patient sees open slots in `/patient/care/appointments` and books one.
3. Booking flips the slot to `booked` **in the same transaction** as the appointment,
   so two patients cannot take the same time. The second one gets "someone just took
   that slot".
4. Cancelling reopens the slot. Rescheduling cancels and rebooks, and the new
   appointment remembers `rescheduled_from`.

Times are stored in UTC (`TIMESTAMPTZ`) and rendered in each viewer's own time zone;
both calendar screens say which zone they are showing.

## Messaging

One thread per connection. A message is unread for the other side until that side
opens the thread (`POST /connections/{id}/read`). Threads poll every few seconds, so
a new message appears without a refresh.

Doctor–patient messages are deliberately **separate from the Health Agent chat**: in a
medical product it has to be obvious whether a human or a model answered.

## Summaries: edit, trail, approve

A patient-facing summary starts as a draft (`in_review`) and the patient cannot see
its body. The doctor edits it on the patient record; every edit is stored in
`summary_versions` with who made it:

```txt
v1  written by the Health Agent
v2  edited by clin-eriksson
     ▼  approve
status = approved  →  the patient's app shows it
```

An approved summary is locked: the patient has already read it, so changing it would
rewrite history. Write a new summary instead.

## Audit trail

Opening a record, editing, approving, messaging, accepting or ending a connection are
written to `audit_log` and shown on the patient record under **Activity**, so "your
clinician reviewed this" is verifiable rather than a claim.

## API summary

All routes need the session cookie. `me` stands for the signed-in patient.

```txt
POST   /api/v1/auth/register | /auth/login | /auth/logout        GET /auth/me
GET    /api/v1/doctors?q=
GET    /api/v1/connections
POST   /api/v1/connections/request | /connections/invite
POST   /api/v1/connections/{id}/respond | /{id}/end
GET    /api/v1/connections/{id}/messages     POST same path      POST /{id}/read
GET    /api/v1/clinicians/{id}/slots?only_open=
POST   /api/v1/clinician/slots               DELETE /clinician/slots/{id}
GET    /api/v1/appointments                  POST /appointments
POST   /api/v1/appointments/{id}/cancel | /{id}/reschedule
PUT    /api/v1/patients/{id}/summaries/{summaryId}               (edit, clinician)
GET    /api/v1/patients/{id}/summaries/{summaryId}/versions
POST   /api/v1/patients/{id}/summaries/{summaryId}/approve
GET    /api/v1/patients/{id}/audit
```

## What this is not

A hackathon prototype. Passwords are hashed and every route is scoped to a session,
but there is no email verification, no password reset, no rate limiting, no encryption
at rest and no security review. Use fictional patients only.
