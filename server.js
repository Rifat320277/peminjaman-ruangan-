const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const ADMIN_PIN_FILE = path.join(DATA_DIR, "admin_config.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default Admin PIN if not set
const DEFAULT_ADMIN_PIN = "admin123";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

// ---------- File Storage Helpers ----------
let inMemoryBookings = null;

function getAdminPin() {
  try {
    if (fs.existsSync(ADMIN_PIN_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_PIN_FILE, "utf8"));
      return data.pin || DEFAULT_ADMIN_PIN;
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_ADMIN_PIN;
}

function saveAdminPin(newPin) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ADMIN_PIN_FILE, JSON.stringify({ pin: newPin }, null, 2), "utf8");
  } catch (e) {
    console.warn("Gagal menyimpan PIN ke file:", e.message);
  }
}

function readBookings() {
  if (inMemoryBookings !== null && Array.isArray(inMemoryBookings)) {
    return inMemoryBookings;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const list = JSON.parse(raw || "[]");
      inMemoryBookings = list.filter((b) => b && (b.status === "aktif" || b.status === "menunggu"));
      return inMemoryBookings;
    }
  } catch (err) {
    console.warn("Gagal membaca bookings.json:", err.message);
  }
  inMemoryBookings = inMemoryBookings || [];
  return inMemoryBookings;
}

function writeBookings(bookings) {
  inMemoryBookings = bookings;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2), "utf8");
  } catch (err) {
    console.warn("Gagal menyimpan ke file data (menggunakan memori):", err.message);
  }
}

let writeLock = Promise.resolve();
function withLock(fn) {
  const result = writeLock.then(fn);
  writeLock = result.catch(() => {});
  return result;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// In-memory admin sessions token
const activeAdminTokens = new Set();

function checkAdminAuth(req) {
  const token = req.headers["x-admin-token"] || req.query.admin_token;
  return token && activeAdminTokens.has(token);
}

// ---------- AUTH API ----------
app.post("/api/admin/login", (req, res) => {
  const { pin } = req.body || {};
  const currentPin = getAdminPin();
  if (pin === currentPin) {
    const token = "adm_" + crypto.randomBytes(24).toString("hex");
    activeAdminTokens.add(token);
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: "pin_salah", message: "PIN Admin tidak tepat." });
});

app.post("/api/admin/change-pin", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }
  const { oldPin, newPin } = req.body || {};
  if (oldPin !== getAdminPin()) {
    return res.status(400).json({ error: "old_pin_wrong", message: "PIN lama tidak sesuai." });
  }
  if (!newPin || newPin.length < 4) {
    return res.status(400).json({ error: "pin_too_short", message: "PIN baru minimal 4 karakter." });
  }
  saveAdminPin(newPin);
  return res.json({ success: true, message: "PIN Admin berhasil diperbarui." });
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.admin_token;
  if (token) activeAdminTokens.delete(token);
  return res.json({ success: true });
});

// ---------- BOOKINGS API ----------

// Public / Staff Endpoint: SANITIZED DATA (Privacy Guaranteed!)
// Returns only slots and status "terisi", NEVER leaking requesterName, phone, or purpose
app.get("/api/bookings", (req, res) => {
  const isAdmin = checkAdminAuth(req);
  const bookings = readBookings();

  if (isAdmin) {
    // If admin is authenticated, return full data
    return res.json(bookings);
  }

  // If public / staff, sanitize every booking
  const sanitized = bookings.map((b) => ({
    id: b.id,
    roomId: b.roomId,
    roomName: b.roomName,
    date: b.date,
    session: b.session || (b.startTime < "12:00" ? "pagi" : "siang"),
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    isBooked: b.status === "aktif" || b.status === "menunggu"
    // requesterName, unit, phone, purpose, participants are intentionally omitted!
  }));

  res.json(sanitized);
});

