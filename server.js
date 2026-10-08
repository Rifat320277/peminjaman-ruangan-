require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res) => {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  })
);

// Map nama ruangan resmi
const ROOM_NAME_MAP = {
  hypocrates: "HYPOCRATES",
  arrozi: "AR ROZI",
  aviecena: "AVIECENA"
};

// In-memory admin sessions token
const activeAdminTokens = new Set();

function checkAdminAuth(req) {
  const token = req.headers["x-admin-token"] || req.query.admin_token;
  return token && activeAdminTokens.has(token);
}

// ---------- STATUS API ----------
app.get("/api/system-status", (req, res) => {
  res.json({
    status: "online",
    database: db.isMySQLActive() ? "MySQL" : "JSON (File Fallback)",
    port: PORT
  });
});

// ---------- AUTH API ----------
app.post("/api/admin/login", async (req, res) => {
  try {
    const { pin } = req.body || {};
    const currentPin = await db.getAdminPin();
    if (pin === currentPin) {
      const token = "adm_" + crypto.randomBytes(24).toString("hex");
      activeAdminTokens.add(token);
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "pin_salah", message: "PIN Admin tidak tepat." });
  } catch (err) {
    return res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.post("/api/admin/change-pin", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }
  try {
    const { oldPin, newPin } = req.body || {};
    const currentPin = await db.getAdminPin();
    if (oldPin !== currentPin) {
      return res.status(400).json({ error: "old_pin_wrong", message: "PIN lama tidak sesuai." });
    }
    if (!newPin || newPin.length < 4) {
      return res.status(400).json({ error: "pin_too_short", message: "PIN baru minimal 4 karakter." });
    }
    await db.saveAdminPin(newPin);
    return res.json({ success: true, message: "PIN Admin berhasil diperbarui." });
  } catch (err) {
    return res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.headers["x-admin-token"] || req.query.admin_token;
  if (token) activeAdminTokens.delete(token);
  return res.json({ success: true });
});

// ---------- BOOKINGS API ----------

// Public / Staff Endpoint: Jadwal Lengkap & Transparan (Kegiatan & Penanggung Jawab)
app.get("/api/bookings", async (req, res) => {
  try {
    const isAdmin = checkAdminAuth(req);
    if (isAdmin) {
      const allBookings = await db.getAdminBookings();
      return res.json(allBookings);
    }

    const bookings = await db.getAllBookings();
    const list = bookings.map((b) => ({
      id: b.id,
      roomId: b.roomId,
      roomName: b.roomName,
      date: b.date,
      session: b.session || (b.startTime < "12:00" ? "pagi" : "siang"),
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      isBooked: b.status === "aktif" || b.status === "menunggu",
      purpose: b.purpose || "",
      unit: b.unit || "",
      requesterName: b.requesterName || "",
      participants: b.participants || 0
    }));

    res.json(list);
  } catch (err) {
    console.error("Error /api/bookings:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Admin Endpoint: FULL DATA with all requester details
app.get("/api/admin/bookings", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized", message: "Akses hanya untuk Admin Pengelola." });
  }
  try {
    const bookings = await db.getAdminBookings();
    res.json(bookings);
  } catch (err) {
    console.error("Error /api/admin/bookings:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Create a booking (Accessible to both staff and admin)
app.post("/api/bookings", async (req, res) => {
  try {
    const body = req.body || {};

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

    // Check bentrok jadwal
    const clash = await db.checkClash(roomId, date, startTime, endTime);

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

    const saved = await db.createBooking(newBooking);
    return res.status(201).json(saved);
  } catch (err) {
    console.error("Booking error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "Terjadi kesalahan saat menyimpan data: " + err.message
    });
  }
});

// Admin Update a booking (Edit / Cancel / Delete)
app.patch("/api/admin/bookings/:id", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  try {
    const allowed = [
      "requesterName", "unit", "phone", "participants",
      "date", "session", "startTime", "endTime", "purpose", "status", "notes", "roomId", "roomName"
    ];
    const updateData = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        updateData[k] = req.body[k];
      }
    });

    const updated = await db.updateBooking(req.params.id, updateData);
    if (!updated) {
      return res.status(404).json({ error: "not_found", message: "Data tidak ditemukan." });
    }
    res.json(updated);
  } catch (err) {
    console.error("Error update booking:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Admin Approve a booking
app.post("/api/admin/bookings/:id/approve", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  try {
    const updated = await db.approveBooking(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: "not_found", message: "Data tidak ditemukan." });
    }
    res.json({ success: true, booking: updated });
  } catch (err) {
    console.error("Error approve booking:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Admin Reject a booking (Hapus dari sistem)
app.post("/api/admin/bookings/:id/reject", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  try {
    const removed = await db.deleteBooking(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "not_found", message: "Data peminjaman tidak ditemukan." });
    }
    res.json({ success: true, removed, message: "Peminjaman telah ditolak dan dihapus secara permanen." });
  } catch (err) {
    console.error("Error reject booking:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Admin Delete a booking permanently
app.delete("/api/admin/bookings/:id", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  try {
    const removed = await db.deleteBooking(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "not_found", message: "Data tidak ditemukan." });
    }
    res.json({ success: true, removed });
  } catch (err) {
    console.error("Error delete booking:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Admin batalkan peminjaman atas permintaan staf (Hapus permanen, slot langsung tersedia kembali)
app.post("/api/admin/bookings/:id/cancel-by-staff", async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized", message: "Akses hanya untuk Admin Pengelola." });
  }

  try {
    const removed = await db.deleteBooking(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: "not_found", message: "Jadwal peminjaman tidak ditemukan." });
    }
    res.json({
      success: true,
      removed,
      message: "Jadwal peminjaman staf berhasil dihapus secara permanen. Ruangan sekarang kembali tersedia."
    });
  } catch (err) {
    console.error("Error cancel-by-staff:", err);
    res.status(500).json({ error: "server_error", message: "Gagal membatalkan: " + err.message });
  }
});

// Aliases for approve, reject, cancel
app.post("/api/admin/approve-booking", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => { });
});

app.post("/api/admin/reject-booking", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => { });
});

app.post("/api/admin/cancel-booking", async (req, res) => {
  const { bookingId } = req.body || {};
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }
  try {
    const removed = await db.deleteBooking(bookingId);
    if (!removed) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ success: true, removed });
  } catch (err) {
    console.error("Error cancel booking:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.post("/api/admin/cancel-by-staff", (req, res) => {
  const { bookingId } = req.body || {};
  req.params.id = bookingId;
  return app._router.handle(req, res, () => { });
});

// Staff Verify / Track own booking by Booking ID or Phone
app.get("/api/bookings/my-check", async (req, res) => {
  try {
    const query = req.query.q || "";
    const matched = await db.searchMyBookings(query);
    res.json(matched);
  } catch (err) {
    console.error("Error my-check:", err);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// Inisialisasi Database lalu Jalankan Server
async function startServer() {
  await db.initDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Sistem Peminjaman Ruangan Dinkes Gresik berjalan di port ${82}`);
    console.log(`🌐 Buka di browser: http://localhost:${82}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error saat memulai server:", err);
});
