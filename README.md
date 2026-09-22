# Sistem Peminjaman Ruangan — Dinas Kesehatan Kabupaten Gresik

Aplikasi web untuk mengajukan dan mengelola peminjaman ruangan, lengkap dengan
pencatatan siapa yang meminjam (nama, unit kerja, kontak), pengecekan jadwal
bentrok otomatis, dan riwayat yang bisa dicari.

Data disimpan di server (file `data/bookings.json`), bukan di browser saja —
jadi semua komputer yang mengakses aplikasi ini melihat data yang sama.

## Cara menjalankan di VS Code

1. **Install Node.js** (versi 18 ke atas) jika belum ada — unduh di
   https://nodejs.org

2. **Buka folder ini di VS Code**, lalu buka terminal (menu *Terminal → New
   Terminal*).

3. **Install dependency** (cukup sekali di awal):
   ```
   npm install
   ```

4. **Jalankan server:**
   ```
   npm start
   ```
   Jika berhasil, terminal akan menampilkan:
   ```
   Sistem Peminjaman Ruangan berjalan di http://localhost:3000
   ```

5. **Buka di browser:** kunjungi `http://localhost:3000`

6. Untuk berhenti, tekan `Ctrl + C` di terminal.

## Supaya bisa diakses staf lain di jaringan kantor yang sama

1. Jalankan `npm start` seperti biasa di satu komputer (bisa dianggap
   sebagai server).
2. Cari alamat IP komputer tersebut di jaringan kantor, misalnya dengan
   menjalankan `ipconfig` (Windows) atau `ifconfig`/`ip addr` (Mac/Linux),
   contoh hasilnya: `192.168.1.15`.
3. Komputer lain di jaringan yang sama bisa membuka:
   `http://192.168.1.15:3000`
4. Pastikan firewall komputer server mengizinkan koneksi masuk di port
   `3000`.

> Untuk pemakaian jangka panjang oleh banyak staf, sebaiknya aplikasi ini
> dijalankan terus-menerus di satu komputer/server kantor (atau dipasang di
> hosting internal), bukan hanya dinyalakan sewaktu-waktu di laptop pribadi.

## Struktur folder

```
peminjaman-ruangan/
├── server.js           # Server Express + REST API
├── package.json
├── data/
│   └── bookings.json   # Tempat semua data peminjaman tersimpan
├── public/
│   └── index.html      # Tampilan aplikasi (frontend)
└── README.md
```

## Menyesuaikan daftar ruangan

Daftar ruangan (nama, kapasitas, lokasi, fasilitas) diatur di dua tempat dan
sebaiknya diubah bersamaan agar konsisten:

- `public/index.html` — cari variabel `var ROOMS = [ ... ]` di bagian
  `<script>`.
- Nama & id ruangan pada `ROOMS` di `public/index.html` dipakai apa adanya
  oleh server, jadi tidak perlu diubah di `server.js`.

## Mencadangkan data

Seluruh data peminjaman ada di satu file: `data/bookings.json`. Salin file
ini secara berkala sebagai cadangan.
