let localMedicines = window.INITIAL_DATA || [];

// Main UI Elements
const searchInput = document.getElementById("searchInput");
const medicineList = document.getElementById("medicineList");
const addModal = document.getElementById("addModal");
const openAddModalBtn = document.getElementById("openAddModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const addForm = document.getElementById("addForm");
const nameInput = document.getElementById("newName");
const priceInput = document.getElementById("newPrice");
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");

openSettingsBtn?.addEventListener("click", () => {
  if (settingsModal) settingsModal.style.display = "flex";
});

closeSettingsBtn?.addEventListener("click", () => {
  if (settingsModal) settingsModal.style.display = "none";
});

settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.style.display = "none";
});

const themeBtns = document.querySelectorAll(".theme-opt-btn");
const fontBtns = document.querySelectorAll(".font-btn");
const savedTheme = localStorage.getItem("app-theme") || "dark";
const savedFontSize = localStorage.getItem("app-font-size") || "16px";

document.documentElement.setAttribute("data-theme", savedTheme);
document.documentElement.style.setProperty("--base-font-size", savedFontSize);

themeBtns.forEach((btn) => {
  if (btn.dataset.themeVal === savedTheme) btn.classList.add("active");
  btn.addEventListener("click", (e) => {
    const theme = e.currentTarget.dataset.themeVal;
    if (!theme) return;
    themeBtns.forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  });
});

fontBtns.forEach((btn) => {
  if (btn.dataset.size === savedFontSize) btn.classList.add("active");
  btn.addEventListener("click", (e) => {
    const size = e.currentTarget.dataset.size;
    if (!size) return;
    fontBtns.forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    document.documentElement.style.setProperty("--base-font-size", size);
    localStorage.setItem("app-font-size", size);
  });
});

preprocessMedicines(); // Index names once on load

// ==========================================
// --- EXTREME EFFICIENCY SEARCH ENGINE ---
// ==========================================

function normalizeText(str) {
  if (!str) return "";
  return str
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200C/g, " ")
    .toLowerCase();
}

// ==========================================
// --- FULLY FREE INVENTORY CHATBOT ---
// ==========================================

const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const closeChat = document.getElementById("closeChat");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

