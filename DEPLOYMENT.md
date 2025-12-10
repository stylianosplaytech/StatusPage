# Deployment Guide - FREE Options

This guide will help you deploy your status page system **completely free** to make it publicly accessible.

## 🆓 100% Free Deployment Options

### Option 1: Render (Best Free Option) ⭐

**Free Tier Includes:**
- ✅ 750 hours/month (enough for 24/7 operation)
- ✅ Free SSL/HTTPS
- ✅ Automatic deployments from GitHub
- ✅ Free PostgreSQL database (optional)
- ✅ Custom domain support

**Steps:**
1. **Sign up**: Go to [render.com](https://render.com) - Free account
2. **New Web Service**: Click "New" → "Web Service"
3. **Connect GitHub**: Link your repository
4. **Configure**:
   - **Name**: `status-page` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main` or `master`
   - **Root Directory**: `Status Page` (if your repo root is different)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Select **Free**
5. **Deploy**: Click "Create Web Service"
6. **Get URL**: You'll get `your-app.onrender.com` (free subdomain)

**Note**: Free tier spins down after 15 minutes of inactivity, but wakes up on first request (may take 30-60 seconds).

### Option 2: Railway (Free Trial + $5 Credit)

**Free Tier:**
- ✅ $5 free credit (lasts ~1-2 months for small apps)
- ✅ After credit: Pay-as-you-go (very cheap, ~$5/month)
- ✅ No spin-down (always on)
- ✅ Free SSL/HTTPS

**Steps:**
1. **Sign up**: Go to [railway.app](https://railway.app) with GitHub
2. **New Project**: "Deploy from GitHub repo"
3. **Select repo**: Choose your repository
4. **Auto-deploy**: Railway detects Node.js automatically
5. **Get URL**: `your-app.railway.app`

**Note**: After free credit, Railway charges ~$0.01/hour (~$5-7/month for 24/7 operation).

### Option 3: Fly.io (Generous Free Tier)

**Free Tier:**
- ✅ 3 shared-cpu VMs (256MB RAM each)
- ✅ 160GB outbound data transfer
- ✅ Free SSL/HTTPS
- ✅ Global edge network

**Steps:**
1. **Install Fly CLI**: `npm install -g @fly/cli`
2. **Sign up**: `fly auth signup`
3. **Launch**: `fly launch` (in your project directory)
4. **Deploy**: `fly deploy`

### Option 4: Cyclic.sh (Always Free)

**Free Tier:**
- ✅ Always free for small apps
- ✅ Automatic deployments
- ✅ Free SSL
- ✅ Serverless (pay-per-use)

**Steps:**
1. Go to [cyclic.sh](https://cyclic.sh)
2. Connect GitHub
3. Select your repo
4. Auto-deploys

### Option 5: Vercel (Frontend) + Backend Service

**Free Tier:**
- ✅ Unlimited deployments
- ✅ Free SSL
- ✅ Global CDN

**Note**: Vercel is best for frontend. You'd need a separate backend service (like Render free tier).

### Option 6: GitHub Codespaces + ngrok (Development/Testing)

**Free Tier:**
- ✅ 60 hours/month free
- ✅ For testing/debugging only

**Not recommended for production** but good for testing.

### Option 3: Vercel (Frontend) + Backend Service

Vercel is great for frontend, but you'll need a separate backend service.

**Frontend (Vercel)**:
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Configure as static site (frontend only)

**Backend (Railway/Render)**:
- Deploy the Express backend separately
- Update frontend API calls to point to backend URL

### Option 4: DigitalOcean App Platform

1. **Sign up**: [digitalocean.com](https://digitalocean.com)
2. **Create App**: Connect GitHub repo
3. **Configure**: Auto-detects Node.js
4. **Deploy**: Automatic deployment

### Option 5: Traditional VPS (More Control)

If you want full control, use a VPS:

1. **Get a VPS**: DigitalOcean Droplet, AWS EC2, Linode, etc.
2. **SSH into server**
3. **Install Node.js**: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
4. **Clone your repo**: `git clone <your-repo-url>`
5. **Install dependencies**: `cd Status\ Page && npm install`
6. **Use PM2**: `npm install -g pm2 && pm2 start server.js`
7. **Set up Nginx**: Reverse proxy to your Node.js app
8. **Configure domain**: Point your domain to the server IP

## Important Configuration Steps

### 1. Environment Variables

Create a `.env` file (don't commit this):

```env
PORT=3000
JWT_SECRET=your-secret-key-here
WEBHOOK_TOKEN=your-webhook-token-here
NODE_ENV=production
```

### 2. Update CORS Settings

If deploying frontend and backend separately, update CORS in `server.js`:

```javascript
app.use(cors({
  origin: ['https://your-frontend-domain.com', 'http://localhost:3000'],
  credentials: true
}));
```

### 3. Database Considerations

- **SQLite**: Works for small deployments, but not ideal for production
- **PostgreSQL/MySQL**: Better for production (most platforms offer free databases)
- **Migration**: Consider migrating to PostgreSQL for better performance

### 4. Update API URLs

If frontend and backend are on different domains, update `API_BASE` in:
- `frontend/app.js`
- `frontend/admin.js`

Change from:
```javascript
const API_BASE = '/api';
```

To:
```javascript
const API_BASE = 'https://your-backend-url.com/api';
```

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS (most platforms do this automatically)
- [ ] Set up proper CORS
- [ ] Consider rate limiting
- [ ] Keep dependencies updated

## Testing Your Deployment

1. Visit your public URL
2. Test the status page loads
3. Test admin login
4. Create a test incident
5. Verify components update correctly

## Troubleshooting

**Port Issues**: Most platforms set `PORT` environment variable automatically. Make sure `server.js` uses:
```javascript
const PORT = process.env.PORT || 3000;
```

**Database Issues**: If SQLite doesn't work, consider migrating to PostgreSQL.

**CORS Errors**: Update CORS settings to allow your frontend domain.

## Need Help?

- Check platform-specific documentation
- Review server logs in your hosting platform
- Test locally first: `npm start`

