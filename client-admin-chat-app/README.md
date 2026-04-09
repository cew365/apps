# Client/Admin Chat App

A standalone website that supports:

- Client and admin accounts
- Real-time chat between clients and admins
- Profile management for each user
- Admin dashboard to view all client profiles

## Stack

- Node.js + Express
- SQLite
- Socket.IO
- Vanilla HTML/CSS/JS
- JWT auth with HttpOnly cookies

## Setup

```bash
cd client-admin-chat-app
npm install
cp .env.example .env
npm run seed:admin
npm run dev
```

App URL: `http://localhost:3000`

## Default admin

From `.env`:

- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD=Admin@123`

## Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/admin/clients` (admin only)
- `GET /api/chat/messages`

## Notes

- Clients chat in their own conversation room.
- Admins can select any client conversation from the chat sidebar.
- Messages are persisted in SQLite at `data/app.db`.