if (
  chatToggle &&
  chatPanel &&
  closeChat &&
  chatMessages &&
  chatInput &&
  chatSend
) {
  chatToggle.addEventListener("click", () => chatPanel.classList.add("show"));
  closeChat.addEventListener("click", () => chatPanel.classList.remove("show"));

  function addBubble(text, fromUser = false) {
    const div = document.createElement("div");
    div.className = `chat-bubble ${fromUser ? "user" : "bot"}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Extract medicine name from Persian question
  function extractMedName(question) {
    // Remove common Persian question words
    const clean = question
      .replace(/آیا|دارید|داریم|چقدر|چند|قیمت| existing|stock|have/gi, "")
      .trim();
    if (!clean) return null;
    // Try fuzzy search against inventory
    const hits = rankedFuzzySearch(localMedicines, clean);
    return hits.length ? hits[0] : null;
  }

  function answerQuestion(q) {
    const qNorm = normalizeText(q);

    // 1. Greeting
    if (/سلام|خوبی|درود|hey|hello/.test(qNorm)) {
      return "سلام! چطور می‌توانم به شما در مورد داروهای انبار کمک کنم؟";
    }

    // 3. "Do you have / Is it available"
    if (/آیا|دارید|داریم|موجود|have|available/.test(qNorm)) {
      const med = extractMedName(q);
      if (!med) return "این دارو در انبار یافت نشد.";
      return `بله، ${med.name} در انبار موجود است. قیمت: ${med.price}`;
    }

    // 4. "What is the price"
    if (/قیمت|چند|price|cost/.test(qNorm)) {
      const med = extractMedName(q);
      if (!med) return "نام دارو را پیدا نکردم.";
      return `قیمت ${med.name}: ${med.price}`;
    }

    // 5. Fallback
    return "متوجه نشدم. لطفاً بپرسید: «آیا [نام دارو] موجود است؟» یا «قیمت [نام دارو] چقدر است؟»";
  }

  function handleChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    addBubble(text, true);
    chatInput.value = "";

    // Simulate "typing" delay for better UX
    setTimeout(() => {
      const reply = answerQuestion(text);
      addBubble(reply, false);
    }, 400);
  }

  chatSend.addEventListener("click", handleChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleChat();
  });
}

// Precompute normalized strings so search never repeats regex work
function preprocessMedicines() {
  for (let i = 0; i < localMedicines.length; i++) {
    const med = localMedicines[i];
    if (!med._normName) {
      med._normName = normalizeText(med.name);
      med._nameWords = med._normName.split(" ").filter((w) => w.length > 0);
    }
  }
}

function fastLevenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) {
    let tmp = a;
    a = b;
    b = tmp;
  }
  let row = [];
  for (let i = 0; i <= a.length; i++) row[i] = i;
  for (let i = 1; i <= b.length; i++) {
    let prev = i;
    for (let j = 1; j <= a.length; j++) {
      let val =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? row[j - 1]
          : Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}

function rankedFuzzySearch(medicines, query) {
  const normQuery = normalizeText(query);
  if (!normQuery) return medicines;

  const queryWords = normQuery.split(" ").filter((w) => w.length > 0);
  const results = [];

  for (let i = 0; i < medicines.length; i++) {
    const med = medicines[i];
    const normName = med._normName || normalizeText(med.name);
    const nameWords = med._nameWords || normName.split(" ");

    if (normName.includes(normQuery)) {
      results.push({ item: med, score: 0 });
      continue;
    }

    let totalTypos = 0;
    let isMatch = true;

    for (let j = 0; j < queryWords.length; j++) {
      const qWord = queryWords[j];
      let bestWordTypos = Infinity;

      for (let k = 0; k < nameWords.length; k++) {
        const nWord = nameWords[k];
        if (nWord.includes(qWord)) {
          bestWordTypos = 0;
          break;
        }
        if (qWord.length >= 3) {
          const distance = fastLevenshtein(qWord, nWord);
          if (distance < bestWordTypos) bestWordTypos = distance;
        }
      }

      const allowedTypos = qWord.length > 5 ? 2 : 1;
      if (bestWordTypos > allowedTypos) {
        isMatch = false;
        break;
      }
      totalTypos += bestWordTypos;
    }

    if (isMatch) {
      results.push({ item: med, score: totalTypos });
    }
  }

  return results.sort((a, b) => a.score - b.score).map((result) => result.item);
}

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// ==========================================
// --- RENDERING (NO PER-ITEM LISTENERS) ---
// ==========================================

function renderList(data, query = "") {
  medicineList.innerHTML = "";

  if (data.length === 0) {
    medicineList.innerHTML =
      '<li><span style="color: gray;">دارویی یافت نشد.</span></li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  const normQuery = normalizeText(query);
  const safeQuery = query.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const exactRegex = new RegExp(`(${safeQuery})`, "gi");

  data.forEach((med) => {
    const li = document.createElement("li");
    li.dataset.id = med.id; // Delegation anchor

    let displayName = med.name;
    if (query && med._normName && med._normName.includes(normQuery)) {
      displayName = displayName.replace(exactRegex, "<mark>$1</mark>");
    }

    li.innerHTML = `
  <div class="swipe-background">
    <span class="material-symbols-outlined">delete</span>
  </div>
  <div class="swipe-content">
    <div class="med-info">
      <span class="id">${med.id}</span>
      <span class="name">${displayName}</span>
    </div>
    <div class="price-group">
      <span class="price">${med.price}</span>
      <button class="copy-btn" data-id="${med.id}" title="کپی نام و قیمت">
        <span class="material-symbols-outlined">content_copy</span>
      </button>
    </div>
  </div>
`;
    fragment.appendChild(li);
  });

  medicineList.appendChild(fragment);
}

renderList(localMedicines);

searchInput.addEventListener(
  "input",
  debounce((e) => {
    const query = e.target.value.trim();
    if (!query) {
      renderList(localMedicines);
      return;
    }
    const filteredData = rankedFuzzySearch(localMedicines, query);
    renderList(filteredData, query);
  }, 150),
);

// ==========================================
// --- ULTRA-SMOOTH SWIPE (EVENT DELEGATION) ---
// ==========================================

let activeItem = null;
let activeMed = null;
let startX = 0,
  startY = 0,
  currentX = 0;
let isDragging = false,
  isSwiping = false;
let holdTimer = null,
  rafId = null;

function getMedById(id) {
  return localMedicines.find((m) => String(m.id) === String(id));
}

function getPointerPos(e) {
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function startInteraction(e) {
  if (e.target.closest(".copy-btn")) return; // ← NEW: ignore copy button

  // Stop the browser from highlighting text during a long-press
  if (e.type === "mousedown") e.preventDefault();
  window.getSelection().removeAllRanges();

  const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;

  const li = e.target.closest("li");
  if (!li || !li.dataset.id) return;
  if (e.type === "mousedown" && e.button !== 0) return;

  const pos = getPointerPos(e);
  startX = pos.x;
  startY = pos.y;
  currentX = 0;
  isDragging = true;
  isSwiping = false;
  activeItem = li;
  activeMed = getMedById(li.dataset.id);

  const content = li.querySelector(".swipe-content");
  if (content) {
    content.style.transition = "none";
    content.style.willChange = "transform";
  }
  li.classList.add("holding");

  holdTimer = setTimeout(() => {
    if (
      isDragging &&
      !isSwiping &&
      Math.abs(currentX) < 10 &&
      activeItem === li
    ) {
      isDragging = false;
      activeItem = null;
      li.classList.remove("holding");
      if (content) content.style.willChange = "auto";
      openEditModal(activeMed);
    }
  }, 600);
}

function moveInteraction(e) {
  if (!isDragging || !activeItem) return;

  const pos = getPointerPos(e);
  currentX = pos.x - startX;
  const currentY = pos.y - startY;

  if (Math.abs(currentX) > 10 || Math.abs(currentY) > 10) {
    clearTimeout(holdTimer);
    activeItem.classList.remove("holding");
  }

  if (
    !isSwiping &&
    Math.abs(currentX) > Math.abs(currentY) &&
    Math.abs(currentX) > 5
  ) {
    isSwiping = true;
  }

  if (isSwiping && currentX > 0) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (activeItem) {
        const c = activeItem.querySelector(".swipe-content");
        if (c) c.style.transform = `translateX(${currentX}px)`;
      }
    });
  }
}

function endInteraction() {
  clearTimeout(holdTimer);
  if (!isDragging || !activeItem) {
    isDragging = false;
    activeItem = null;
    return;
  }

  const content = activeItem.querySelector(".swipe-content");
  if (content) {
    content.style.transition =
      "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    content.style.willChange = "auto";
  }
  activeItem.classList.remove("holding");

  if (isSwiping && currentX > window.innerWidth * 0.35) {
    if (content) content.style.transform = `translateX(100vw)`;
    const medToDelete = activeMed;
    setTimeout(() => triggerUndoDelete(medToDelete), 300);
  } else {
    if (content) content.style.transform = `translateX(0)`;
  }

  isDragging = false;
  isSwiping = false;
  activeItem = null;
  activeMed = null;
}

// ONE set of listeners on the <ul> — never attaches to individual rows
medicineList.addEventListener("mousedown", startInteraction);
medicineList.addEventListener("mousemove", moveInteraction);
medicineList.addEventListener("mouseup", endInteraction);
medicineList.addEventListener("mouseleave", endInteraction);
medicineList.addEventListener("touchstart", startInteraction, {
  passive: true,
});
medicineList.addEventListener("touchmove", moveInteraction, { passive: true });
medicineList.addEventListener("touchend", endInteraction);
medicineList.addEventListener("touchcancel", endInteraction);

medicineList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const med = localMedicines.find((m) => String(m.id) === String(id));
  if (!med) return;

  const textToCopy = `💊 ${med.name}\n💰 ${med.price}`;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      const ta = document.createElement("textarea");
      ta.value = textToCopy;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    const original = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined">check</span>';
    btn.style.color = "var(--accent)";
    btn.style.opacity = "1";
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.color = "";
      btn.style.opacity = "";
    }, 1500);
  } catch (err) {
    console.error("Copy failed", err);
  }
});

// ==========================================
// --- MODALS & SERVER ADD/EDIT ---
// ==========================================

const errorToast = document.getElementById("errorToast");
const toastMessage = document.getElementById("toastMessage");
const undoToast = document.getElementById("undoToast");
const undoBtn = document.getElementById("undoBtn");
let toastTimeout;
let undoTimeout;
let pendingDeleteMed = null;

function showError(message) {
  toastMessage.textContent = message;
  errorToast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    errorToast.classList.remove("show");
  }, 3500);
}

openAddModalBtn.addEventListener("click", () => {
  addModal.style.display = "flex";
  nameInput.focus();
});

closeModalBtn.addEventListener(
  "click",
  () => (addModal.style.display = "none"),
);
addModal.addEventListener("click", (e) => {
  if (e.target === addModal) addModal.style.display = "none";
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const medName = nameInput.value.trim();
  const medPrice = priceInput.value.trim();

  if (!navigator.onLine) {
    let queue = JSON.parse(localStorage.getItem("offlineQueue") || "[]");
    const tempMed = {
      id: "temp-" + Date.now(),
      name: medName,
      price: medPrice,
    };
    tempMed._normName = normalizeText(tempMed.name);
    tempMed._nameWords = tempMed._normName
      .split(" ")
      .filter((w) => w.length > 0);
    queue.push(tempMed);
    localStorage.setItem("offlineQueue", JSON.stringify(queue));

    localMedicines.push(tempMed);
    nameInput.value = "";
    priceInput.value = "";
    addModal.style.display = "none";
    searchInput.value = "";
    renderList(localMedicines);
    showError(
      "شما آفلاین هستید. دارو در گوشی ذخیره شد و بعداً به سرور ارسال می‌شود.",
    );
    return;
  }

  try {
    const response = await fetch("/api/medicines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: medName,
        price: medPrice,
      }),
    });
    const result = await response.json();

    if (result.success) {
      const newMed = result.medicine;
      newMed._normName = normalizeText(newMed.name);
      newMed._nameWords = newMed._normName
        .split(" ")
        .filter((w) => w.length > 0);
      localMedicines.push(newMed);
      nameInput.value = "";
      priceInput.value = "";
      addModal.style.display = "none";
      searchInput.value = "";
      renderList(localMedicines);
    } else {
      showError(result.message);
    }
  } catch (error) {
    showError("خطا در ارتباط با سرور. آیا به اینترنت متصل هستید؟");
  }
});

// Edit Modal
const editModal = document.getElementById("editModal");
const closeEditModalBtn = document.getElementById("closeEditModalBtn");
const editForm = document.getElementById("editForm");
const editIdInput = document.getElementById("editId");
const editNameInput = document.getElementById("editName");
const editPriceInput = document.getElementById("editPrice");

closeEditModalBtn.addEventListener(
  "click",
  () => (editModal.style.display = "none"),
);
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) editModal.style.display = "none";
});

function openEditModal(med) {
  if (!navigator.onLine) {
    showError("شما آفلاین هستید. این عملیات نیاز به اینترنت دارد.");
    return;
  }
  editIdInput.value = med.id;
  editNameInput.value = med.name;
  editPriceInput.value = med.price;
  editModal.style.display = "flex";
}

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!navigator.onLine) return showError("شما آفلاین هستید.");

  const id = parseInt(editIdInput.value);
  const newName = editNameInput.value.trim();
  const newPrice = editPriceInput.value.trim();

  try {
    const response = await fetch(`/api/medicines/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        price: newPrice,
      }),
    });
    const result = await response.json();

    if (result.success) {
      const index = localMedicines.findIndex((m) => m.id === id);
      if (index !== -1) {
        localMedicines[index].name = newName;
        localMedicines[index].price = newPrice;
      }
      editModal.style.display = "none";
      renderList(
        rankedFuzzySearch(localMedicines, searchInput.value),
        searchInput.value,
      );
    } else {
      showError(result.message);
    }
  } catch (error) {
    showError("خطا در ارتباط با سرور.");
  }
});

