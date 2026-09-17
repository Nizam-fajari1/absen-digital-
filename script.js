/* =========================================================
   SMK Plus Pelita Nusantara — Sistem Absensi Siswa
   Vanilla JS — single page app dengan toggle view.
   ========================================================= */

(function () {
  'use strict';

  console.log('[Absensi] Memuat script.js...');

  /* ---------- DATA SISWA (untuk login simulasi) ---------- */
  var DUMMY_STUDENT = {
    nis:      '2024001',
    email:    'andini@smkpn.sch.id',
    password: 'pelita123',
    name:     'Andini Pratiwi',
    class:    'XII RPL 1'
  };

  /* ---------- DATA REKAP ABSENSI (dummy awal 7 siswa) ---------- */
  var attendanceData = [
    { name: 'Budi Santoso',    nis: '2024002', class: 'XII RPL 1', time: '07:15', status: 'Tepat Waktu' },
    { name: 'Citra Lestari',  nis: '2024003', class: 'XII RPL 1', time: '07:22', status: 'Tepat Waktu' },
    { name: 'Dimas Prasetyo', nis: '2024004', class: 'XII RPL 2', time: '07:35', status: 'Terlambat'   },
    { name: 'Eka Wijayanti',  nis: '2024005', class: 'XII TKJ 1', time: '07:10', status: 'Tepat Waktu' },
    { name: 'Fajar Nugroho',  nis: '2024006', class: 'XII TKJ 1', time: '07:28', status: 'Tepat Waktu' },
    { name: 'Gita Maharani',  nis: '2024007', class: 'XI RPL 1',  time: '07:40', status: 'Terlambat'   },
    { name: 'Hadi Kurniawan', nis: '2024008', class: 'XI TKJ 2',  time: '07:18', status: 'Tepat Waktu' }
  ];

  /* Palet warna avatar (lembut) */
  var AVATAR_PALETTE = [
    { bg: '#dbeafe', fg: '#2563eb' },
    { bg: '#dcfce7', fg: '#16a34a' },
    { bg: '#fef3c7', fg: '#b45309' },
    { bg: '#ccfbf1', fg: '#0d9488' },
    { bg: '#e2e8f0', fg: '#475569' }
  ];

  /* ---------- REFERENSI ELEMEN DOM ---------- */
  var views = {
    login:   document.getElementById('view-login'),
    scan:    document.getElementById('view-scan'),
    success: document.getElementById('view-success'),
    recap:   document.getElementById('view-recap')
  };

  var el = {
    // Login
    loginForm:      document.getElementById('login-form'),
    nisInput:       document.getElementById('nis'),
    passwordInput:  document.getElementById('password'),
    btnLogin:       document.getElementById('btn-login'),
    btnAutofill:    document.getElementById('btn-autofill'),
    linkSkipLogin:  document.getElementById('link-skip-login'),

    // Scan
    camera:          document.getElementById('camera'),
    scanFrame:       document.getElementById('scan-frame'),
    scanPlaceholder: document.getElementById('scan-placeholder'),
    scanLine:        document.getElementById('scan-line'),
    scanOverlay:     document.getElementById('scan-overlay'),
    scanOverlayText: document.getElementById('scan-overlay-text'),
    btnScan:         document.getElementById('btn-scan'),
    btnBack:         document.getElementById('btn-back'),

    // Success
    resName:   document.getElementById('res-name'),
    resClass:  document.getElementById('res-class'),
    resStatus: document.getElementById('res-status'),
    resTime:   document.getElementById('res-time'),
    btnDone:   document.getElementById('btn-done'),

    // Recap
    recapDate:       document.getElementById('recap-date'),
    statTotal:       document.getElementById('stat-total'),
    statOnTime:      document.getElementById('stat-on-time'),
    statLate:        document.getElementById('stat-late'),
    searchInput:     document.getElementById('search-input'),
    classFilter:     document.getElementById('class-filter'),
    tbody:           document.getElementById('attendance-tbody'),
    btnRecapRefresh: document.getElementById('btn-recap-refresh'),

    // Nav tabs
    navTabs: document.querySelectorAll('.nav-tab'),

    // Header clock & toast
    headerTime: document.getElementById('header-time'),
    toast:      document.getElementById('toast')
  };

  var cameraStream = null;
  var isScanning   = false;

  /* ---------- UTILITY: GANTI VIEW ---------- */
  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].classList.toggle('active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- UTILITY: TOAST ---------- */
  var toastTimer = null;
  function showToast(message, duration) {
    duration = duration || 2400;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('show');
    }, duration);
  }

  /* ---------- UTILITY: ESCAPE HTML ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ---------- HEADER CLOCK ---------- */
  function startHeaderClock() {
    function tick() {
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      el.headerTime.textContent = hh + ':' + mm;
    }
    tick();
    setInterval(tick, 1000 * 30);
  }

  /* ---------- NAV TABS ---------- */
  function setupNavTabs() {
    el.navTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.view;
        el.navTabs.forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });

        if (target === 'absen') {
          stopCamera();
          el.loginForm.reset();
          showView('login');
        } else if (target === 'recap') {
          stopCamera();
          renderAttendance();
          updateRecapDate();
          showView('recap');
        }
      });
    });
  }

  /* ---------- AVATAR COLOR ---------- */
  function getAvatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash |= 0;
    }
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  }

  /* ---------- RENDER TABEL REKAP ---------- */
  function renderAttendance() {
    var tbody = el.tbody;
    var searchTerm = el.searchInput.value.trim().toLowerCase();
    var classFilter = el.classFilter.value;

    var filtered = attendanceData.filter(function (item) {
      var matchesSearch = !searchTerm ||
        item.name.toLowerCase().indexOf(searchTerm) !== -1 ||
        item.nis.toLowerCase().indexOf(searchTerm) !== -1;
      var matchesClass = !classFilter || item.class === classFilter;
      return matchesSearch && matchesClass;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty-state">' +
        'Tidak ada data yang cocok dengan pencarian.</td></tr>';
    } else {
      filtered.forEach(function (item, idx) {
        var avatar = getAvatarColor(item.name);
        var badgeClass =
          item.status === 'Tepat Waktu' ? 'badge-success' : 'badge-warning';

        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="td-no">' + (idx + 1) + '</td>' +
          '<td><span class="avatar" style="background:' + avatar.bg +
          ';color:' + avatar.fg + '">' +
          escapeHtml(item.name.charAt(0).toUpperCase()) +
          '</span></td>' +
          '<td class="cell-name">' + escapeHtml(item.name) + '</td>' +
          '<td class="cell-nis">' + escapeHtml(item.nis) + '</td>' +
          '<td>' + escapeHtml(item.class) + '</td>' +
          '<td class="cell-time">' + escapeHtml(item.time) + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' +
          escapeHtml(item.status) + '</span></td>';
        tbody.appendChild(tr);
      });
    }

    updateStats();
  }

  /* ---------- UPDATE STAT CARDS ---------- */
  function updateStats() {
    var total  = attendanceData.length;
    var onTime = 0;
    var late   = 0;
    attendanceData.forEach(function (a) {
      if (a.status === 'Tepat Waktu') onTime++;
      else if (a.status === 'Terlambat') late++;
    });
    el.statTotal.textContent  = total;
    el.statOnTime.textContent = onTime;
    el.statLate.textContent   = late;
  }

  /* ---------- POPULATE CLASS FILTER ---------- */
  function populateClassFilter() {
    var classSet = {};
    attendanceData.forEach(function (a) {
      classSet[a.class] = true;
    });
    var classes = Object.keys(classSet).sort();

    el.classFilter.innerHTML = '<option value="">Semua Kelas</option>';
    classes.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      el.classFilter.appendChild(opt);
    });
  }

  /* ---------- UPDATE TANGGAL REKAP ---------- */
  function updateRecapDate() {
    var now = new Date();
    var days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
    el.recapDate.textContent =
      days[now.getDay()] + ', ' + now.getDate() + ' ' +
      months[now.getMonth()] + ' ' + now.getFullYear();
  }

  /* ---------- LOGIKA LOGIN ---------- */
  function handleLogin(e) {
    e.preventDefault();
    console.log('[Login] Form submit diterima');

    var nis = el.nisInput.value.trim().toLowerCase();
    var pwd = el.passwordInput.value;
    console.log('[Login] NIS input:', nis, '| password length:', pwd.length);

    if (!nis || !pwd) {
      showToast('NIS/Email dan password wajib diisi.');
      return;
    }

    el.btnLogin.disabled = true;
    el.btnLogin.textContent = 'Memproses…';

    setTimeout(function () {
      var matchNis = (nis === DUMMY_STUDENT.nis || nis === DUMMY_STUDENT.email);
      var matchPwd = (pwd === DUMMY_STUDENT.password);
      console.log('[Login] matchNis:', matchNis, '| matchPwd:', matchPwd);

      if (matchNis && matchPwd) {
        showToast('Login berhasil. Selamat datang, ' +
                  DUMMY_STUDENT.name.split(' ')[0] + '.');
        el.loginForm.reset();
        el.btnLogin.disabled = false;
        el.btnLogin.textContent = 'Masuk';
        showView('scan');
        startCamera();
      } else {
        el.btnLogin.disabled = false;
        el.btnLogin.textContent = 'Masuk';
        showToast('NIS/Email atau password salah. Gunakan 2024001 / pelita123');
      }
    }, 700);
  }

  /* ---------- KAMERA ---------- */
   /* ---------- KAMERA (dengan fallback simulasi) ---------- */
  function startCamera() {
    // Cek dukungan API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Camera] Browser tidak mendukung getUserMedia');
      enableSimulationMode('Kamera tidak didukung browser');
      return;
    }

    // Coba akses kamera
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    }).then((stream) => {
      // Kamera berhasil — tampilkan video asli
      cameraStream = stream;
      el.camera.srcObject = stream;
      el.scanPlaceholder.style.display = 'none';
      console.log('[Camera] Kamera aktif ✓');
    }).catch((err) => {
      // Kamera gagal — aktifkan mode simulasi
      console.warn('[Camera] Gagal akses kamera:', err.name, err.message);
      let reason = 'Kamera tidak tersedia';
      if (err.name === 'NotAllowedError') {
        reason = 'Izin kamera ditolak';
      } else if (err.name === 'NotFoundError') {
        reason = 'Tidak ada kamera terdeteksi';
      } else if (location.protocol === 'file:') {
        reason = 'Buka via localhost (bukan file://)';
      }
      enableSimulationMode(reason);
    });
  }

  /* Aktifkan mode simulasi: tampilkan placeholder + animasi scan */
  function enableSimulationMode(reason) {
    el.camera.style.display = 'none';
    el.scanPlaceholder.style.display = 'flex';
    el.scanFrame.classList.add('simulating');

    // Update teks status
    var statusEl = document.getElementById('camera-status');
    if (statusEl) statusEl.textContent = reason;

    // Tambah badge "Mode Simulasi" kalau belum ada
    if (!el.scanFrame.querySelector('.sim-badge')) {
      var badge = document.createElement('span');
      badge.className = 'sim-badge';
      badge.textContent = 'MODE SIMULASI';
      el.scanFrame.appendChild(badge);
    }

    console.log('[Camera] Mode simulasi aktif — scan tetap berfungsi');
  }

    function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
      el.camera.srcObject = null;
    }
    // Bersihkan mode simulasi
    el.scanFrame.classList.remove('simulating');
    var badge = el.scanFrame.querySelector('.sim-badge');
    if (badge) badge.remove();
    el.camera.style.display = '';  // reset display
  }

    /* ---------- LOGIKA SCAN MUKA ---------- */
  function handleScan() {
    if (isScanning) return;
    isScanning = true;

    el.scanLine.classList.add('active');
    el.btnScan.disabled = true;
    el.btnScan.textContent = 'Memindai…';
    el.btnBack.disabled = true;

    // Setelah 600ms — tampilkan overlay "mencocokkan wajah"
    const t1 = setTimeout(() => {
      el.scanOverlay.classList.add('show');              // ← GANTI DI SINI
      el.scanOverlayText.textContent = 'Sedang mencocokkan wajah…';
    }, 600);

    // Setelah total 2 detik — selesai, pindah ke halaman sukses
    const t2 = setTimeout(() => {
      clearTimeout(t1);
      el.scanLine.classList.remove('active');
      el.scanOverlay.classList.remove('show');           // ← GANTI DI SINI
      stopCamera();

      const now = new Date();
      const timeStr =
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');

      const cutoff = new Date(now);
      cutoff.setHours(7, 30, 0, 0);
      const status = (now <= cutoff) ? 'Tepat Waktu' : 'Terlambat';

      addAttendanceRecord({
        name:   DUMMY_STUDENT.name,
        nis:    DUMMY_STUDENT.nis,
        class:  DUMMY_STUDENT.class,
        time:   timeStr,
        status: status
      });

      el.resName.textContent   = DUMMY_STUDENT.name;
      el.resClass.textContent  = DUMMY_STUDENT.class;
      el.resStatus.textContent = 'Hadir / ' + status;
      el.resTime.textContent   = formatDateTime(now);

      el.btnScan.disabled = false;
      el.btnScan.textContent = 'Ambil Foto / Scan Muka';
      el.btnBack.disabled = false;
      isScanning = false;

      showView('success');
    }, 2000);
  }

  /* ---------- TAMBAH RECORD KE REKAP ---------- */
  function addAttendanceRecord(record) {
    var existingIdx = -1;
    for (var i = 0; i < attendanceData.length; i++) {
      if (attendanceData[i].nis === record.nis) {
        existingIdx = i;
        break;
      }
    }
    if (existingIdx >= 0) {
      attendanceData[existingIdx] =
        Object.assign({}, attendanceData[existingIdx], record);
    } else {
      attendanceData.push(record);
    }
    populateClassFilter();
    if (views.recap.classList.contains('active')) {
      renderAttendance();
    }
  }

  /* ---------- FORMAT TANGGAL & WAKTU ---------- */
  function formatDateTime(date) {
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    var days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
    return hh + ':' + mm + ' - ' + days[date.getDay()] + ', ' +
           date.getDate() + ' ' + months[date.getMonth()] + ' ' +
           date.getFullYear();
  }

  /* ---------- TOMBOL KEMBALI & SELESAI ---------- */
  function handleBack() {
    stopCamera();
    showView('login');
  }

  function handleDone() {
    showView('login');
    showToast('Absensi telah disimpan ke daftar rekap.');
  }

  /* ---------- INIT ---------- */
  function init() {
    console.log('[Absensi] Init dimulai...');

    // Pengecekan elemen penting — kalau ada yang null, tampilkan di console
    var checks = [
      ['loginForm',      el.loginForm,      '#login-form'],
      ['nisInput',       el.nisInput,       '#nis'],
      ['passwordInput', el.passwordInput,  '#password'],
      ['btnLogin',       el.btnLogin,       '#btn-login'],
      ['btnScan',        el.btnScan,        '#btn-scan'],
      ['btnBack',        el.btnBack,        '#btn-back'],
      ['btnDone',        el.btnDone,        '#btn-done'],
      ['tbody',          el.tbody,         '#attendance-tbody'],
      ['searchInput',    el.searchInput,    '#search-input'],
      ['classFilter',    el.classFilter,    '#class-filter'],
      ['scanLine',       el.scanLine,       '#scan-line'],
      ['scanOverlay',    el.scanOverlay,    '#scan-overlay'],
      ['views.login',    views.login,       '#view-login'],
      ['views.scan',     views.scan,        '#view-scan'],
      ['views.success',  views.success,     '#view-success'],
      ['views.recap',    views.recap,       '#view-recap']
    ];

    var allOk = true;
    checks.forEach(function (c) {
      if (!c[1]) {
        console.error('❌ Elemen tidak ditemukan:', c[2], '(variabel: el.' + c[0] + ')');
        allOk = false;
      }
    });

    if (!allOk) {
      console.error('🚨 Ada elemen DOM yang tidak ditemukan! Cek apakah HTML sudah benar.');
      return; // Hentikan init jika ada elemen hilang
    }

    console.log('[Absensi] Semua elemen ditemukan ✓');

    startHeaderClock();
    setupNavTabs();
    updateRecapDate();
    populateClassFilter();
    renderAttendance();

    // Event listeners utama
    el.loginForm.addEventListener('submit', handleLogin);
    el.btnScan.addEventListener('click', handleScan);
    el.btnBack.addEventListener('click', handleBack);
    el.btnDone.addEventListener('click', handleDone);

    el.btnRecapRefresh.addEventListener('click', function () {
      renderAttendance();
      updateRecapDate();
      showToast('Data rekap dimuat ulang.');
    });

    el.searchInput.addEventListener('input', renderAttendance);
    el.classFilter.addEventListener('change', renderAttendance);

    // Tombol "Isi Otomatis" (opsional — hanya jika elemen ada)
    if (el.btnAutofill) {
      el.btnAutofill.addEventListener('click', function () {
        el.nisInput.value = '2024001';
        el.passwordInput.value = 'pelita123';
        showToast('Kredensial demo terisi. Klik "Masuk" untuk lanjut.');
      });
    }

    // Link "Lewati ke Scan" (opsional — hanya jika elemen ada)
    if (el.linkSkipLogin) {
      el.linkSkipLogin.addEventListener('click', function (e) {
        e.preventDefault();
        showView('scan');
        startCamera();
        showToast('Mode demo: langsung ke scan wajah.');
      });
    }

    console.log('[Absensi] Init selesai ✓ — siap digunakan');
  }

  // Jalankan setelah DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();