// Admin Endpoint: FULL DATA with all requester details
app.get("/api/admin/bookings", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized", message: "Akses hanya untuk Admin Pengelola." });
  }
  res.json(readBookings());
});

// Create a booking (Accessible to both staff and admin)
// Map nama ruangan resmi
const ROOM_NAME_MAP = {
  hypocrates: "HYPOCRATES",
  arrozi: "AR ROZI",
  aviecena: "AVIECENA"
};

// Create a booking (Accessible to both staff and admin)
app.post("/api/bookings", (req, res) => {
  withLock(() => {
    try {
      const body = req.body || {};

      // Hanya validasi kolom utama yang krusial
      const roomId = String(body.roomId || "").toLowerCase().trim();
      const requesterName = String(body.requesterName || "").trim();
      const unit = String(body.unit || "").trim();
      const date = String(body.date || "").trim();

      if (!roomId || !requesterName || !unit || !date) {
        const missing = [];
        if (!roomId) missing.push("Ruangan");
        if (!requesterName) missing.push("Nama Penanggung Jawab");
        if (!unit) missing.push("Bidang / Unit Kerja");
        if (!date) missing.push("Tanggal Penggunaan");
        return res.status(400).json({
          error: "missing_fields",
          message: "Data wajib belum lengkap: " + missing.join(", ")
        });
      }

      // Auto-resolve nama ruangan
      const roomName = body.roomName || ROOM_NAME_MAP[roomId] || roomId.toUpperCase();

      // Auto-resolve sesi & jam penggunaan
      let session = body.session;
      if (!session) {
        if (body.startTime <= "08:00" && body.endTime >= "16:00") session = "seharian";
        else if (body.startTime && body.startTime >= "12:00") session = "siang";
        else session = "pagi";
      }

      let startTime = body.startTime;
      let endTime = body.endTime;
      if (!startTime || !endTime) {
        if (session === "pagi") {
          startTime = "07:30";
          endTime = "12:00";
        } else if (session === "siang") {
          startTime = "12:30";
          endTime = "16:00";
        } else {
          startTime = "07:30";
          endTime = "16:00";
        }
      }

      if (endTime <= startTime) {
        return res.status(400).json({
          error: "invalid_time_range",
          message: "Jam selesai harus setelah jam mulai."
        });
      }

      const bookings = readBookings();

      // Check bentrok jadwal
      const clash = bookings.find(
        (b) =>
          (b.status === "aktif" || b.status === "menunggu") &&
          b.roomId.toLowerCase() === roomId &&
          b.date === date &&
          overlaps(startTime, endTime, b.startTime, b.endTime)
      );

      if (clash) {
        const clashMsg = clash.status === "menunggu"
          ? `Ruangan ${roomName} pada tanggal ${date} sesi ${session} sedang dalam proses persetujuan admin.`
          : `Ruangan ${roomName} pada tanggal ${date} sesi ${session} sudah terisi. Silakan pilih sesi atau ruangan lain.`;
        return res.status(409).json({
          error: "conflict",
          message: clashMsg,
          session: clash.session || "pagi"
        });
      }

      const isAdmin = checkAdminAuth(req);
      const initialStatus = isAdmin ? "aktif" : "menunggu";

      const cleanDate = date.replace(/[^0-9]/g, "") || Date.now().toString();
      const bookingId = "BK-" + cleanDate + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

      const newBooking = {
        id: bookingId,
        roomId: roomId,
        roomName: roomName,
        requesterName: requesterName,
        unit: unit,
        phone: String(body.phone || "-").trim() || "-",
        participants: Number(body.participants) || 1,
        date: date,
        session: session,
        startTime: startTime,
        endTime: endTime,
        startDateTime: date + "T" + startTime,
        purpose: String(body.purpose || unit || "Peminjaman Ruangan").trim(),
        notes: String(body.notes || "").trim(),
        status: initialStatus,
        createdAt: new Date().toISOString()
      };

      bookings.push(newBooking);
      writeBookings(bookings);

      // Return booking yang berhasil dibuat
      return res.status(201).json(newBooking);
    } catch (innerErr) {
      console.error("Booking error:", innerErr);
      return res.status(500).json({
        error: "server_error",
        message: "Terjadi kesalahan saat menyimpan data: " + innerErr.message
      });
    }
  }).catch((err) => {
    console.error("Server Lock error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "server_error",
        message: "Terjadi gangguan sistem: " + (err && err.message ? err.message : "server_error")
      });
    }
  });
});

