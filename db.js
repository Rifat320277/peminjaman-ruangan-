const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bookings.json");
const ADMIN_PIN_FILE = path.join(DATA_DIR, "admin_config.json");
const DEFAULT_ADMIN_PIN = "admin123";

let pool = null;
let isUsingMySQL = false;

// Format row database MySQL ke format objek yang diharapkan frontend (camelCase)
function rowToBooking(row) {
  if (!row) return null;
  const dateStr = row.date instanceof Date 
    ? row.date.toISOString().split("T")[0] 
    : String(row.date || "").substring(0, 10);

  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    requesterName: row.requester_name,
    unit: row.unit,
    phone: row.phone || "-",
    participants: Number(row.participants) || 1,
    date: dateStr,
    session: row.session,
    startTime: String(row.start_time || "").substring(0, 5),
    endTime: String(row.end_time || "").substring(0, 5),
    startDateTime: row.start_date_time || `${dateStr}T${row.start_time}`,
    purpose: row.purpose || "",
    notes: row.notes || "",
    status: row.status || "menunggu",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null
  };
}

// ----------------- JSON FILE FALLBACK -----------------
let inMemoryBookings = null;

function readJsonBookings() {
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

function writeJsonBookings(bookings) {
  inMemoryBookings = bookings;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(bookings, null, 2), "utf8");
  } catch (err) {
    console.warn("Gagal menyimpan ke file JSON:", err.message);
  }
}

function getJsonAdminPin() {
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

function saveJsonAdminPin(newPin) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ADMIN_PIN_FILE, JSON.stringify({ pin: newPin }, null, 2), "utf8");
  } catch (e) {
    console.warn("Gagal menyimpan PIN ke file:", e.message);
  }
}

