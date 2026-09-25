/**
 * ============================================================================
 * SKRIP DASHBOARD PENGELOLA / ADMIN — SISTEM PEMINJAMAN RUANG DINKES GRESIK
 * ============================================================================
 */

(function(){
  "use strict";

  // State Admin
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentMonth = now.getMonth();
  var bookingsData = [];
  var adminToken = localStorage.getItem("dinkes_admin_token") || "";

  // DOM Elements
  var lockScreen = document.getElementById("admin-lock-screen");
  var dashboardContent = document.getElementById("admin-dashboard-content");
  var formAdminLogin = document.getElementById("form-admin-login");
  var btnAdminLogout = document.getElementById("btn-admin-logout");
  var pendingPanel = document.getElementById("pending-panel");
  var pendingList = document.getElementById("pending-list");
  var pendingCount = document.getElementById("pending-count");
  var pickerScheduleDate = document.getElementById("picker-schedule-date");
  var btnPrevMonth = document.getElementById("btn-prev-month");
  var btnNextMonth = document.getElementById("btn-next-month");
  var btnTodayQuick = document.getElementById("btn-today-quick");
  var labelActiveMonth = document.getElementById("label-active-month");
  var matrixTbody = document.getElementById("matrix-tbody");
  var btnExportSpreadsheet = document.getElementById("btn-export-spreadsheet");
  var btnPrintSchedule = document.getElementById("btn-print-schedule");

  // Periksa Status Login Admin
  function checkAuthUI() {
    if (adminToken) {
      if (lockScreen) lockScreen.style.display = "none";
      if (dashboardContent) dashboardContent.style.display = "block";
      if (btnAdminLogout) btnAdminLogout.style.display = "inline-flex";
      loadAdminBookings();
    } else {
      if (lockScreen) lockScreen.style.display = "block";
      if (dashboardContent) dashboardContent.style.display = "none";
      if (btnAdminLogout) btnAdminLogout.style.display = "none";
    }
  }

  // Handle Form Login Admin
  if (formAdminLogin) {
    formAdminLogin.addEventListener("submit", function(e){
      e.preventDefault();
      var pin = document.getElementById("admin-pin-input").value.trim();
      if (!pin) return;

      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin })
      })
      .then(function(res){
        return res.json().then(function(data){
          if (!res.ok) throw new Error(data.message || "PIN salah.");
          return data;
        });
      })
      .then(function(res){
        adminToken = res.token || "";
        localStorage.setItem("dinkes_admin_token", adminToken);
        formAdminLogin.reset();
        showToast("Login Admin Berhasil!", "success");
        checkAuthUI();
      })
      .catch(function(err){
        showToast(err.message, "error");
      });
    });
  }

  // Logout Admin
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", function(){
      adminToken = "";
      localStorage.removeItem("dinkes_admin_token");
      showToast("Anda telah keluar dari Mode Admin.", "success");
      checkAuthUI();
    });
  }

  // Muat data peminjaman admin (akses lengkap)
  function loadAdminBookings() {
    if (!adminToken) return;

    fetch("/api/admin/bookings", {
      headers: { "x-admin-token": adminToken }
    })
    .then(function(res){
      if (res.status === 403) {
        // Token kadaluarsa / tidak valid
        adminToken = "";
        localStorage.removeItem("dinkes_admin_token");
        checkAuthUI();
        throw new Error("Sesi admin telah berakhir. Silakan login kembali.");
      }
      return res.json();
    })
    .then(function(data){
      bookingsData = data || [];
      renderPendingRequests();
      renderAdminMatrixTable();
    })
    .catch(function(err){
      console.error(err);
      showToast(err.message, "error");
    });
  }

  // Render Panel Permintaan Menunggu Persetujuan
  function renderPendingRequests() {
    if (!pendingList || !pendingCount) return;

    var pendingItems = bookingsData.filter(function(b){
      return b.status === "menunggu";
    });

    pendingCount.textContent = pendingItems.length;

    if (pendingItems.length === 0) {
      pendingList.innerHTML = "<div class='pending-empty'>🎉 Tidak ada permintaan peminjaman yang menunggu persetujuan.</div>";
      return;
    }

    pendingList.innerHTML = "";
    pendingItems.forEach(function(b){
      var item = document.createElement("div");
      item.className = "pending-item";

      var info = document.createElement("div");
      info.className = "pending-item-info";
      info.innerHTML =
        "<div class='pending-item-room'>📍 " + (ROOM_NAMES[b.roomId] || b.roomId) + " &bull; " + b.date + " (" + (b.session||"").toUpperCase() + ")</div>" +
        "<div class='pending-item-detail'>" +
          "<strong>Penanggung Jawab:</strong> " + escapeHTML(b.requesterName) + " (" + escapeHTML(b.unit) + ") &bull; " +
          "<strong>Agenda:</strong> " + escapeHTML(b.purpose) +
          (b.notes ? "<br><em>Catatan: " + escapeHTML(b.notes) + "</em>" : "") +
        "</div>";

      var actions = document.createElement("div");
      actions.className = "pending-item-actions";

      var btnApprove = document.createElement("button");
      btnApprove.className = "btn-approve";
      btnApprove.innerHTML = "✓ Setujui";
      btnApprove.addEventListener("click", function(){
        approveBooking(b.id, b.roomName, b.requesterName);
      });

      var btnReject = document.createElement("button");
      btnReject.className = "btn-reject";
      btnReject.innerHTML = "✕ Tolak & Hapus";
      btnReject.addEventListener("click", function(){
        rejectBooking(b.id, b.roomName, b.requesterName);
      });

      actions.appendChild(btnApprove);
      actions.appendChild(btnReject);

      item.appendChild(info);
      item.appendChild(actions);
      pendingList.appendChild(item);
    });
  }

  // Setujui Permintaan
  function approveBooking(bookingId, roomName, requester) {
    if (!confirm("Setujui peminjaman " + roomName + " untuk " + requester + "?")) return;

    fetch("/api/admin/bookings/" + encodeURIComponent(bookingId) + "/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      }
    })
    .then(function(res){
      return res.json().then(function(data){
        if (!res.ok) throw new Error(data.message || "Gagal menyetujui.");
        return data;
      });
    })
    .then(function(){
      showToast("Peminjaman berhasil disetujui dan jadwal telah diperbarui!", "success");
      loadAdminBookings();
    })
    .catch(function(err){
      showToast(err.message, "error");
    });
  }

  // Tolak & Hapus Permintaan
  function rejectBooking(bookingId, roomName, requester) {
    if (!confirm("Apakah Anda yakin ingin menolak & menghapus jadwal peminjaman " + roomName + " untuk " + requester + "?\n\nSetelah dihapus, pengajuan ini tidak akan dimunculkan lagi dan ruangan kembali berstatus Tersedia.")) return;

    fetch("/api/admin/bookings/" + encodeURIComponent(bookingId) + "/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      }
    })
    .then(function(res){
      return res.json().then(function(data){
        if (!res.ok) throw new Error(data.message || "Gagal menolak peminjaman.");
        return data;
      });
    })
    .then(function(){
      showToast("Peminjaman berhasil ditolak dan dihapus secara permanen.", "success");
      loadAdminBookings();
    })
    .catch(function(err){
      showToast(err.message, "error");
    });
  }

  // Render Tabel Jadwal Admin (Lengkap & Transparan)
  function renderAdminMatrixTable() {
    if (!matrixTbody) return;
    matrixTbody.innerHTML = "";
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

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

      appendAdminRoomCells(trPagi, dateStr, "pagi", map[dateStr] ? map[dateStr]["pagi"] : null, isWeekend);
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

      appendAdminRoomCells(trSiang, dateStr, "siang", map[dateStr] ? map[dateStr]["siang"] : null, isWeekend);
      matrixTbody.appendChild(trSiang);
    }
  }

  function appendAdminRoomCells(tr, dateStr, session, sessionMap, isWeekend) {
    var rooms = ["hypocrates", "arrozi", "aviecena"];
    rooms.forEach(function(roomId) {
      var booking = sessionMap ? sessionMap[roomId] : null;

      var tdKegiatan = document.createElement("td");
      var tdPJ = document.createElement("td");

      if (booking) {
        if (booking.status === "menunggu") {
          tdKegiatan.style.background = "#fef3c7";
          tdPJ.style.background = "#fef3c7";
          tdKegiatan.innerHTML = "<div class='admin-cell-content'><span style='color:#b45309; font-weight:700;'>⏳ [MENUNGGU]</span><span class='admin-cell-unit'>" + escapeHTML(booking.purpose || booking.unit) + "</span></div>";
          tdPJ.innerHTML = "<div class='admin-cell-pj'>" + escapeHTML(booking.requesterName) + "<br><small style='color:#64748b;'>" + escapeHTML(booking.unit || "") + "</small></div>";
        } else {
          tdKegiatan.innerHTML = "<div class='admin-cell-content'><span class='admin-cell-unit'>" + escapeHTML(booking.purpose || booking.unit) + "</span></div>";
          tdPJ.innerHTML = "<div class='admin-cell-pj'>" + escapeHTML(booking.requesterName) + "<br><small style='color:#64748b;'>" + escapeHTML(booking.unit || "") + "</small></div>";
        }

        tdKegiatan.style.cursor = "pointer";
        tdPJ.style.cursor = "pointer";
        var openDetail = function(){ showBookingDetailModal(booking); };
        tdKegiatan.addEventListener("click", openDetail);
        tdPJ.addEventListener("click", openDetail);
      } else {
        tdKegiatan.innerHTML = "<span style='color:#cbd5e1; font-size:11px;'>—</span>";
        tdPJ.innerHTML = "<span style='color:#cbd5e1; font-size:11px;'>—</span>";
      }

      tr.appendChild(tdKegiatan);
      tr.appendChild(tdPJ);
    });
  }

  // Tampilkan Detail Booking di Modal
  function showBookingDetailModal(b) {
    var title = document.getElementById("modal-detail-title");
    var body = document.getElementById("modal-detail-body");
    var actions = document.getElementById("modal-detail-actions");

    title.textContent = "Detail Peminjaman — " + (ROOM_NAMES[b.roomId] || b.roomId);

    var statusBadge = "<span class='badge-slot available'>Disetujui / Aktif</span>";
    if (b.status === "menunggu") {
      statusBadge = "<span class='badge-slot pending'>Menunggu Persetujuan</span>";
    }

    body.innerHTML =
      "<div style='margin-bottom: 14px;'>" +
        statusBadge +
      "</div>" +
      "<table style='width:100%; border:none; font-size:13px; line-height:1.8;'>" +
        "<tr><td style='width:140px; color:#64748b; border:none;'>Tanggal:</td><td style='border:none; font-weight:600;'>" + b.date + " (" + (b.session||"").toUpperCase() + ")</td></tr>" +
        "<tr><td style='color:#64748b; border:none;'>Penanggung Jawab:</td><td style='border:none; font-weight:600;'>" + escapeHTML(b.requesterName) + "</td></tr>" +
        "<tr><td style='color:#64748b; border:none;'>Bidang / Unit:</td><td style='border:none;'>" + escapeHTML(b.unit) + "</td></tr>" +
        "<tr><td style='color:#64748b; border:none;'>Agenda Rapat:</td><td style='border:none; font-weight:600;'>" + escapeHTML(b.purpose) + "</td></tr>" +
        (b.notes ? "<tr><td style='color:#64748b; border:none;'>Catatan:</td><td style='border:none; font-style:italic;'>" + escapeHTML(b.notes) + "</td></tr>" : "") +
      "</table>";

    actions.innerHTML = "";

    if (b.status === "menunggu") {
      var btnAcc = document.createElement("button");
      btnAcc.className = "btn btn-primary btn-sm";
      btnAcc.textContent = "Setujui Permintaan";
      btnAcc.addEventListener("click", function(){
        closeModal("modal-detail");
        approveBooking(b.id, b.roomName, b.requesterName);
      });
      actions.appendChild(btnAcc);
    }

    var btnDel = document.createElement("button");
    btnDel.className = "btn btn-danger btn-sm";
    btnDel.textContent = "Hapus / Batalkan Jadwal";
    btnDel.addEventListener("click", function(){
      if (!confirm("Apakah Anda yakin ingin menghapus jadwal ini secara permanen?\n\nSetelah dihapus, data peminjaman tidak akan dimunculkan lagi dan slot ruangan akan kembali berstatus Tersedia.")) return;
      deleteBooking(b.id);
    });
    actions.appendChild(btnDel);

    openModal("modal-detail");
  }

  function deleteBooking(bookingId) {
    fetch("/api/admin/cancel-booking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: JSON.stringify({ bookingId: bookingId })
    })
    .then(function(res){
      return res.json().then(function(data){
        if (!res.ok) throw new Error(data.message || "Gagal membatalkan.");
        return data;
      });
    })
    .then(function(){
      closeModal("modal-detail");
      showToast("Peminjaman berhasil dihapus secara permanen.", "success");
      loadAdminBookings();
    })
    .catch(function(err){
      showToast(err.message, "error");
    });
  }

  // Kalender Pemilih Tanggal Admin
  function initAdminCalendarPicker() {
    if (!pickerScheduleDate) return;

    var initialDateStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(now.getDate());
    pickerScheduleDate.value = initialDateStr;

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
      updateAdminMonthView(this.value);
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
        updateAdminMonthView(newDateStr);
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
        updateAdminMonthView(newDateStr);
      });
    }

    if (btnTodayQuick) {
      btnTodayQuick.addEventListener("click", function(){
        var today = new Date();
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
        var todayStr = currentYear + "-" + pad2(currentMonth + 1) + "-" + pad2(today.getDate());
        pickerScheduleDate.value = todayStr;
        updateAdminMonthView(todayStr);
      });
    }
  }

  function updateAdminMonthView(targetDateStr) {
    if (labelActiveMonth) {
      labelActiveMonth.textContent = "Bulan " + MONTH_NAMES[currentMonth] + " " + currentYear;
    }
    renderAdminMatrixTable();

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

  // Ekspor Spreadsheet format resmi dinas (Lengkap)
  if (btnExportSpreadsheet) {
    btnExportSpreadsheet.addEventListener("click", function(){
      exportSpreadsheet(true, currentYear, currentMonth, bookingsData);
    });
  }

  if (btnPrintSchedule) {
    btnPrintSchedule.addEventListener("click", function(){
      window.print();
    });
  }

  // Ubah PIN Admin
  var formChangePin = document.getElementById("form-change-pin");
  if (formChangePin) {
    formChangePin.addEventListener("submit", function(e){
      e.preventDefault();
      var currentPin = document.getElementById("pin-current").value;
      var newPin = document.getElementById("pin-new").value;

      fetch("/api/admin/change-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({ oldPin: currentPin, newPin: newPin })
      })
      .then(function(res){
        return res.json().then(function(data){
          if (!res.ok) throw new Error(data.message || "Gagal mengubah PIN.");
          return data;
        });
      })
      .then(function(){
        closeModal("modal-change-pin");
        formChangePin.reset();
        showToast("PIN Admin berhasil diubah!", "success");
      })
      .catch(function(err){
        showToast(err.message, "error");
      });
    });
  }

  // Handle Fitur "Pembatalan oleh Staf" (Hapus Permintaan / Jadwal Staf)
  var btnCancelStaffModal = document.getElementById("btn-cancel-staff-modal");
  var selectCancelBooking = document.getElementById("cancel-select-booking");
  var formCancelStaff = document.getElementById("form-cancel-staff");

  if (btnCancelStaffModal && selectCancelBooking) {
    btnCancelStaffModal.addEventListener("click", function(){
      selectCancelBooking.innerHTML = "<option value=''>-- Pilih Jadwal yang Akan Dibatalkan --</option>";
      var activeBookings = bookingsData.filter(function(b){
        return b && (b.status === "aktif" || b.status === "menunggu");
      });

      if (activeBookings.length === 0) {
        showToast("Tidak ada jadwal peminjaman staf yang sedang aktif atau menunggu persetujuan.", "info");
        return;
      }

      activeBookings.forEach(function(b){
        var opt = document.createElement("option");
        opt.value = b.id;
        var roomLabel = ROOM_NAMES[b.roomId] || b.roomName || b.roomId;
        var statusLabel = b.status === "menunggu" ? "[MENUNGGU] " : "";
        opt.textContent = statusLabel + "[" + b.date + " - " + (b.session||"").toUpperCase() + "] " + roomLabel + " — " + b.requesterName + " (" + b.unit + ") - " + (b.purpose || "");
        selectCancelBooking.appendChild(opt);
      });

      openModal("modal-cancel-staff");
    });
  }

  if (formCancelStaff && selectCancelBooking) {
    formCancelStaff.addEventListener("submit", function(e){
      e.preventDefault();
      var bId = selectCancelBooking.value;
      if (!bId) {
        showToast("Silakan pilih jadwal yang akan dibatalkan.", "error");
        return;
      }

      if (!confirm("Apakah Anda yakin ingin membatalkan dan menghapus jadwal peminjaman staf ini?\n\nSetelah dihapus, data peminjaman tidak akan dimunculkan lagi dan ruangan kembali berstatus Tersedia.")) {
        return;
      }

      var reason = document.getElementById("cancel-staff-reason") ? document.getElementById("cancel-staff-reason").value.trim() : "";

      fetch("/api/admin/bookings/" + encodeURIComponent(bId) + "/cancel-by-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({ reason: reason })
      })
      .then(function(res){
        return res.json().then(function(data){
          if (!res.ok) throw new Error(data.message || "Gagal membatalkan peminjaman.");
          return data;
        });
      })
      .then(function(){
        closeModal("modal-cancel-staff");
        formCancelStaff.reset();
        showToast("Peminjaman staf berhasil dibatalkan dan dihapus secara permanen.", "success");
        loadAdminBookings();
      })
      .catch(function(err){
        showToast(err.message, "error");
      });
    });
  }

  // Inisialisasi awal
  initAdminCalendarPicker();
  checkAuthUI();

})();