// Admin Update a booking (Edit / Cancel / Delete)
app.patch("/api/admin/bookings/:id", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  withLock(() => {
    const bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    // Allow updating fields
    const allowed = [
      "requesterName", "unit", "phone", "participants",
      "date", "session", "startTime", "endTime", "purpose", "status", "notes", "roomId", "roomName"
    ];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        bookings[idx][k] = req.body[k];
      }
    });

    writeBookings(bookings);
    res.json(bookings[idx]);
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
});

// Admin Approve a booking
app.post("/api/admin/bookings/:id/approve", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  withLock(() => {
    const bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    bookings[idx].status = "aktif";
    bookings[idx].approvedAt = new Date().toISOString();
    writeBookings(bookings);
    res.json({ success: true, booking: bookings[idx] });
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
});

// Admin Reject a booking (Hapus permanen dari sistem)
app.post("/api/admin/bookings/:id/reject", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  withLock(() => {
    let bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found", message: "Data peminjaman tidak ditemukan." });
    }

    const removed = bookings.splice(idx, 1);
    writeBookings(bookings);
    res.json({ success: true, removed: removed[0], message: "Peminjaman telah ditolak dan dihapus secara permanen." });
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
});

// Admin Delete a booking permanently
app.delete("/api/admin/bookings/:id", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  withLock(() => {
    let bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    const removed = bookings.splice(idx, 1);
    writeBookings(bookings);
    res.json({ success: true, removed: removed[0] });
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
});

// Aliases for approve, reject, cancel
app.post("/api/admin/approve-booking", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => {});
});

app.post("/api/admin/reject-booking", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => {});
});

app.post("/api/admin/cancel-booking", (req, res) => {
  const { bookingId } = req.body || {};
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }
  withLock(() => {
    let bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === bookingId);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found" });
    }
    const removed = bookings.splice(idx, 1);
    writeBookings(bookings);
    res.json({ success: true, removed: removed[0] });
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });
});

// Admin batalkan peminjaman atas permintaan staf (Hapus permanen, slot langsung tersedia kembali)
app.post("/api/admin/bookings/:id/cancel-by-staff", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized", message: "Akses hanya untuk Admin Pengelola." });
  }
  withLock(() => {
    let bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found", message: "Jadwal peminjaman tidak ditemukan." });
    }
    const removed = bookings.splice(idx, 1);
    writeBookings(bookings);
    res.json({
      success: true,
      removed: removed[0],
      message: "Jadwal peminjaman staf berhasil dihapus secara permanen. Ruangan sekarang kembali tersedia."
    });
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error", message: "Gagal membatalkan: " + err.message });
  });
});

app.post("/api/admin/cancel-by-staff", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => {});
});

// Staff Verify / Track own booking by Booking ID or Phone
app.get("/api/bookings/my-check", (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.json([]);
  }
  const bookings = readBookings();
  const matched = bookings.filter((b) => 
    b.id.toLowerCase() === query || 
    (b.phone && b.phone.replace(/[^0-9]/g, "") === query.replace(/[^0-9]/g, ""))
  );
  // Return matched bookings for the owner
  res.json(matched);
});

// General server start
app.listen(PORT, "0.0.0.0", () => {
  console.log("Sistem Peminjaman Ruangan Dinkes Gresik berjalan di port " + PORT);
});