// ==========================================
// --- SWIPE TO DELETE / UNDO SYSTEM ---
// ==========================================

async function commitDeletion(med) {
  if (!med) return;
  if (!navigator.onLine) {
    // Optionally handle offline deletes later if needed
    return showError("شما آفلاین هستید. دارو حذف نشد.");
  }
  try {
    await fetch(`/api/medicines/${med.id}`, { method: "DELETE" });
  } catch (error) {
    console.error("Delete failed on server", error);
  }
}

function triggerUndoDelete(med) {
  // 1. If another item is waiting to be deleted, delete it permanently NOW
  if (pendingDeleteMed) {
    commitDeletion(pendingDeleteMed);
  }

  // 2. Set the newly swiped item as pending
  pendingDeleteMed = med;

  // 3. Remove it immediately from the local UI array and re-render
  localMedicines = localMedicines.filter((m) => m.id !== med.id);
  renderList(
    rankedFuzzySearch(localMedicines, searchInput.value),
    searchInput.value,
  );

  // 4. Show the Undo Toast
  undoToast.classList.add("show");
  clearTimeout(undoTimeout);

  // 5. Wait 3 seconds. If not undone, commit to server permanently
  undoTimeout = setTimeout(() => {
    undoToast.classList.remove("show");
    if (pendingDeleteMed) {
      commitDeletion(pendingDeleteMed);
      pendingDeleteMed = null;
    }
  }, 3000);
}