// ----------------- INISIALISASI DATABASE MYSQL -----------------
async function initDatabase() {
  const driver = (process.env.DB_TYPE || "mysql").toLowerCase();
  if (driver !== "mysql") {
    console.log("ℹ️ Konfigurasi DB_TYPE diset ke 'json'. Menggunakan penyimpanan file data/bookings.json.");
    isUsingMySQL = false;
    return;
  }

  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "peminjaman_ruangan";

  try {
    // 1. Buat koneksi awal untuk memastikan database telah ada (CREATE DATABASE IF NOT EXISTS)
    const initConn = await mysql.createConnection({
      host,
      port,
      user,
      password
    });

    await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await initConn.end();

    // 2. Buat Connection Pool ke database peminjaman_ruangan
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true
    });

    // 3. Tes koneksi & Buat Tabel jika belum ada
    const [test] = await pool.query("SELECT 1 + 1 AS result");
    if (!test || test.length === 0) {
      throw new Error("Koneksi MySQL gagal merespons query tes.");
    }

    // Tabel admin_config
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(50) NOT NULL UNIQUE,
        config_value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Default admin PIN
    await pool.query(`
      INSERT INTO admin_config (config_key, config_value) 
      VALUES ('admin_pin', ?)
      ON DUPLICATE KEY UPDATE config_key = config_key;
    `, [DEFAULT_ADMIN_PIN]);

    // Tabel rooms
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        capacity INT DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      INSERT INTO rooms (id, name, capacity, description) VALUES
      ('hypocrates', 'HYPOCRATES', 50, 'Ruang Pertemuan Utama Lantai 2'),
      ('arrozi', 'AR ROZI', 30, 'Ruang Rapat Sayap Barat'),
      ('aviecena', 'AVIECENA', 25, 'Ruang Rapat Sayap Timur')
      ON DUPLICATE KEY UPDATE name = VALUES(name), capacity = VALUES(capacity);
    `);

    // Tabel bookings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(50) PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        room_name VARCHAR(100) NOT NULL,
        requester_name VARCHAR(150) NOT NULL,
        unit VARCHAR(150) NOT NULL,
        phone VARCHAR(50) DEFAULT '-',
        participants INT DEFAULT 1,
        date DATE NOT NULL,
        session ENUM('pagi', 'siang', 'seharian') DEFAULT 'pagi',
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        start_date_time VARCHAR(30),
        purpose TEXT NOT NULL,
        notes TEXT,
        status ENUM('menunggu', 'aktif', 'ditolak', 'dibatalkan') DEFAULT 'menunggu',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME NULL,
        INDEX idx_room_date (room_id, date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB;
    `);

    // Sinkronisasi otomatis data awal dari bookings.json jika tabel MySQL masih kosong
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM bookings");
    if (rows[0].total === 0) {
      const existingJson = readJsonBookings();
      if (existingJson && existingJson.length > 0) {
        console.log(`📥 Melakukan migrasi awal ${existingJson.length} data dari JSON ke database MySQL...`);
        for (const b of existingJson) {
          await pool.query(`
            INSERT IGNORE INTO bookings (
              id, room_id, room_name, requester_name, unit, phone, 
              participants, date, session, start_time, end_time, 
              start_date_time, purpose, notes, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            b.id,
            b.roomId,
            b.roomName,
            b.requesterName,
            b.unit,
            b.phone || "-",
            b.participants || 1,
            b.date,
            b.session || "pagi",
            b.startTime || "07:30",
            b.endTime || "12:00",
            b.startDateTime || (b.date + "T" + b.startTime),
            b.purpose || "",
            b.notes || "",
            b.status || "menunggu",
            b.createdAt ? new Date(b.createdAt) : new Date()
          ]);
        }
      }
    }

    isUsingMySQL = true;
    console.log(`✅ Berhasil terhubung ke Database MySQL [${database}] di ${host}:${port}!`);
  } catch (err) {
    isUsingMySQL = false;
    const msg = err ? (err.message || err.code || String(err)) : "Koneksi ditolak/offline";
    console.warn(`⚠️ Peringatan: Tidak dapat terhubung ke MySQL (${msg}).`);
    console.warn(`👉 Sistem otomatis menggunakan fallback berkas JSON lokal (data/bookings.json).`);
    console.warn(`👉 Pastikan MySQL (misal XAMPP / Laragon / Service MySQL) aktif jika ingin menggunakan MySQL.`);
  }
}

// ----------------- OPERASI DATA (CRUD) -----------------

async function getAdminPin() {
  if (isUsingMySQL && pool) {
    try {
      const [rows] = await pool.query(
        "SELECT config_value FROM admin_config WHERE config_key = 'admin_pin' LIMIT 1"
      );
      if (rows.length > 0) {
        return rows[0].config_value;
      }
    } catch (e) {
      console.error("Gagal mengambil PIN admin dari MySQL:", e.message);
    }
  }
  return getJsonAdminPin();
}

async function saveAdminPin(newPin) {
  if (isUsingMySQL && pool) {
    try {
      await pool.query(
        `INSERT INTO admin_config (config_key, config_value) 
         VALUES ('admin_pin', ?) 
         ON DUPLICATE KEY UPDATE config_value = ?`,
        [newPin, newPin]
      );
      return true;
    } catch (e) {
      console.error("Gagal menyimpan PIN admin ke MySQL:", e.message);
    }
  }
  saveJsonAdminPin(newPin);
  return true;
}

async function getAllBookings() {
  if (isUsingMySQL && pool) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM bookings WHERE status IN ('aktif', 'menunggu') ORDER BY date ASC, start_time ASC"
      );
      return rows.map(rowToBooking);
    } catch (e) {
      console.error("Gagal membaca bookings dari MySQL:", e.message);
    }
  }
  return readJsonBookings();
}

async function getAdminBookings() {
  if (isUsingMySQL && pool) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM bookings ORDER BY date DESC, start_time DESC"
      );
      return rows.map(rowToBooking);
    } catch (e) {
      console.error("Gagal membaca admin bookings dari MySQL:", e.message);
    }
  }
  return readJsonBookings();
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function checkClash(roomId, date, startTime, endTime) {
  if (isUsingMySQL && pool) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM bookings 
         WHERE status IN ('aktif', 'menunggu') 
           AND LOWER(room_id) = LOWER(?) 
           AND date = ? 
           AND start_time < ? 
           AND end_time > ? 
         LIMIT 1`,
        [roomId, date, endTime, startTime]
      );
      if (rows.length > 0) {
        return rowToBooking(rows[0]);
      }
      return null;
    } catch (e) {
      console.error("Gagal cek bentrok di MySQL:", e.message);
    }
  }

  // Fallback cek bentrok di memori/JSON
  const bookings = readJsonBookings();
  return bookings.find(
    (b) =>
      (b.status === "aktif" || b.status === "menunggu") &&
      b.roomId.toLowerCase() === roomId.toLowerCase() &&
      b.date === date &&
      overlaps(startTime, endTime, b.startTime, b.endTime)
  ) || null;
}

