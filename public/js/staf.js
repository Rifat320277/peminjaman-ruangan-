/**
 * ============================================================================
 * SKRIP HALAMAN STAF — SISTEM PEMINJAMAN RUANG DINKES GRESIK
 * ============================================================================
 */

(function(){
  "use strict";

  // State Halaman Staf
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth();
  var bookingsData = [];

  // DOM Elements
  var pickerScheduleDate = document.getElementById("picker-schedule-date");
  var btnPrevMonth = document.getElementById("btn-prev-month");
  var btnNextMonth = document.getElementById("btn-next-month");
  var btnTodayQuick = document.getElementById("btn-today-quick");
  var labelActiveMonth = document.getElementById("label-active-month");
  var matrixTbody = document.getElementById("matrix-tbody");
  var formBooking = document.getElementById("form-booking");

  // Tab switching
  function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(function(b){
      b.classList.toggle("active", b.getAttribute("data-target") === tabId);
    });
    document.querySelectorAll(".tab-section").forEach(function(s){
      s.style.display = (s.id === tabId) ? "block" : "none";
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".tab-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      var target = btn.getAttribute("data-target");
      if (target) switchTab(target);
    });
  });

  // Muat data peminjaman dari server
  function loadBookings() {
    fetch("/api/bookings")
      .then(function(res){ return res.json(); })
      .then(function(data){
        bookingsData = data || [];
        renderMatrixTable();
      })
      .catch(function(err){
        console.error("Gagal memuat jadwal:", err);
      });
  }

  // Inisialisasi Kalender Pemilih Tanggal
  function initCalendarPicker() {
    if (!pickerScheduleDate) return;

    var initialDateStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(now.getDate());
    pickerScheduleDate.value = initialDateStr;

    // Klik langsung membuka dialog kalender bawaan browser
    pickerScheduleDate.addEventListener("click", function(){
      if (typeof this.showPicker === "function") {
        try { this.showPicker(); } catch(e) {}
      }
    });

    pickerScheduleDate.addEventListener("change", function(){
      if (!this.value) return;
      var parts = this.value.split("-");
      currentYear = parseInt(parts[0], 10);
      currentMonth = parseInt(parts[1], 10) - 1;
      updateMonthView(this.value);
    });

    if (btnPrevMonth) {
      btnPrevMonth.addEventListener("click", function(){
        if (currentMonth === 0) {
          currentMonth = 11;
          currentYear--;
        } else {
          currentMonth--;
        }
        var newDateStr = currentYear + "-" + pad2(currentMonth + 1) + "-01";
        pickerScheduleDate.value = newDateStr;
        updateMonthView(newDateStr);
      });
    }

    if (btnNextMonth) {
      btnNextMonth.addEventListener("click", function(){
        if (currentMonth === 11) {
          currentMonth = 0;
          currentYear++;
        } else {
          currentMonth++;
        }
        var newDateStr = currentYear + "-" + pad2(currentMonth + 1) + "-01";
        pickerScheduleDate.value = newDateStr;
        updateMonthView(newDateStr);
      });
    }

    if (btnTodayQuick) {
      btnTodayQuick.addEventListener("click", function(){
        var today = new Date();
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
        var todayStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(today.getDate());
        pickerScheduleDate.value = todayStr;
        updateMonthView(todayStr);
      });
    }
  }

  function updateMonthView(targetDateStr) {
    if (labelActiveMonth) {
      labelActiveMonth.textContent = "Bulan " + MONTH_NAMES[currentMonth] + " " + currentYear;
    }
    renderMatrixTable();

    if (targetDateStr) {
      setTimeout(function(){
        var row = document.getElementById("row-date-" + targetDateStr);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.classList.add("highlight-pulse");
          setTimeout(function(){ row.classList.remove("highlight-pulse"); }, 2000);
        }
      }, 70);
    }
  }

  // Render Tabel Spreadsheet Jadwal Ruangan
  function renderMatrixTable() {
    if (!matrixTbody) return;
    matrixTbody.innerHTML = "";
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Petakan booking: key = YYYY-MM-DD + "_" + session
    var map = {};
    bookingsData.forEach(function(b){
      if (b.status !== "aktif" && b.status !== "menunggu") return;
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

    var todayStr = new Date().toISOString().substring(0, 10);

    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(d);
      var dayObj = new Date(currentYear, currentMonth, d);
      var dayOfWeek = dayObj.getDay();
      var isSunday = (dayOfWeek === 0);
      var isSaturday = (dayOfWeek === 6);
      var isWeekend = (isSunday || isSaturday);
      var isToday = (dateStr === todayStr);
      var dayName = DAY_NAMES[dayOfWeek];

      // Baris Sesi Pagi
      var trPagi = document.createElement("tr");
      trPagi.id = "row-date-" + dateStr;
      if (isWeekend) {
        trPagi.className = "weekend";
        if (isSaturday) trPagi.classList.add("saturday");
        if (isSunday) trPagi.classList.add("sunday");
      }
      if (isToday) trPagi.classList.add("today");

      var tdTgl = document.createElement("td");
      tdTgl.rowSpan = 2;
      tdTgl.className = "col-tgl";
      tdTgl.innerHTML = "<strong>" + d + "</strong><div style='font-size:10px; color:" + (isWeekend ? "#991b1b" : "#64748b") + "; font-weight:" + (isWeekend ? "800" : "normal") + ";'>" + dayName + "</div>";
      trPagi.appendChild(tdTgl);

      var tdWaktuPagi = document.createElement("td");
      tdWaktuPagi.className = "col-waktu pagi";
      tdWaktuPagi.textContent = "Pagi";
      trPagi.appendChild(tdWaktuPagi);

      appendStaffRoomCells(trPagi, dateStr, "pagi", map[dateStr] ? map[dateStr]["pagi"] : null, isWeekend);
      matrixTbody.appendChild(trPagi);

      // Baris Sesi Siang
      var trSiang = document.createElement("tr");
      trSiang.id = "row-date-" + dateStr + "-siang";
      if (isWeekend) {
        trSiang.className = "weekend";
        if (isSaturday) trSiang.classList.add("saturday");
        if (isSunday) trSiang.classList.add("sunday");
      }
      if (isToday) trSiang.classList.add("today");

      var tdWaktuSiang = document.createElement("td");
      tdWaktuSiang.className = "col-waktu siang";
      tdWaktuSiang.textContent = "Siang";
      trSiang.appendChild(tdWaktuSiang);

      appendStaffRoomCells(trSiang, dateStr, "siang", map[dateStr] ? map[dateStr]["siang"] : null, isWeekend);
      matrixTbody.appendChild(trSiang);
    }
  }

  function appendStaffRoomCells(tr, dateStr, session, sessionMap, isWeekend) {
    var rooms = ["hypocrates", "arrozi", "aviecena"];
    rooms.forEach(function(roomId) {
      var booking = sessionMap ? sessionMap[roomId] : null;

      var tdKegiatan = document.createElement("td");
      var tdPJ = document.createElement("td");

      if (booking) {
        tdKegiatan.className = "cell-booked";
        tdPJ.className = "cell-booked";

        if (booking.status === "menunggu") {
          tdKegiatan.style.background = "#fef3c7";
          tdPJ.style.background = "#fef3c7";
          tdKegiatan.innerHTML = "<div class='admin-cell-content'><span style='color:#b45309; font-weight:700;'>⏳ [MENUNGGU]</span><span class='admin-cell-unit'>" + escapeHTML(booking.purpose || booking.unit || "-") + "</span></div>";
          tdPJ.innerHTML = "<div class='admin-cell-pj'>" + escapeHTML(booking.requesterName || "-") + "<br><small style='color:#64748b;'>" + escapeHTML(booking.unit || "") + "</small></div>";
        } else {
          tdKegiatan.innerHTML = "<div class='admin-cell-content'><span class='admin-cell-unit'>" + escapeHTML(booking.purpose || booking.unit || "-") + "</span></div>";
          tdPJ.innerHTML = "<div class='admin-cell-pj'>" + escapeHTML(booking.requesterName || "-") + "<br><small style='color:#64748b;'>" + escapeHTML(booking.unit || "") + "</small></div>";
        }

        tdKegiatan.style.cursor = "pointer";
        tdPJ.style.cursor = "pointer";
        tdKegiatan.title = "Klik untuk melihat rincian — " + (ROOM_NAMES[roomId] || roomId);
        tdPJ.title = "Klik untuk melihat rincian — " + (ROOM_NAMES[roomId] || roomId);
        var showDetail = (function(b){ return function(){ showStaffBookingDetail(b); }; })(booking);
        tdKegiatan.addEventListener("click", showDetail);
        tdPJ.addEventListener("click", showDetail);

        tr.appendChild(tdKegiatan);
        tr.appendChild(tdPJ);
      } else {
        // Slot tersedia: tampilkan — tapi bisa diklik untuk mengajukan peminjaman
        tdKegiatan.className = "cell-empty";
        tdKegiatan.colSpan = 2;
        tdKegiatan.innerHTML = "<span class='badge-slot available'>✓ Tersedia</span>";
        tdKegiatan.title = "Klik untuk mengajukan peminjaman ruangan ini";
        tdKegiatan.addEventListener("click", (function(rId, ds, sess){ return function(){ openFormForSlot(rId, ds, sess); }; })(roomId, dateStr, session));
        tr.appendChild(tdKegiatan);
      }
    });
  }

  function openFormForSlot(roomId, dateStr, session) {
    switchTab("tab-ajukan");
    document.getElementById("f-date").value = dateStr;

    document.querySelectorAll(".room-card-option").forEach(function(c){
      var isTarget = c.getAttribute("data-room") === roomId;
      c.classList.toggle("selected", isTarget);
      var svg = c.querySelector("svg");
      if (svg) svg.style.display = isTarget ? "block" : "none";
    });
    document.getElementById("f-room").value = roomId;

    document.querySelectorAll(".session-radio-btn").forEach(function(lbl){
      var input = lbl.querySelector("input");
      if (input.value === session) {
        input.checked = true;
        lbl.classList.add("checked");
      } else {
        lbl.classList.remove("checked");
      }
    });

    checkLiveConflict();
    document.getElementById("f-pj").focus();
  }

  // Pilih Ruangan di Form
  document.querySelectorAll(".room-card-option").forEach(function(card){
    card.addEventListener("click", function(){
      document.querySelectorAll(".room-card-option").forEach(function(c){
        c.classList.remove("selected");
        var svg = c.querySelector("svg");
        if (svg) svg.style.display = "none";
      });
      card.classList.add("selected");
      var svg = card.querySelector("svg");
      if (svg) svg.style.display = "block";
      var roomId = card.getAttribute("data-room");
      document.getElementById("f-room").value = roomId;
      checkLiveConflict();
    });
  });

  // Pilih Sesi di Form
  document.querySelectorAll(".session-radio-btn input").forEach(function(radio){
    radio.addEventListener("change", function(){
      document.querySelectorAll(".session-radio-btn").forEach(function(lbl){
        lbl.classList.remove("checked");
      });
      this.closest(".session-radio-btn").classList.add("checked");
      checkLiveConflict();
    });
  });

  document.getElementById("f-date").addEventListener("change", checkLiveConflict);

  function checkLiveConflict() {
    var roomId = document.getElementById("f-room").value;
    var dateVal = document.getElementById("f-date").value;
    var sessInput = document.querySelector('input[name="session-radio"]:checked');
    var sessionVal = sessInput ? sessInput.value : "pagi";
    var alertBox = document.getElementById("conflict-live-alert");

    if (!roomId || !dateVal || !sessionVal) {
      if (alertBox) alertBox.style.display = "none";
      return;
    }

    var conflict = bookingsData.some(function(b){
      if (b.status !== "aktif" && b.status !== "menunggu") return false;
      if (b.date !== dateVal || b.roomId !== roomId) return false;
      if (sessionVal === "seharian") return true;
      if (b.session === "seharian") return true;
      return b.session === sessionVal;
    });

    if (alertBox) {
      alertBox.style.display = conflict ? "block" : "none";
    }
  }

  // Submit Formulir Peminjaman Ruangan
  if (formBooking) {
    formBooking.addEventListener("submit", function(e){
      e.preventDefault();

      var roomId = document.getElementById("f-room").value;
      var date = document.getElementById("f-date").value;
      var sessInput = document.querySelector('input[name="session-radio"]:checked');
      var session = sessInput ? sessInput.value : "pagi";
      var requesterName = document.getElementById("f-pj").value.trim();
      var unit = document.getElementById("f-unit").value.trim();
      var phone = document.getElementById("f-phone") ? document.getElementById("f-phone").value.trim() : "";
      var purpose = document.getElementById("f-purpose").value.trim();
      var notes = document.getElementById("f-notes").value.trim();

      var submitBtn = document.getElementById("btn-submit-booking");
      submitBtn.disabled = true;
      submitBtn.innerHTML = "<span>Memproses...</span>";

      var startTime = session === "pagi" ? "07:30" : (session === "siang" ? "12:30" : "07:30");
      var endTime = session === "pagi" ? "12:00" : (session === "siang" ? "16:00" : "16:00");
      var roomName = ROOM_NAMES[roomId] || roomId.toUpperCase();

      var payload = {
        roomId: roomId,
        roomName: roomName,
        date: date,
        session: session,
        startTime: startTime,
        endTime: endTime,
        requesterName: requesterName,
        unit: unit,
        phone: phone || "-",
        purpose: purpose,
        notes: notes
      };

      fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(function(res){
        return res.text().then(function(text){
          var data;
          try {
            data = JSON.parse(text);
          } catch(e) {
            data = { message: "Gagal terhubung ke server (HTTP " + res.status + ")" };
          }
          if (!res.ok) {
            var errMsg = data.message || data.error || ("Gagal mengajukan peminjaman (Status: " + res.status + ")");
            throw new Error(errMsg);
          }
          return data;
        });
      })
      .then(function(result){
        formBooking.reset();
        document.getElementById("f-date").value = date;
        loadBookings();

        // Tampilkan Resi Bukti Pengajuan
        var b = result || {};
        var content = document.getElementById("receipt-content");
        content.innerHTML =
          "<div style='background:#fefce8; border:1px solid #fde68a; border-radius:8px; padding:14px; margin-bottom:16px;'>" +
            "<div style='font-size:14px; color:#b45309; font-weight:600;'>⏳ Status: <strong>Menunggu Persetujuan Admin</strong></div>" +
          "</div>" +
          "<div style='font-size:13px; color:#334155; line-height:1.7;'>" +
            "<div><strong>Ruangan:</strong> " + escapeHTML(ROOM_NAMES[b.roomId] || b.roomName || b.roomId) + "</div>" +
            "<div><strong>Tanggal:</strong> " + escapeHTML(b.date) + " (" + escapeHTML((b.session||"").toUpperCase()) + ")</div>" +
            "<div><strong>Penanggung Jawab:</strong> " + escapeHTML(b.requesterName) + " (" + escapeHTML(b.unit) + ")</div>" +
            "<div><strong>Agenda:</strong> " + escapeHTML(b.purpose) + "</div>" +
          "</div>" +
          "<div style='margin-top:14px; padding:10px 12px; background:#f0fdfa; border:1px solid #ccfbf1; border-radius:6px; font-size:12px; color:#0f766e;'>" +
            "ℹ️ Peminjaman Anda telah tersimpan dan masuk ke antrean persetujuan admin." +
          "</div>";

        openModal("modal-receipt");
        showToast("Pengajuan peminjaman berhasil dikirim! Menunggu persetujuan admin.", "success");
      })
      .catch(function(err){
        console.error("Submit booking error:", err);
        showToast(err.message, "error");
      })
      .finally(function(){
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><polyline points='20 6 9 17 4 12'/></svg><span>Kirim Pengajuan Peminjaman</span>";
      });
    });
  }


  // Tampilkan Rincian Peminjaman di Modal (Mode Staf)
  function showStaffBookingDetail(b) {
    var title = document.getElementById("modal-detail-title");
    var body = document.getElementById("modal-detail-body");
    if (!title || !body) return;

    var roomName = ROOM_NAMES[b.roomId] || b.roomName || b.roomId;
    title.textContent = "Rincian Peminjaman — " + roomName;

    var statusBadge = "<span class='badge-slot available' style='display:inline-flex; width:auto;'>✓ Disetujui / Terjadwal</span>";
    if (b.status === "menunggu") {
      statusBadge = "<span class='badge-slot pending' style='display:inline-flex; width:auto;'>⏳ Menunggu Persetujuan Admin</span>";
    }

    body.innerHTML =
      "<div style='margin-bottom: 14px;'>" +
        statusBadge +
      "</div>" +
      "<table style='width:100%; border:none; font-size:13px; line-height:1.8;'>" +
        "<tr><td style='width:140px; color:#64748b; border:none; padding:4px 0;'>Ruangan:</td><td style='border:none; font-weight:700; color:#0f766e; padding:4px 0;'>" + escapeHTML(roomName) + "</td></tr>" +
        "<tr><td style='color:#64748b; border:none; padding:4px 0;'>Tanggal:</td><td style='border:none; font-weight:600; padding:4px 0;'>" + escapeHTML(b.date) + " (" + escapeHTML((b.session||"").toUpperCase()) + ", " + escapeHTML(b.startTime||"") + " - " + escapeHTML(b.endTime||"") + " WIB)</td></tr>" +
        "<tr><td style='color:#64748b; border:none; padding:4px 0;'>Agenda / Kegiatan:</td><td style='border:none; font-weight:700; color:#0f172a; padding:4px 0;'>" + escapeHTML(b.purpose || "-") + "</td></tr>" +
        "<tr><td style='color:#64748b; border:none; padding:4px 0;'>Bidang / Unit:</td><td style='border:none; font-weight:600; padding:4px 0;'>" + escapeHTML(b.unit || "-") + "</td></tr>" +
        "<tr><td style='color:#64748b; border:none; padding:4px 0;'>Penanggung Jawab:</td><td style='border:none; font-weight:600; padding:4px 0;'>" + escapeHTML(b.requesterName || "-") + "</td></tr>" +
        (b.notes ? "<tr><td style='color:#64748b; border:none; padding:4px 0;'>Catatan Tambahan:</td><td style='border:none; padding:4px 0; font-style:italic;'>" + escapeHTML(b.notes) + "</td></tr>" : "") +
      "</table>";

    openModal("modal-detail");
  }

  // Tombol Pintas
  var btnQuickBook = document.getElementById("btn-quick-book");
  if (btnQuickBook) {
    btnQuickBook.addEventListener("click", function(){ switchTab("tab-ajukan"); });
  }

  var btnPrintSchedule = document.getElementById("btn-print-schedule");
  if (btnPrintSchedule) {
    btnPrintSchedule.addEventListener("click", function(){ window.print(); });
  }

  var btnExportSpreadsheet = document.getElementById("btn-export-spreadsheet");
  if (btnExportSpreadsheet) {
    btnExportSpreadsheet.addEventListener("click", function(){
      exportSpreadsheet(true, currentYear, currentMonth, bookingsData);
    });
  }


  // Inisialisasi awal
  var todayISO = now.toISOString().substring(0, 10);
  var fDateInput = document.getElementById("f-date");
  if (fDateInput) fDateInput.value = todayISO;

  initCalendarPicker();
  loadBookings();

})();