undoBtn.addEventListener("click", () => {
  if (!pendingDeleteMed) return;
  clearTimeout(undoTimeout);

  const med = pendingDeleteMed;
  if (!med._normName) {
    med._normName = normalizeText(med.name);
    med._nameWords = med._normName.split(" ").filter((w) => w.length > 0);
  }
 localMedicines.push(med);
  searchInput.value = "";
  renderList(localMedicines);

  pendingDeleteMed = null;
  undoToast.classList.remove("show");
});

// ==========================================
// --- BACKGROUND OFFLINE SYNC ---
// ==========================================

window.addEventListener("online", async () => {
  let queue = JSON.parse(localStorage.getItem("offlineQueue") || "[]");
  if (queue.length === 0) return;

  showError("اینترنت وصل شد! در حال ارسال داده‌های آفلاین...");

  let syncSuccessful = true;
  for (let i = 0; i < queue.length; i++) {
    const med = queue[i];
    try {
      const response = await fetch("/api/medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: med.name, price: med.price }),
      });
      const result = await response.json();
      if (!result.success)
        console.warn("Failed to sync an item:", result.message);
    } catch (error) {
      syncSuccessful = false;
    }
  }

  if (syncSuccessful) {
    localStorage.removeItem("offlineQueue");
    showError("اطلاعات آفلاین با موفقیت به سرور منتقل شد!");
    setTimeout(() => window.location.reload(), 2000);
  }
});