async function createBooking(b) {
  if (isUsingMySQL && pool) {
    try {
      await pool.query(
        `INSERT INTO bookings (
          id, room_id, room_name, requester_name, unit, phone, 
          participants, date, session, start_time, end_time, 
          start_date_time, purpose, notes, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          b.id,
          b.roomId,
          b.roomName,
          b.requesterName,
          b.unit,
          b.phone || "-",
          b.participants || 1,
          b.date,
          b.session,
          b.startTime,
          b.endTime,
          b.startDateTime,
          b.purpose,
          b.notes || "",
          b.status,
          b.createdAt ? new Date(b.createdAt) : new Date()
        ]
      );
      return b;
    } catch (e) {
      console.error("Gagal simpan booking ke MySQL:", e.message);
      throw e;
    }
  }

  const list = readJsonBookings();
  list.push(b);
  writeJsonBookings(list);
  return b;
}

async function getBookingById(id) {
  if (isUsingMySQL && pool) {
    try {
      const [rows] = await pool.query("SELECT * FROM bookings WHERE id = ? LIMIT 1", [id]);
      if (rows.length > 0) {
        return rowToBooking(rows[0]);
      }
      return null;
    } catch (e) {
      console.error("Gagal get booking by id dari MySQL:", e.message);
    }
  }

  const list = readJsonBookings();
  return list.find((b) => b.id === id) || null;
}

async function updateBooking(id, fields) {
  if (isUsingMySQL && pool) {
    try {
      const fieldMap = {
        requesterName: "requester_name",
        unit: "unit",
        phone: "phone",
        participants: "participants",
        date: "date",
        session: "session",
        startTime: "start_time",
        endTime: "end_time",
        purpose: "purpose",
        status: "status",
        notes: "notes",
        roomId: "room_id",
        roomName: "room_name"
      };

      const setClauses = [];
      const values = [];

      for (const [key, val] of Object.entries(fields)) {
        if (fieldMap[key]) {
          setClauses.push(`${fieldMap[key]} = ?`);
          values.push(val);
        }
      }

      if (setClauses.length > 0) {
        values.push(id);
        await pool.query(
          `UPDATE bookings SET ${setClauses.join(", ")} WHERE id = ?`,
          values
        );
      }

      return await getBookingById(id);
    } catch (e) {
      console.error("Gagal update booking di MySQL:", e.message);
      throw e;
    }
  }

  const list = readJsonBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;

  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      list[idx][k] = v;
    }
  }
  writeJsonBookings(list);
  return list[idx];
}

async function approveBooking(id) {
  const approvedAt = new Date().toISOString();
  if (isUsingMySQL && pool) {
    try {
      await pool.query(
        "UPDATE bookings SET status = 'aktif', approved_at = NOW() WHERE id = ?",
        [id]
      );
      return await getBookingById(id);
    } catch (e) {
      console.error("Gagal approve booking di MySQL:", e.message);
      throw e;
    }
  }

  const list = readJsonBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  list[idx].status = "aktif";
  list[idx].approvedAt = approvedAt;
  writeJsonBookings(list);
  return list[idx];
}

async function deleteBooking(id) {
  const existing = await getBookingById(id);
  if (!existing) return null;

  if (isUsingMySQL && pool) {
    try {
      await pool.query("DELETE FROM bookings WHERE id = ?", [id]);
      return existing;
    } catch (e) {
      console.error("Gagal hapus booking di MySQL:", e.message);
      throw e;
    }
  }

  const list = readJsonBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const removed = list.splice(idx, 1);
  writeJsonBookings(list);
  return removed[0];
}

async function searchMyBookings(rawQuery) {
  const query = (rawQuery || "").trim().toLowerCase();
  if (!query) return [];

  if (isUsingMySQL && pool) {
    try {
      const cleanPhoneQuery = query.replace(/[^0-9]/g, "");
      const [rows] = await pool.query(
        `SELECT * FROM bookings 
         WHERE LOWER(id) = LOWER(?) 
            OR (REPLACE(phone, '-', '') = ? AND ? != '')
         ORDER BY date DESC`,
        [query, cleanPhoneQuery, cleanPhoneQuery]
      );
      return rows.map(rowToBooking);
    } catch (e) {
      console.error("Gagal mencari booking di MySQL:", e.message);
    }
  }

  const list = readJsonBookings();
  return list.filter((b) =>
    b.id.toLowerCase() === query ||
    (b.phone && b.phone.replace(/[^0-9]/g, "") === query.replace(/[^0-9]/g, ""))
  );
}

module.exports = {
  initDatabase,
  getAdminPin,
  saveAdminPin,
  getAllBookings,
  getAdminBookings,
  getBookingById,
  checkClash,
  createBooking,
  updateBooking,
  approveBooking,
  deleteBooking,
  searchMyBookings,
  isMySQLActive: () => isUsingMySQL
};
