-- ============================================================================
-- SKEMA DATABASE MYSQL: SISTEM PEMINJAMAN RUANGAN DINAS KESEHATAN KAB. GRESIK
-- ============================================================================

-- 1. Buat Database (jika belum ada)
CREATE DATABASE IF NOT EXISTS peminjaman_ruangan
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE peminjaman_ruangan;

-- 2. Tabel Konfigurasi Admin (Menyimpan PIN Admin)
CREATE TABLE IF NOT EXISTS admin_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(50) NOT NULL UNIQUE,
    config_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Default Admin PIN: admin123
INSERT INTO admin_config (config_key, config_value) 
VALUES ('admin_pin', 'admin123')
ON DUPLICATE KEY UPDATE config_key = config_key;


-- 3. Tabel Master Ruangan
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    capacity INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Data Master Ruangan Resmi Dinas Kesehatan Kab. Gresik
INSERT INTO rooms (id, name, capacity, description) VALUES
('hypocrates', 'HYPOCRATES', 50, 'Ruang Pertemuan Utama Lantai 2'),
('arrozi', 'AR ROZI', 30, 'Ruang Rapat Sayap Barat'),
('aviecena', 'AVIECENA', 25, 'Ruang Rapat Sayap Timur')
ON DUPLICATE KEY UPDATE name = VALUES(name), capacity = VALUES(capacity);


-- 4. Tabel Transaksi Peminjaman Ruangan (Bookings)
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
    INDEX idx_status (status),
    INDEX idx_phone (phone)
) ENGINE=InnoDB;

-- Data Awal / Sampel Peminjaman (Migrasi dari data bookings.json)
INSERT INTO bookings (
    id, room_id, room_name, requester_name, unit, phone, 
    participants, date, session, start_time, end_time, 
    start_date_time, purpose, notes, status, created_at
) VALUES (
    'BK-20260901-M02K',
    'hypocrates',
    'HYPOCRATES',
    'effe',
    'dfe',
    '-',
    1,
    '2026-09-01',
    'pagi',
    '07:30',
    '12:00',
    '2026-09-01T07:30',
    'efe',
    'fee',
    'menunggu',
    '2026-09-25 08:25:29'
) ON DUPLICATE KEY UPDATE id = id;
