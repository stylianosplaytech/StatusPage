# Status Page System

A full-featured status page system with admin panel for managing incidents, components, and scheduled maintenance.

## Features

- 📊 **Public Status Page**: Real-time status dashboard for all components
- 🔧 **Admin Panel**: Full CRUD interface for managing incidents, components, and maintenance
- 🚨 **Incident Management**: Create, update, and resolve incidents with timeline updates
- 📦 **Component Management**: Track component statuses (operational, degraded, partial outage, major outage)
- 🔔 **Impact Levels**: P1 (Critical - Red) and P2 (Moderate - Orange) priority levels
- 📅 **Scheduled Maintenance**: Plan and track maintenance windows
- 🔐 **Authentication**: Secure admin access with JWT tokens
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Access the application**:
   - Status Page: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin.html

4. **Default Admin Credentials**:
   - Username: `admin`
   - Password: `admin123`

   **⚠️ Change these immediately in production!**

### Update Admin Credentials

```bash
npm run update-admin
```

Then follow the prompts to set new username and password.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy Options:

1. **Railway** (Recommended): Connect GitHub repo → Auto-deploy
2. **Render**: Connect GitHub repo → Set build/start commands
3. **Vercel**: For frontend + separate backend service

## Project Structure

```
Status Page/
├── backend/
│   ├── database.js          # SQLite database setup
│   ├── middleware/
│   │   └── auth.js          # JWT authentication
│   └── routes/              # API routes
│       ├── auth.js
│       ├── components.js
│       ├── incidents.js
│       ├── maintenances.js
│       ├── status.js
│       └── webhooks.js
├── frontend/
│   ├── index.html           # Public status page
│   ├── admin.html           # Admin panel
│   ├── app.js               # Status page logic
│   ├── admin.js             # Admin panel logic
│   └── styles.css           # Styles
├── scripts/
│   ├── init-sample-data.js  # Initialize sample data
│   └── update-admin.js      # Update admin credentials
├── server.js                # Express server
└── package.json
```

## API Endpoints

### Public Endpoints
- `GET /api/status` - Get overall status and components
- `GET /api/components` - Get all components
- `GET /api/incidents` - Get incidents (filtered by visibility)

### Admin Endpoints (Requires Authentication)
- `POST /api/auth/login` - Admin login
- `POST /api/incidents` - Create incident
- `PATCH /api/incidents/:id` - Update incident
- `POST /api/incidents/:id/updates` - Add incident update
- `POST /api/components` - Create component
- `PATCH /api/components/:id` - Update component
- `POST /api/maintenances` - Create maintenance
- `PATCH /api/maintenances/:id` - Update maintenance

## Environment Variables

Create a `.env` file:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
WEBHOOK_TOKEN=your-webhook-token-here
NODE_ENV=production
```

## Database

Uses SQLite by default. For production, consider migrating to PostgreSQL.

## Security Notes

- Change default admin credentials before deploying
- Use strong JWT_SECRET in production
- Enable HTTPS (most platforms do this automatically)
- Configure CORS properly for your domain
- Keep dependencies updated

## License

MIT
