# RAKSA complete website

This is a ready-to-use full-stack website for RAKSA: construction, contracting and manpower supply.

## What is included

- Premium frontend: Home, Company Profile, Projects, Contact
- Working backend using Node.js only
- Contact form API that saves inquiries
- Admin login dashboard
- Inquiry management with status, notes, delete and CSV export
- Project management for the public project gallery
- Local JSON database at `data/raksa-db.json`
- WhatsApp, phone and email links already set

## Contact details already added

- Phone / WhatsApp: +966 50 031 8730
- Email: mahmod0102@gmail.com
- Location: Riyadh, Saudi Arabia

## Run locally

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

Admin panel:

```text
http://localhost:3000/admin
```

Default admin password:

```text
RAKSA@2026
```

Change it before going live:

```bash
ADMIN_PASSWORD="your-strong-password" npm start
```

## Data storage

The backend stores inquiries and project cards inside:

```text
data/raksa-db.json
```

Back up this file regularly after the site is live.

## Add real project photos later

Put real images inside:

```text
public/assets/img/projects/
```

Then open the admin panel and set the project image path, for example:

```text
/assets/img/projects/project-1.jpg
```

You can also use a hosted image URL if your hosting and CSP rules allow it. For the current secure default CSP, local images are recommended.

## Optional inquiry notifications

The contact form already saves inquiries in the backend. For automatic notifications, set:

```bash
NOTIFICATION_WEBHOOK_URL="https://your-webhook-url"
```

This can connect to Make, Zapier, n8n, Slack, Discord or your own endpoint.

## Deploy

This can be deployed to any Node.js hosting provider such as a VPS, Render, Railway, Fly.io, DigitalOcean, cPanel Node.js hosting, or a server with PM2.

For production:

```bash
NODE_ENV=production ADMIN_PASSWORD="your-strong-password" npm start
```

Make sure the hosting platform preserves the `data` folder, or attach persistent storage for it.
