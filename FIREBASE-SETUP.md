# Firebase Setup — What You Actually Need

Right now this app runs on **in-memory data only** (the `data.json` seed). Nothing is saved after you refresh. Firebase Realtime Database is what makes it permanent and live across devices — same as your Muthavval Avval Portal.

## It's not just "a link" — it's a config object

Firebase gives you a small JavaScript object called `firebaseConfig`. It has 6–7 fields, and `databaseURL` is only one of them:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "yourproject.firebaseapp.com",
  databaseURL: "https://yourproject-default-rtdb.firebaseio.com",
  projectId: "yourproject",
  storageBucket: "yourproject.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

All of these together let the app securely read/write your database. Just the `databaseURL` alone won't work.

## How to get it (5 minutes, free)

1. Go to **console.firebase.google.com** → "Add project" → give it a name (e.g. `tharuwana-meeladfest`) → free **Spark plan** is enough.
2. In the left menu: **Build → Realtime Database → Create Database** → pick a region close to you → start in **test mode** for now (lock it down with rules later, before real use).
3. Click the ⚙️ gear icon → **Project settings** → scroll to "Your apps" → click the **Web (`</>`)** icon → register the app (any nickname) → Firebase shows you the `firebaseConfig` object → copy it.
4. Paste that object into `app.js`, and swap the `persist()` function (and the state reads) to use `firebase.database().ref(...).set(...)` / `.on('value', ...)` instead of the in-memory `state` object. I've marked the spots with **`FIREBASE HOOK`** comments in `app.js` so you know exactly where to plug it in — happy to do that wiring for you once you've created the project and shared the config (don't paste real API keys into chat if you're not comfortable — a placeholder structure works too and you can fill in the real values yourself).
5. Add the Firebase SDK script tags to `index.html` (`firebase-app.js` + `firebase-database.js` from the CDN, or the newer modular SDK — I can set either up).

## Since this is for multiple madrasas — important

Each madrasa's student data should stay **private and separate**. The cleanest way:

- **Each madrasa gets its own free Firebase project** (step 1 above, repeated). Free-tier limits (1GB storage, 10GB/month transfer, 100 concurrent connections) are per-project, so one madrasa's usage never affects another's.
- The **code stays identical** for everyone — only the `firebaseConfig` object at the top of `app.js` changes per madrasa.
- Deploy: same as your usual workflow — one **Netlify site per madrasa**, drag-and-drop the folder, just swap the config before each deploy.

If you'd rather manage it centrally instead (one Firebase project, all madrasas' data in one place, split by a `madrasaId` key), that's also possible, but means you're responsible for their data and stricter security rules become important. For a first rollout, separate projects per madrasa is simpler and safer.

Ping me once you've created a project (or even just the empty config) and I'll wire up the actual `firebase.database()` calls in `app.js` for you.
