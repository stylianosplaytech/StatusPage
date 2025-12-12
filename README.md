# 🚦 Status Page System

A comprehensive, real-time status monitoring system for tracking service health, incidents, and version deployments across multiple environments (Production & Shadow).

![Status Page](https://img.shields.io/badge/Status-Operational-green) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📋 Overview

The **Status Page System** is a self-hosted solution for monitoring and displaying the operational status of your services. It provides:

- **Real-time component monitoring** with automatic version detection
- **Production & Shadow environment tracking** - Compare versions across environments
- **Incident management** with timeline updates
- **Scheduled maintenance** announcements
- **Admin panel** for easy management
- **Public status page** for stakeholders and users

---

## ✨ Features

### 🔄 Auto Version Detection
- Automatically fetches version info from JSON endpoints every 5 minutes
- Tracks both **Production** and **Shadow** environments
- Extracts namespace (color) and version numbers
- Sets components to "Potential Outage" if URLs become unreachable

### 🎨 Dynamic Namespace Colors
- Namespace badges are color-coded based on their value (blue, green, red, etc.)
- Visual differentiation between Production and Shadow environments

### 📊 Component Management
- Add, edit, and delete components
- Group components by category
- Set visibility (show/hide on public page)
- Manual or auto-detected version tracking

### 🚨 Incident Management
- Create and track incidents with severity levels (P1/P2)
- Timeline-based status updates
- AI-powered incident detail extraction (Groq/Gemini integration)
- PDF export for incident reports
- Public/Internal visibility settings

### 🔧 Scheduled Maintenance
- Plan and announce maintenance windows
- Associate affected components
- Track maintenance status (Scheduled → In Progress → Completed)

### 👥 User Management
- Multiple admin users support
- Secure authentication with JWT tokens
- Password management

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18 or higher
- npm (Node Package Manager)

### Installation

1. **Clone/Download the repository**

2. **Install dependencies**
   ```bash
   cd "Status Page"
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the application**
   - Public Status Page: `http://localhost:3000`
   - Admin Panel: `http://localhost:3000/admin.html`

### Default Credentials
- **Username:** `admin`
- **Password:** `admin123`

> ⚠️ **Important:** Change the default password after first login!

---

## 📖 User Manual

### 1. Admin Panel Login

1. Navigate to `http://localhost:3000/admin.html`
2. Enter your username and password
3. Click "Login"

### 2. Managing Components

#### Adding a New Component

1. Go to **Components** tab
2. Click **"+ Add Component"**
3. Fill in the details:
   - **Name**: Component display name (e.g., "888casino1.com")
   - **Group**: Category grouping (e.g., "Europe", "US", "LATAM")
   - **Status**: Current operational status
   - **Sort Order**: Display order (lower numbers appear first)
   - **Version (Manual)**: Optional manual version entry

#### Setting Up Auto Version Detection

1. In the component form, find the **PRODUCTION** section (green)
2. Enter the **Production URL** (e.g., `https://sportswidget.example.com/color.json`)
3. Click **"Test URL"** to verify it works
4. For Shadow environment, fill in the **SHADOW** section (purple)
5. Click **Save**

**Expected JSON format from URL:**
```json
{
  "namespace": "mojito-example-green",
  "staticImageTag": "25.10.2.0-abc123"
}
```

The system extracts:
- **Namespace**: Last part after hyphen (e.g., "green")
- **Version**: First part before hyphen (e.g., "25.10.2.0")

#### Component Statuses

| Status | Description | Color |
|--------|-------------|-------|
| Operational | Service is running normally | 🟢 Green |
| Degraded | Service is slow or partially affected | 🟡 Yellow |
| Partial Outage | Some features unavailable | 🟠 Orange |
| Major Outage | Service is down | 🔴 Red |
| Potential Outage | Version URL unreachable | 🔴 Red (pulsing) |

### 3. Managing Incidents

#### Creating an Incident

1. Go to **Incidents** tab
2. Click **"+ Create Incident"**
3. Fill in the details:
   - **Incident Number**: Auto-generated or custom (e.g., "INC-001")
   - **Title**: Brief description
   - **Impact**: P1 (Critical) or P2 (Moderate)
   - **Status**: Identified → Monitoring → Resolved
   - **Visibility**: Public or Internal
   - **Start/End Time**: When the incident occurred
4. Select **Affected Components**
5. Add **Summary**, **Root Cause**, and **Resolution Notes**
6. Click **Save**

#### Using AI to Fill Incident Details

1. Click **"🤖 Upload Details"** button
2. Paste incident details from email/Slack/ticket
3. Select AI Provider (Groq or Gemini)
4. Enter your API key (free from provider)
5. Click **"Process with AI"**
6. Review and accept/reject suggestions

#### Adding Updates to an Incident

1. Edit an existing incident
2. Scroll to **Updates** section
3. Enter update message
4. Select new status
5. Click **"Add Update"**

#### Exporting Incident to PDF

1. Open an incident
2. Click **"📄 Preview PDF"**
3. Review the formatted report
4. Click **"Export PDF"**

### 4. Scheduling Maintenance

1. Go to **Maintenance** tab
2. Click **"+ Schedule Maintenance"**
3. Fill in:
   - **Title**: Maintenance description
   - **Start/End Time**: Maintenance window
   - **Affected Components**: Select components
4. Click **Save**

### 5. User Management

1. Go to **Settings** tab
2. Click **"+ Add User"**
3. Enter username, email, and password
4. Select role (Admin)
5. Click **Save**

---

## 🌐 Public Status Page

The public status page (`http://localhost:3000`) displays:

### Components Section
- All visible components with their status
- Production and Shadow version info
- Namespace badges with dynamic colors

### Active Incidents
- Current ongoing incidents
- Real-time status updates
- Impact severity indicators

### Resolved Incidents
- Collapsible list of past incidents
- Full timeline when expanded

### Scheduled Maintenance
- Upcoming maintenance windows
- Affected components

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
NODE_ENV=production
```

### Version Check Interval

The system checks version URLs every **5 minutes** by default. To change this, edit `backend/services/versionChecker.js`:

```javascript
// Check interval in milliseconds
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

---

## 🚀 Deployment

### Render.com

1. Connect your Git repository
2. Set **Root Directory** to `Status Page`
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Deploy

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 (Production)

```bash
npm install -g pm2
pm2 start server.js --name "status-page"
pm2 save
pm2 startup
```

---

## 📁 Project Structure

```
Status Page/
├── server.js                 # Main entry point
├── package.json              # Dependencies
├── render.yaml               # Render deployment config
├── .env                      # Environment variables
├── .gitignore               # Git ignore rules
│
├── backend/
│   ├── database.js          # SQLite database setup
│   ├── middleware/
│   │   └── auth.js          # JWT authentication
│   ├── routes/
│   │   ├── auth.js          # Login/logout routes
│   │   ├── components.js    # Component CRUD
│   │   ├── incidents.js     # Incident management
│   │   ├── maintenances.js  # Maintenance windows
│   │   ├── status.js        # Public status API
│   │   ├── users.js         # User management
│   │   └── webhooks.js      # Webhook integrations
│   └── services/
│       └── versionChecker.js # Auto version detection
│
├── frontend/
│   ├── index.html           # Public status page
│   ├── admin.html           # Admin panel
│   ├── app.js               # Public page logic
│   ├── admin.js             # Admin panel logic
│   ├── styles.css           # Public page styles
│   └── admin.css            # Admin panel styles
│
└── scripts/
    ├── init-sample-data.js  # Sample data seeder
    └── update-admin.js      # Admin password reset
```

---

## 🔒 Security

- Passwords are hashed using bcrypt
- JWT tokens for session management
- CORS enabled for API access
- Input sanitization on all forms

---

## 📞 API Endpoints

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Get overall status |
| GET | `/api/components` | List all components |
| GET | `/api/incidents` | List incidents |

### Protected Endpoints (Require Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/components` | Create component |
| PATCH | `/api/components/:id` | Update component |
| DELETE | `/api/components/:id` | Delete component |
| POST | `/api/components/:id/check-version` | Check production version |
| POST | `/api/components/:id/check-shadow-version` | Check shadow version |
| POST | `/api/incidents` | Create incident |
| PATCH | `/api/incidents/:id` | Update incident |
| DELETE | `/api/incidents/:id` | Delete incident |

---

## 🐛 Troubleshooting

### "Cannot find module 'express'"
```bash
npm install
```

### Version URLs not updating
1. Check if the URL returns valid JSON
2. Verify the JSON format matches expected structure
3. Check server logs for errors

### Database reset
```bash
rm status_page.db
npm start
```

### Reset admin password
```bash
node scripts/update-admin.js
```

---

## 📄 License

MIT License - feel free to use and modify for your needs.

---

## 🤝 Support

For issues or feature requests, please create an issue in the repository.

---

**Built with ❤️ for Operations Teams**
