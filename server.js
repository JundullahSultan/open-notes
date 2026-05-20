const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");
const admin = require("firebase-admin");

const app = express();

// --- Firebase Connection ---
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
console.log("✅ Successfully connected to Firebase Firestore");

// --- App Configuration ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- Session Setup ---
app.use(
  session({
    secret: "open-notes-super-secret-key-123",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  }),
);

// --- Real-time Connections Store (SSE) ---
// This keeps track of all browsers currently looking at the app
const sseClients = new Map();

// --- Authentication Middleware ---
const requireAuth = async (req, res, next) => {
  if (req.session.isLoggedIn && req.session.userId) {
    try {
      const userDoc = await db
        .collection("users")
        .doc(req.session.userId)
        .get();
      const user = userDoc.exists ? userDoc.data() : null;

      // If this session matches the one in the database, allow it
      if (user && user.activeSessionId === req.sessionID) {
        return next();
      } else {
        // Not the active session anymore. Destroy memory and kick out.
        req.session.destroy(() => {
          if (req.originalUrl.startsWith("/api/")) {
            return res
              .status(401)
              .json({ success: false, message: "نشست شما منقضی شده است." });
          }
          res.redirect("/login?error=concurrent_login");
        });
      }
    } catch (error) {
      console.error("Auth error:", error);
      res.redirect("/login");
    }
  } else {
    if (req.originalUrl.startsWith("/api/"))
      return res.status(401).json({ success: false });
    res.redirect("/login");
  }
};

// --- Helper Function ---
const normalizeText = (str) => {
  return str
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200C/g, " ")
    .toLowerCase()
    .trim();
};

// --- Real-Time Stream Route ---
// The frontend connects to this to listen for logout commands
app.get("/api/session-stream", (req, res) => {
  if (!req.session.isLoggedIn) return res.status(401).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Save this connection to our map
  sseClients.set(req.sessionID, res);

  // Remove them from the map if they close the browser tab
  req.on("close", () => {
    sseClients.delete(req.sessionID);
  });
});

// --- Authentication Routes ---
app.get("/login", (req, res) => {
  if (req.session.isLoggedIn) return res.redirect("/");

  let errorMsg = null;
  if (req.query.error === "concurrent_login") {
    errorMsg = "شخص دیگری با این حساب وارد شده است. شما خارج شدید.";
  }
  res.render("login", { error: errorMsg });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    // Find the user by username in Firestore
    const userSnapshot = await db
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();
    if (userSnapshot.empty) {
      return res.render("login", {
        error: "نام کاربری یا رمز عبور اشتباه است!",
      });
    }

    const userDoc = userSnapshot.docs[0];
    const user = userDoc.data();
    const userId = userDoc.id;

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      // INSTANT KICK LOGIC:
      // If someone else is currently connected, send them the force_logout signal
      if (user.activeSessionId && sseClients.has(user.activeSessionId)) {
        const oldClient = sseClients.get(user.activeSessionId);
        oldClient.write("data: force_logout\n\n");
        sseClients.delete(user.activeSessionId);
      }

      // Log the new user in
      req.session.isLoggedIn = true;
      req.session.userId = userId;

      // Update activeSessionId in Firestore
      await db
        .collection("users")
        .doc(userId)
        .update({ activeSessionId: req.sessionID });

      res.redirect("/");
    } else {
      res.render("login", { error: "نام کاربری یا رمز عبور اشتباه است!" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { error: "خطای سرور. لطفا دوباره تلاش کنید." });
  }
});

app.post("/logout", async (req, res) => {
  if (req.session.userId) {
    try {
      await db.collection("users").doc(req.session.userId).update({
        activeSessionId: null,
      });
    } catch (e) {
      console.error("Error clearing session in DB during logout", e);
    }
  }
  req.session.destroy(() => res.redirect("/login"));
});

// --- App Routes (Protected) ---
app.get("/", requireAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection("medicines")
      .orderBy("id", "asc")
      .get();
    const medicines = snapshot.docs.map((doc) => doc.data());
    res.render("index", { medicinesData: JSON.stringify(medicines) });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).send("Database error");
  }
});

app.post("/api/medicines", requireAuth, async (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) return res.status(400).json({ success: false });
  const normalizedNewName = normalizeText(name);

  try {
    const allMedicinesSnapshot = await db.collection("medicines").get();
    const allMedicines = allMedicinesSnapshot.docs.map((doc) => doc.data());

    if (allMedicines.some((m) => normalizeText(m.name) === normalizedNewName)) {
      return res.status(409).json({
        success: false,
        message: "این دارو قبلاً در سیستم ثبت شده است!",
      });
    }

    const highestSnapshot = await db
      .collection("medicines")
      .orderBy("id", "desc")
      .limit(1)
      .get();
    const highestId = highestSnapshot.empty
      ? 0
      : highestSnapshot.docs[0].data().id;
    const nextId = highestId + 1;

    const newMedicine = {
      id: nextId,
      name: name.trim(),
      price,
      quantity: 0,
    };

    // Save to Firestore using ID as the document string key
    await db.collection("medicines").doc(nextId.toString()).set(newMedicine);

    res.json({ success: true, medicine: newMedicine });
  } catch (error) {
    console.error("Add medicine error:", error);
    res.status(500).json({ success: false });
  }
});

app.put("/api/medicines/:id", requireAuth, async (req, res) => {
  const idStr = req.params.id;
  const idNum = parseInt(idStr);
  const { name, price } = req.body;

  if (!name || !price) return res.status(400).json({ success: false });
  const normalizedNewName = normalizeText(name);

  try {
    const allMedicinesSnapshot = await db.collection("medicines").get();
    const allMedicines = allMedicinesSnapshot.docs.map((doc) => doc.data());

    if (
      allMedicines.find(
        (m) => m.id !== idNum && normalizeText(m.name) === normalizedNewName,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "این نام قبلاً برای داروی دیگری ثبت شده است!",
      });
    }

    const docRef = db.collection("medicines").doc(idStr);
    const doc = await docRef.get();

    if (!doc.exists) return res.status(404).json({ success: false });

    await docRef.update({ name: name.trim(), price: price });

    // Fetch updated document to respond with
    const updatedDoc = await docRef.get();
    res.json({ success: true, medicine: updatedDoc.data() });
  } catch (error) {
    console.error("Update medicine error:", error);
    res.status(500).json({ success: false });
  }
});

app.delete("/api/medicines/:id", requireAuth, async (req, res) => {
  try {
    const idStr = req.params.id;
    await db.collection("medicines").doc(idStr).delete();
    res.json({ success: true });
  } catch (error) {
    console.error("Delete medicine error:", error);
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
