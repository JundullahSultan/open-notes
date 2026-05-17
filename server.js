const express = require("express");
const path = require("path");
const fs = require("fs").promises; // اضافه شدن ماژول فایل سیستم

const app = express();
const DATA_FILE = path.join(__dirname, "data.json"); // مسیر فایل دیتابیس

// --- توابع کمکی برای خواندن و نوشتن در فایل ---

// خواندن اطلاعات از فایل
async function getMedicines() {
  try {
    const data = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // اگر فایل هنوز ساخته نشده بود یا خالی بود، یک آرایه خالی برمی‌گرداند
    if (error.code === "ENOENT") {
      return [];
    }
    console.error("خطا در خواندن فایل data.json:", error);
    return [];
  }
}

// نوشتن اطلاعات جدید در فایل
async function saveMedicines(medicines) {
  try {
    // تبدیل آرایه به متن فرمت‌شده JSON و ذخیره آن
    await fs.writeFile(DATA_FILE, JSON.stringify(medicines, null, 2), "utf8");
  } catch (error) {
    console.error("خطا در ذخیره فایل data.json:", error);
  }
}

// --- تنظیمات سرور ---

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- روت‌های (Routes) اپلیکیشن ---

// ۱. روت اصلی: خواندن فایل و ارسال به سمت کاربر
app.get("/", async (req, res) => {
  const medicines = await getMedicines(); // خواندن زنده از فایل
  res.render("index", { medicinesData: JSON.stringify(medicines) });
});

// ۲. روت API: ثبت داروی جدید و بررسی تکراری نبودن
app.post("/api/medicines", async (req, res) => {
  const { name, price } = req.body;

  if (!name || !price) {
    return res
      .status(400)
      .json({ success: false, message: "نام و قیمت الزامی است." });
  }

  const normalizeText = (str) => {
    return str
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200C/g, " ")
      .toLowerCase()
      .trim();
  };

  const normalizedNewName = normalizeText(name);

  // ۱. خواندن آخرین نسخه دیتابیس از فایل
  const medicines = await getMedicines();

  // ۲. بررسی تکراری بودن دارو
  const medicineExists = medicines.some(
    (med) => normalizeText(med.name) === normalizedNewName,
  );

  if (medicineExists) {
    return res.status(409).json({
      success: false,
      message: "این دارو قبلاً در سیستم ثبت شده است!",
    });
  }

  // 3. Create the new medicine object with sequential ID
  let nextId = 1;
  if (medicines.length > 0) {
    // Find the highest existing ID and add 1
    const highestId = Math.max(...medicines.map((m) => m.id));
    nextId = highestId + 1;
  }

  const newMedicine = {
    id: nextId,
    name: name.trim(),
    price: price,
    quantity: 0,
  };

  // ۴. اضافه کردن داروی جدید به لیست و ذخیره مجدد کل لیست در فایل
  medicines.push(newMedicine); // unshift دارو را به بالای فایل اضافه می‌کند
  await saveMedicines(medicines);

  // ۵. ارسال تاییدیه به فرانت‌اند
  res.json({ success: true, medicine: newMedicine });
});

// 4 . API Route: Handle UPDATING a medicine
app.put("/api/medicines/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, price } = req.body;

  if (!name || !price) {
    return res
      .status(400)
      .json({ success: false, message: "نام و قیمت الزامی است." });
  }

  const normalizeText = (str) =>
    str
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200C/g, " ")
      .toLowerCase()
      .trim();
  const normalizedNewName = normalizeText(name);

  let medicines = await getMedicines();
  const medIndex = medicines.findIndex((m) => m.id === id);

  if (medIndex === -1) {
    return res.status(404).json({ success: false, message: "دارو یافت نشد." });
  }

  // Ensure they aren't renaming it to another medicine that already exists
  const duplicate = medicines.find(
    (m) => m.id !== id && normalizeText(m.name) === normalizedNewName,
  );
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: "این نام قبلاً برای داروی دیگری ثبت شده است!",
    });
  }

  medicines[medIndex].name = name.trim();
  medicines[medIndex].price = price;
  await saveMedicines(medicines);

  res.json({ success: true, medicine: medicines[medIndex] });
});

// 4. API Route: Handle DELETING a medicine
app.delete("/api/medicines/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  let medicines = await getMedicines();

  // Filter out the medicine with this ID
  medicines = medicines.filter((m) => m.id !== id);
  await saveMedicines(medicines);

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
