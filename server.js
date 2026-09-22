const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "bookings.json");
const ADMIN_PIN_FILE = path.join(__dirname, "data", "admin_config.json");

// Default Admin PIN if not set
const DEFAULT_ADMIN_PIN = "admin123";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- File Storage Helpers ----------
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
  fs.writeFileSync(ADMIN_PIN_FILE, JSON.stringify({ pin: newPin }, null, 2), "utf8");
}

function readBookings() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    return [];
  }
}

function writeBookings(bookings) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2), "utf8");
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

// ---------- Pre-populate sample data if empty ----------
function ensureInitialData() {
  const current = readBookings();
  if (current.length === 0) {
    const sampleBookings = [
      // 1 September 2026
      {
        id: "bkg-2026-09-01-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "M. Mey",
        unit: "Kesmas QIC",
        phone: "081234567890",
        participants: 25,
        date: "2026-09-01",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas QIC",
        status: "aktif",
        createdAt: new Date("2026-08-25T08:00:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-01-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "M. Yuli",
        unit: "Kesmas",
        phone: "081234567891",
        participants: 20,
        date: "2026-09-01",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas",
        status: "aktif",
        createdAt: new Date("2026-08-25T08:30:00Z").toISOString()
      },
      // 2 September 2026
      {
        id: "bkg-2026-09-02-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "M. Mey",
        unit: "Kesmas QIC",
        phone: "081234567890",
        participants: 25,
        date: "2026-09-02",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas QIC",
        status: "aktif",
        createdAt: new Date("2026-08-25T09:00:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-02-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "M. Yuli",
        unit: "Kesmas",
        phone: "081234567891",
        participants: 20,
        date: "2026-09-02",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas",
        status: "aktif",
        createdAt: new Date("2026-08-25T09:30:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-02-avie",
        roomId: "aviecena",
        roomName: "AVIECENA",
        requesterName: "Bu Ruroh",
        unit: "UP",
        phone: "081234567892",
        participants: 15,
        date: "2026-09-02",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "UP",
        status: "aktif",
        createdAt: new Date("2026-08-26T08:00:00Z").toISOString()
      },
      // 3 September 2026
      {
        id: "bkg-2026-09-03-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "M. Mey",
        unit: "Kesmas QIC",
        phone: "081234567890",
        participants: 25,
        date: "2026-09-03",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas QIC",
        status: "aktif",
        createdAt: new Date("2026-08-26T08:30:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-03-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "M. Yuli",
        unit: "Kesmas",
        phone: "081234567891",
        participants: 20,
        date: "2026-09-03",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas",
        status: "aktif",
        createdAt: new Date("2026-08-26T09:00:00Z").toISOString()
      },
      // 4 September 2026
      {
        id: "bkg-2026-09-04-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "Mbak Shofi",
        unit: "Rakor",
        phone: "081234567893",
        participants: 30,
        date: "2026-09-04",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Rakor",
        status: "aktif",
        createdAt: new Date("2026-08-27T08:00:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-04-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "Mb Lina",
        unit: "P2P",
        phone: "081234567894",
        participants: 20,
        date: "2026-09-04",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "P2P",
        status: "aktif",
        createdAt: new Date("2026-08-27T08:30:00Z").toISOString()
      },
      // 7 September 2026
      {
        id: "bkg-2026-09-07-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "M. Lina",
        unit: "P2P",
        phone: "081234567894",
        participants: 20,
        date: "2026-09-07",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "P2P",
        status: "aktif",
        createdAt: new Date("2026-08-28T09:00:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-07-avie",
        roomId: "aviecena",
        roomName: "AVIECENA",
        requesterName: "M. Lina",
        unit: "P2P",
        phone: "081234567894",
        participants: 15,
        date: "2026-09-07",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "P2P",
        status: "aktif",
        createdAt: new Date("2026-08-28T09:30:00Z").toISOString()
      },
      // 8 September 2026
      {
        id: "bkg-2026-09-08-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "M. Lina",
        unit: "P2P Pelatihan",
        phone: "081234567894",
        participants: 35,
        date: "2026-09-08",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "P2P Pelatihan",
        status: "aktif",
        createdAt: new Date("2026-08-29T08:00:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-08-arrozi",
        roomId: "arrozi",
        roomName: "AR ROZI",
        requesterName: "M lintang",
        unit: "Kesmas",
        phone: "081234567895",
        participants: 20,
        date: "2026-09-08",
        session: "pagi",
        startTime: "07:30",
        endTime: "12:00",
        purpose: "Kesmas",
        status: "aktif",
        createdAt: new Date("2026-08-29T08:30:00Z").toISOString()
      },
      {
        id: "bkg-2026-09-08-avie",
        roomId: "aviecena",
        roomName: "AVIECENA",
        requesterName: "Bu Rukmini",
        unit: "kesmas",
        phone: "081234567896",
        participants: 15,
        date: "2026-09-08",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "kesmas",
        status: "aktif",
        createdAt: new Date("2026-08-29T09:00:00Z").toISOString()
      },
      // 9 September 2026
      {
        id: "bkg-2026-09-09-hypo",
        roomId: "hypocrates",
        roomName: "HYPOCRATES",
        requesterName: "mas niko",
        unit: "Yankes",
        phone: "081234567897",
        participants: 25,
        date: "2026-09-09",
        session: "siang",
        startTime: "12:30",
        endTime: "16:00",
        purpose: "Yankes",
        status: "aktif",
        createdAt: new Date("2026-08-30T08:00:00Z").toISOString()
      }
    ];
    writeBookings(sampleBookings);
  }
}
ensureInitialData();

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
app.post("/api/bookings", (req, res) => {
  withLock(() => {
    const body = req.body || {};
    const required = [
      "roomId", "roomName", "requesterName", "unit", "phone",
      "date", "startTime", "endTime"
    ];
    const missing = required.filter((k) => !body[k] && body[k] !== 0);
    if (missing.length) {
      return res.status(400).json({ error: "missing_fields", fields: missing });
    }
    if (body.endTime <= body.startTime) {
      return res.status(400).json({ error: "invalid_time_range", message: "Jam selesai harus setelah jam mulai." });
    }

    const bookings = readBookings();

    // Check collision for active or pending bookings on same room and date
    const clash = bookings.find(
      (b) =>
        (b.status === "aktif" || b.status === "menunggu") &&
        b.roomId === body.roomId &&
        b.date === body.date &&
        overlaps(body.startTime, body.endTime, b.startTime, b.endTime)
    );

    if (clash) {
      const clashMsg = clash.status === "menunggu"
        ? `Ruangan ${body.roomName} pada tanggal ${body.date} sesi ${body.session || "terpilih"} sedang dalam proses persetujuan admin.`
        : `Ruangan ${body.roomName} pada tanggal ${body.date} pukul ${body.startTime}-${body.endTime} sudah terisi.`;
      return res.status(409).json({
        error: "conflict",
        message: clashMsg,
        session: clash.session || "pagi"
      });
    }

    // Determine session tag (pagi / siang / full)
    let session = body.session;
    if (!session) {
      if (body.startTime <= "08:00" && body.endTime >= "16:00") session = "seharian";
      else if (body.startTime < "12:00") session = "pagi";
      else session = "siang";
    }

    const isAdmin = checkAdminAuth(req);
    const initialStatus = isAdmin ? "aktif" : "menunggu";

    const bookingId = "BK-" + body.date.replace(/-/g, "") + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

    const newBooking = {
      id: bookingId,
      roomId: body.roomId,
      roomName: body.roomName,
      requesterName: body.requesterName.trim(),
      unit: body.unit.trim(),
      phone: body.phone.trim(),
      participants: Number(body.participants) || 1,
      date: body.date,
      session: session,
      startTime: body.startTime,
      endTime: body.endTime,
      startDateTime: body.date + "T" + body.startTime,
      purpose: (body.purpose || body.unit).trim(),
      notes: (body.notes || "").trim(),
      status: initialStatus,
      createdAt: new Date().toISOString()
    };

    bookings.push(newBooking);
    writeBookings(bookings);

    // Return the created booking (safe for the creator's receipt)
    res.status(201).json(newBooking);
  }).catch((err) => {
    console.error(err);
    res.status(500).json({ error: "server_error" });
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

// Admin Reject a booking
app.post("/api/admin/bookings/:id/reject", (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: "unauthorized" });
  }

  withLock(() => {
    const bookings = readBookings();
    const idx = bookings.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    bookings[idx].status = "ditolak";
    bookings[idx].rejectedAt = new Date().toISOString();
    writeBookings(bookings);
    res.json({ success: true, booking: bookings[idx] });
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
app.listen(PORT, () => {
  console.log("Sistem Peminjaman Ruangan Dinkes Gresik berjalan di http://localhost:" + PORT);
});
