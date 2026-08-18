# SafeTab — Deploy to Vercel (get a permanent URL)

## QR code

The printable QR code is generated at `public/safetab-qr.svg` and opens
`https://safetabbobcat.app/`. Recreate it after changing the destination with:

```bash
npm run generate:qr
```

## Step 1: Set up Firebase (~10 min) — do this first

This build syncs signals through Firebase Realtime Database, so a
patron's phone and a staff phone see each other's activity live instead
of only syncing within one device.

1. Go to https://console.firebase.google.com and sign in with your
   Google account.
2. Click **Add project**. Name it whatever you like (e.g. "safetab-demo").
   You can decline Google Analytics for this project — not needed.
3. In the left sidebar, go to **Build → Realtime Database**.
4. Click **Create Database**. Pick any location, then choose
   **Start in test mode** (this leaves it unauthenticated/open, which is
   fine for a demo — lock it down with real security rules before any
   live pilot with a venue's data, and note test-mode rules auto-expire
   after 30 days).
5. In the left sidebar, go to **Project settings** (gear icon) →
   scroll to **Your apps** → click the **</>** (web) icon to register
   a new web app. Give it any nickname, skip Firebase Hosting.
6. Firebase will show you a `firebaseConfig` object. Copy it.
7. Open `src/firebase.js` in this project and paste your values in,
   replacing the placeholder strings (`YOUR_API_KEY`, etc.) — including
   `databaseURL`, which only appears once you've created the database
   in step 4.

## Step 2: Test locally

```bash
npm install
npm run dev
```

Open the local URL it prints (usually http://localhost:5173) on two
different devices on the same wifi (or two browser windows) and confirm
a signal sent from Patron view shows up in Staff view on the other
device.

## Step 3: Deploy to Vercel (no coding required)

1. Go to https://vercel.com and sign up (free, GitHub or email login).
2. Click **Add New → Project**.
3. Choose **"Deploy without Git"** if offered, or create a GitHub repo,
   upload this whole `safetab-deploy` folder to it, and import that repo
   into Vercel instead. (GitHub Desktop app makes this a drag-and-drop.)
4. Vercel will auto-detect this as a **Vite** project. Leave the default
   build settings — they're already correct:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Click **Deploy**. In under a minute you'll get a permanent URL like
   `safetab-yourname.vercel.app`.
6. That URL is what the QR code should point to. Since `src/firebase.js`
   already has your real config baked in, the deployed version will sync
   the same way your local test did.
