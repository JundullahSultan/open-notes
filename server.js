const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();

// --- MongoDB Connection ---
const MONGO_URI = "mongodb://127.0.0.1:27017/open-notes";
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Successfully connected to MongoDB"))
  .catch((error) => console.error("❌ Error connecting to MongoDB:", error));

// --- Mongoose Schemas & Models ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  activeSessionId: { type: String, default: null },
});
const User = mongoose.model("User", userSchema);

const medicineSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  price: { type: String, required: true },
  quantity: { type: Number, default: 0 },
});
const Medicine = mongoose.model("Medicine", medicineSchema);

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
      const user = await User.findById(req.session.userId);

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
    const user = await User.findOne({ username: username });
    if (!user)
      return res.render("login", {
        error: "نام کاربری یا رمز عبور اشتباه است!",
      });

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
      req.session.userId = user._id;
      user.activeSessionId = req.sessionID;
      await user.save();

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
      await User.findByIdAndUpdate(req.session.userId, {
        activeSessionId: null,
      });
    } catch (e) {}
  }
  req.session.destroy(() => res.redirect("/login"));
});

// --- App Routes (Protected) ---
app.get("/", requireAuth, async (req, res) => {
  try {
    const medicines = await Medicine.find({}, "-_id -__v").sort({ id: 1 });
    res.render("index", { medicinesData: JSON.stringify(medicines) });
  } catch (error) {
    res.status(500).send("Database error");
  }
});

app.post("/api/medicines", requireAuth, async (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) return res.status(400).json({ success: false });
  const normalizedNewName = normalizeText(name);

  try {
    const allMedicines = await Medicine.find();
    if (allMedicines.some((m) => normalizeText(m.name) === normalizedNewName)) {
      return res
        .status(409)
        .json({
          success: false,
          message: "این دارو قبلاً در سیستم ثبت شده است!",
        });
    }

    const highest = await Medicine.findOne().sort({ id: -1 });
    const nextId = highest ? highest.id + 1 : 1;

    const newMedicine = new Medicine({
      id: nextId,
      name: name.trim(),
      price,
      quantity: 0,
    });
    await newMedicine.save();

    const responseMed = newMedicine.toObject();
    delete responseMed._id;
    delete responseMed.__v;
    res.json({ success: true, medicine: responseMed });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

app.put("/api/medicines/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, price } = req.body;
  if (!name || !price) return res.status(400).json({ success: false });
  const normalizedNewName = normalizeText(name);

  try {
    const allMedicines = await Medicine.find();
    if (
      allMedicines.find(
        (m) => m.id !== id && normalizeText(m.name) === normalizedNewName,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,
          message: "این نام قبلاً برای داروی دیگری ثبت شده است!",
        });
    }

    const updatedMedicine = await Medicine.findOneAndUpdate(
      { id: id },
      { name: name.trim(), price: price },
      { new: true, select: "-_id -__v" },
    );
    if (!updatedMedicine) return res.status(404).json({ success: false });
    res.json({ success: true, medicine: updatedMedicine });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

app.delete("/api/medicines/:id", requireAuth, async (req, res) => {
  try {
    await Medicine.findOneAndDelete({ id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);
