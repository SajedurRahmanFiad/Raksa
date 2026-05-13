# Deployment notes

## Option 1: VPS with PM2

```bash
cd raksa-complete-website
npm install
npm install -g pm2
ADMIN_PASSWORD="your-strong-password" NODE_ENV=production pm2 start server.js --name raksa
pm2 save
```

Use Nginx as a reverse proxy to port 3000.

## Option 2: Render or Railway

- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `NODE_ENV=production`
  - `ADMIN_PASSWORD=your-strong-password`
  - `PORT` is usually provided by the platform

Important: use persistent storage for the `data` folder if you want inquiries to stay after redeploys.

## Option 3: Docker

```bash
docker build -t raksa-site .
docker run -p 3000:3000 -e ADMIN_PASSWORD="your-strong-password" -v raksa-data:/app/data raksa-site
```
