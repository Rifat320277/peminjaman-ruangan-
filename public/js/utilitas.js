/**
 * ============================================================================
 * UTILITAS & FUNGSI BANTUAN — SISTEM PEMINJAMAN RUANGAN DINKES GRESIK
 * ============================================================================
 */

var MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

var DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

var ROOM_NAMES = {
  "hypocrates": "HYPOCRATES",
  "arrozi": "AR ROZI",
  "aviecena": "AVIECENA"
};

// Format angka dua digit (contoh: 5 -> "05")
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

// Escape karakter berbahaya untuk HTML
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Tampilkan Notifikasi Toast
function showToast(message, type) {
  var container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  var toast = document.createElement("div");
  toast.className = "toast " + (type || "success");
  toast.innerHTML = (type === "error" ? "⚠️ " : "✅ ") + message;
  container.appendChild(toast);

  requestAnimationFrame(function(){ toast.classList.add("show"); });
  setTimeout(function(){
    toast.classList.remove("show");
    setTimeout(function(){ toast.remove(); }, 300);
  }, 3500);
}

// Buka Modal
function openModal(modalId) {
  var m = document.getElementById(modalId);
  if (m) m.classList.add("open");
}

// Tutup Modal
function closeModal(modalId) {
  var m = document.getElementById(modalId);
  if (m) m.classList.remove("open");
}

// Pasang pendengar klik tombol tutup modal [data-close]
document.addEventListener("DOMContentLoaded", function(){
  document.querySelectorAll("[data-close]").forEach(function(btn){
    btn.addEventListener("click", function(){
      var backdrop = btn.closest(".modal-backdrop");
      if (backdrop) backdrop.classList.remove("open");
    });
  });
});

