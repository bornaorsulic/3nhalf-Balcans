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

## Appointments and the calendar

The doctor describes a **normal week** once, and the calendar fills itself:

```txt
availability_rules              "every Tuesday 09:00-12:00, 30 min"
      │  generated 8 weeks ahead
      ▼
availability_slots              concrete bookable times (source = 'template')
      │  patient books one
      ▼
appointments                    slot flips to 'booked' in the same transaction
```

**Views**

* Doctor (`/clinician/calendar`): a **week grid** (days across, half-hour rows) with a
  **month** switcher for the overview. Open times are green, booked appointments show
  the patient's name, blocked times are dashed.
* Patient (`/patient/care/appointments`): a **month grid** with a dot on every day that
  has free times; tapping a day lists them as big tap targets.

**Exceptions on top of the template**

* Click an empty cell in the week grid to open a **one-off** time (`source = 'manual'`).
* Click a generated time to **block** it — it is marked `blocked` rather than deleted,
  so regenerating does not bring it back. Click again to offer it.

**Rules of the model**

1. Booking flips the slot to `booked` **in the same transaction** as the appointment, so
   two patients cannot take the same time.
2. Cancelling reopens the slot. Rescheduling cancels and rebooks, keeping
   `rescheduled_from`.
3. **A template change never touches a booking.** If the doctor drops Tuesday mornings
   while someone holds a Tuesday 09:00 slot, the appointment stays and is flagged
   "outside your weekly template" so it can be moved deliberately.
4. Times in a rule are the clinic's local time; generated slots are stored in UTC and
   rendered in each viewer's own zone. Both calendars name the zone they are showing.

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
GET    /api/v1/clinicians/{id}/slots?only_open=&days=
POST   /api/v1/clinician/slots               DELETE /clinician/slots/{id}      (delete or block)
POST   /api/v1/clinician/slots/{id}/unblock
GET    /api/v1/clinician/availability-rules  POST same path
DELETE /api/v1/clinician/availability-rules/{id}
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