// ==========================================
// --- DATA EXPORT & PWA ---
// ==========================================

const downloadExcelBtn = document.getElementById("downloadExcelBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");

downloadExcelBtn.addEventListener("click", () => {
  const exportData = localMedicines.map((med) => ({
    "نام دارو (Medicine)": med.name,
  }));
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  worksheet["!dir"] = "rtl";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "انبار داروها");
  XLSX.writeFile(workbook, "Medicines_List.xlsx");
  settingsModal.style.display = "none";
});

downloadPdfBtn.addEventListener("click", async () => {
  settingsModal.style.display = "none";

  // 1. Wait for the custom Persian font so text doesn't render as tofu/blank
  if (document.fonts) {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 2000)), // Fallback if font hangs
    ]);
  }

  // 2. Build a clean, flat DOM just for PDF (no swipe layers, no transforms)
  const clone = document.createElement("div");
  clone.style.position = "absolute";
  clone.style.top = "0";
  clone.style.left = "0";
  clone.style.width = "210mm"; // A4 width
  clone.style.background = "#ffffff";
  clone.style.color = "#000000";
  clone.style.direction = "rtl";
  clone.style.fontFamily = '"MyCustomPersianFont", system-ui, sans-serif';
  clone.style.padding = "15px";
  clone.style.zIndex = "-9999"; // Behind everything

  clone.innerHTML = `
    <h2 style="text-align:center; margin: 0 0 20px 0; font-size: 22px; font-weight: bold;">
      انبار داروها
    </h2>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="border-bottom: 2px solid #333;">
          <th style="text-align:right; padding: 8px 6px; width: 50px;">ردیف</th>
          <th style="text-align:right; padding: 8px 6px; width: 60px;">کد</th>
          <th style="text-align:right; padding: 8px 6px;">نام دارو</th>
          <th style="text-align:right; padding: 8px 6px; width: 100px;">قیمت</th>
        </tr>
      </thead>
      <tbody id="pdfTableBody"></tbody>
    </table>
  `;

  const tbody = clone.querySelector("#pdfTableBody");
  localMedicines.forEach((med, i) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #ddd";
    tr.innerHTML = `
      <td style="text-align:right; padding: 7px 6px; color: #555;">${i + 1}</td>
      <td style="text-align:right; padding: 7px 6px; color: #555;">${med.id}</td>
      <td style="text-align:right; padding: 7px 6px; font-weight: 500;">${med.name}</td>
      <td style="text-align:right; padding: 7px 6px; color: #555;">${med.price}</td>
    `;
    tbody.appendChild(tr);
  });

  document.body.appendChild(clone);

  // 3. Generate PDF from the clean clone
  const opt = {
    margin: [10, 10, 10, 10],
    filename: "Medicines_List.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      // Explicitly tell it what to capture
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  try {
    await html2pdf().set(opt).from(clone).save();
  } catch (err) {
    console.error("PDF Error:", err);
    showError("خطا در ساخت PDF. لطفاً دوباره تلاش کنید.");
  } finally {
    clone.remove(); // Always clean up
  }
});