// Ekspor Lembar Kerja Spreadsheet Excel resmi
function exportSpreadsheet(fullDetails, currentYear, currentMonth, bookingsData) {
  var monthName = MONTH_NAMES[currentMonth];
  var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  var map = {};
  (bookingsData || []).forEach(function(b){
    if (b.status !== "aktif") return;
    var dateKey = b.date;
    var roomKey = b.roomId;
    var sessKey = b.session || "pagi";

    if (!map[dateKey]) map[dateKey] = {};
    if (!map[dateKey][sessKey]) map[dateKey][sessKey] = {};
    map[dateKey][sessKey][roomKey] = b;

    if (sessKey === "seharian") {
      if (!map[dateKey]["pagi"]) map[dateKey]["pagi"] = {};
      if (!map[dateKey]["siang"]) map[dateKey]["siang"] = {};
      map[dateKey]["pagi"][roomKey] = b;
      map[dateKey]["siang"][roomKey] = b;
    }
  });

  var rooms = ["hypocrates", "arrozi", "aviecena"];

  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>' +
    '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
    '<x:Name>' + monthName + ' ' + currentYear + '</x:Name>' +
    '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
    '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
    '<style>' +
    'table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }' +
    'th, td { border: 1px solid #000000; padding: 5px 8px; vertical-align: middle; }' +
    '.title-1 { font-size: 14pt; font-weight: bold; text-align: center; border: none; }' +
    '.title-2 { font-size: 12pt; font-weight: bold; text-align: center; border: none; }' +
    '.sub-note { font-size: 10pt; border: none; }' +
    '.th-group { background-color: #CBD5E1; font-weight: bold; text-align: center; }' +
    '.th-room { background-color: #E2E8F0; font-weight: bold; text-align: center; font-size: 10.5pt; }' +
    '.th-sub { background-color: #F1F5F9; font-weight: bold; text-align: center; font-size: 9.5pt; }' +
    '.weekend-bg { background-color: #FFFF00 !important; }' +
    '.text-center { text-align: center; }' +
    '.text-bold { font-weight: bold; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<table>' +
    '<tr><td colspan="8" class="title-1">DAFTAR PEMINJAMAN RUANG</td></tr>' +
    '<tr><td colspan="8" class="title-2">DINAS KESEHATAN KABUPATEN GRESIK</td></tr>' +
    '<tr><td colspan="8" style="border:none; height:8px;"></td></tr>' +
    '<tr><td colspan="8" class="sub-note"><strong>Bulan ' + monthName + ' ' + currentYear + '</strong></td></tr>' +
    '<tr><td colspan="8" class="sub-note">Waktu Penggunaan: Pagi, Siang, dan Seharian</td></tr>' +
    '<tr><td colspan="8" class="sub-note">NB: Peminjaman Ruangan dapat menghubungi Mbak Lisa dan Mas Mudzakir</td></tr>' +
    '<tr><td colspan="8" style="border:none; height:8px;"></td></tr>' +
    '<thead>' +
    '<tr>' +
      '<th rowspan="2" class="th-room" style="width:65px;">Tanggal</th>' +
      '<th rowspan="2" class="th-room" style="width:70px;">Waktu</th>' +
      '<th colspan="6" class="th-group">Nama Ruang</th>' +
    '</tr>' +
    '<tr>' +
      '<th colspan="2" class="th-room" style="width:250px;">HYPOCRATES</th>' +
      '<th colspan="2" class="th-room" style="width:250px;">AR ROZI</th>' +
      '<th colspan="2" class="th-room" style="width:250px;">AVIECENA</th>' +
    '</tr>' +
    '<tr>' +
      '<th class="th-sub"></th>' +
      '<th class="th-sub"></th>' +
      '<th class="th-sub">Kegiatan / Unit</th>' +
      '<th class="th-sub">Penanggung Jawab</th>' +
      '<th class="th-sub">Kegiatan / Unit</th>' +
      '<th class="th-sub">Penanggung Jawab</th>' +
      '<th class="th-sub">Kegiatan / Unit</th>' +
      '<th class="th-sub">Penanggung Jawab</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>';

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(d);
    var dayOfWeek = new Date(currentYear, currentMonth, d).getDay();
    var isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    var cellBg = isWeekend ? ' style="background-color:#FFFF00;"' : '';

    var pagiMap = (map[dateStr] && map[dateStr]["pagi"]) ? map[dateStr]["pagi"] : {};
    var siangMap = (map[dateStr] && map[dateStr]["siang"]) ? map[dateStr]["siang"] : {};

    // Row 1: Sesi Pagi
    html += '<tr>';
    html += '<td rowspan="2" class="text-center text-bold"' + cellBg + '>' + d + '</td>';
    html += '<td class="text-center text-bold"' + cellBg + '>Pagi</td>';
    rooms.forEach(function(rId){
      var b = pagiMap[rId];
      if (b) {
        var keg = fullDetails ? (b.purpose || b.unit || "-") : "Terisi";
        var pj = fullDetails ? (b.requesterName || "-") : "Terisi";
        html += '<td' + cellBg + '>' + escapeHTML(keg) + '</td>';
        html += '<td' + cellBg + '>' + escapeHTML(pj) + '</td>';
      } else {
        html += '<td' + cellBg + '></td><td' + cellBg + '></td>';
      }
    });
    html += '</tr>';

    // Row 2: Sesi Siang
    html += '<tr>';
    html += '<td class="text-center text-bold"' + cellBg + '>Siang</td>';
    rooms.forEach(function(rId){
      var b = siangMap[rId];
      if (b) {
        var keg = fullDetails ? (b.purpose || b.unit || "-") : "Terisi";
        var pj = fullDetails ? (b.requesterName || "-") : "Terisi";
        html += '<td' + cellBg + '>' + escapeHTML(keg) + '</td>';
        html += '<td' + cellBg + '>' + escapeHTML(pj) + '</td>';
      } else {
        html += '<td' + cellBg + '></td><td' + cellBg + '></td>';
      }
    });
    html += '</tr>';
  }

  html += '</tbody></table></body></html>';

  var blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  var filename = "Jadwal_Ruang_Dinkes_" + monthName + "_" + currentYear + (fullDetails ? "_Lengkap" : "") + ".xls";
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("File Spreadsheet berhasil diunduh: " + filename, "success");
}
