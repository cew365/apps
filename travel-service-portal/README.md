# Travel Service Portal

A small full-stack website where:

- **Clients** can create accounts and contact travel agents.
- **Agents** can create accounts and reply to clients.
- **Admin** can manage all accounts (**create, delete, halt, suspend**) and view/respond to every chat.

## Tech stack

- Node.js + Express
- SQLite (`better-sqlite3`)
- Session auth (`express-session`)
- Vanilla HTML/CSS/JS frontend

## Features

- Role-based authentication (`client`, `agent`, `admin`)
- Self-registration for client/agent
- Admin account management:
  - Create user (any role)
  - Change status to `active`, `halted`, or `suspended`
  - Delete users
- Chat system:
  - Client starts/selects a conversation with an agent
  - Client and agent can message in their conversations
  - Admin can view all conversations and respond in every chat
- First run seeds default admin:
  - **username:** `admin`
  - **password:** `admin123`

## Run locally

```bash
cd travel-service-portal
npm install
npm start
```

Open: `http://localhost:3000`

## API overview

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/agents`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `GET /api/admin/users` (admin)
- `POST /api/admin/users` (admin)
- `PATCH /api/admin/users/:id/status` (admin)
- `DELETE /api/admin/users/:id` (admin)

## Notes

- Database file is stored at `data/portal.sqlite`.
- For production, set a strong `SESSION_SECRET`.