const suggestionsList = document.getElementById("nameSuggestions");

nameInput.addEventListener(
  "input",
  debounce(() => {
    const query = nameInput.value.trim();
    suggestionsList.innerHTML = "";
    if (!query) return (suggestionsList.style.display = "none");

    const matches = rankedFuzzySearch(localMedicines, query);
    if (matches.length > 0) {
      const normQuery = normalizeText(query);
      const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const exactRegex = new RegExp(`(${safeQuery})`, "gi");

      matches.forEach((match) => {
        const li = document.createElement("li");
        let displayName = match.name;
        if (normalizeText(match.name).includes(normQuery)) {
          displayName = displayName.replace(exactRegex, "<mark>$1</mark>");
        }
        li.innerHTML = displayName;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          nameInput.value = match.name;
          suggestionsList.style.display = "none";
          priceInput.focus();
        });
        suggestionsList.appendChild(li);
      });
      suggestionsList.style.display = "block";
    } else {
      suggestionsList.style.display = "none";
    }
  }, 150),
);

document.addEventListener("click", (e) => {
  if (!nameInput.contains(e.target) && !suggestionsList.contains(e.target)) {
    suggestionsList.style.display = "none";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.log("SW Failed:", err));
  });
}

const iosInstallPrompt = document.getElementById("iosInstallPrompt");
const closeIosPrompt = document.getElementById("closeIosPrompt");
const isIos = () =>
  /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isInStandaloneMode = () =>
  "standalone" in window.navigator && window.navigator.standalone;

if (isIos() && !isInStandaloneMode()) {
  setTimeout(() => iosInstallPrompt.classList.add("show"), 3000);
}
closeIosPrompt.addEventListener("click", () =>
  iosInstallPrompt.classList.remove("show"),
);
