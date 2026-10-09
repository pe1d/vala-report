// Gói kịch bản "QLVB Thử nghiệm" (hệ thống ASP.NET WebForms giả lập, T07). Bản MẪU: bản chạy thật lưu trong CSDL
// (Quản trị → Kịch bản Desktop, mã qlvb_thu) — nạp bằng `node tools/qlvb-webforms/nap-vao-vala.mjs`.
// Áp dụng cho trang: http://localhost:4030/*
//
// Gửi form trực tiếp bằng vala.webform (docs/tich-hop-aspnet.md): không bấm trên giao diện, không đổi trang đang xem ⇒ chạy
// được cả trong Vala Desktop lẫn trên máy chủ (runner). Chọn phần tử theo ĐUÔI id ([id$="_lblTong"]) để chạy được cả id
// kiểu Mono / ASP.NET cũ (ctl00_MainContent_…) lẫn ASP.NET 4 (MainContent_…). Thao tác ghi đọc lại để xác nhận, không tự
// thử lại (tránh chuyển / phát hành hai lần).

const id$ = (ten) => `[id$="_${ten}"]`;
const loi = (msg) => { const e = new Error(msg); e.code = 'nghiep_vu'; return e; };

/** Câu lỗi nghiệp vụ trang hiện (nhãn lblLoi) ⇒ ném. */
function kiemLoi(f) {
  const t = f.read(id$('lblLoi'));
  if (t) throw loi(t);
}

/** Lựa chọn khớp mã hoặc tên (không phân biệt hoa thường) — trả mã; không có ⇒ lỗi kèm danh sách hợp lệ. */
function chon(options, giaTri, ten) {
  const v = String(giaTri ?? '').trim().toLowerCase();
  const o = options.find((x) => x.value.toLowerCase() === v) || options.find((x) => x.text.toLowerCase() === v);
  if (!o || o.value === '') throw loi(`${ten} "${giaTri}" không có. Chọn một trong: ${options.filter((x) => x.value !== '').map((x) => x.text).join(', ')}`);
  return o.value;
}

// Giám sát (docs/van-ban-chung.md): trang danh sách phải có các ô phiên dịch dùng; dấu vân tay = tên các trường của form
// (WebForms không có số phiên bản — đổi trường là đổi giao diện).
vala.phu_thuoc({
  khi: () => /\/VanBan\.aspx$/i.test(location.pathname),
  chon: [id$('gvVanBan'), id$('ddlTrangThai'), id$('txtTuKhoa'), id$('btnTim'), id$('lblTong')],
  phien_ban: () => [...(document.forms[0]?.elements ?? [])].map((e) => e.name).filter((n) => n && !n.startsWith('__')).sort().join(' '),
});

const COT = { 'Mã': 'id', 'Số ký hiệu': 'so_ky_hieu', 'Trích yếu': 'trich_yeu', 'Loại': 'loai', 'Trạng thái': 'trang_thai', 'Ngày tạo': 'ngay_tao', 'Người đang xử lý': 'nguoi_xu_ly' };
const dong = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [COT[k] ?? k, k === 'Mã' ? Number(v) : v]));

function chiTiet(f) {
  kiemLoi(f);
  return {
    id: Number(f.read(id$('lblMa'))),
    so_ky_hieu: f.read(id$('lblSoKyHieu')),
    trich_yeu: f.read(id$('lblTrichYeu')),
    loai: f.read(id$('lblLoai')),
    trang_thai: f.read(id$('lblTrangThai')),
    han_xu_ly: f.read(id$('lblHan')),
    noi_dung: f.read(id$('lblNoiDung')),
    tep: f.read(id$('lblTep')),
    lich_su: f.table(id$('gvLichSu')).map((r) => ({ thoi_gian: r['Thời gian'], nguoi_xu_ly: r['Người xử lý'], hanh_dong: r['Hành động'], noi_dung: r['Nội dung'] })),
  };
}

const tepDinhKem = (tep) => (tep && tep.length ? { files: { fuDinhKem: { ten: tep[0].ten, loai: tep[0].loai, base64: tep[0].base64 } } } : {});

async function layDanhMuc() {
  const dt = await vala.webform('/DuThao.aspx');
  const loai_van_ban = dt.options('ddlLoai').filter((o) => o.value).map((o) => ({ ma: o.value, ten: o.text }));
  // Đơn vị / người nhận lấy từ màn hình Chuyển của một văn bản còn chuyển được (người nhận chỉ hiện sau khi chọn đơn vị).
  const ds = await vala.webform('/VanBan.aspx');
  await ds.postback('ddlTrangThai', { ddlTrangThai: 'Dự thảo' });
  const mau = ds.table(id$('gvVanBan'))[0];
  const don_vi = [];
  if (mau) {
    const ch = await vala.webform(`/Chuyen.aspx?id=${mau['Mã']}`);
    for (const dv of ch.options('ddlDonVi').filter((o) => o.value)) {
      await ch.postback('ddlDonVi', { ddlDonVi: dv.value });
      don_vi.push({ ma: dv.value, ten: dv.text, nguoi_nhan: ch.options('cblNguoiNhan').map((o) => ({ ma: o.value, ten: o.text })) });
    }
  }
  // Sổ văn bản chỉ văn thư xem được (màn hình Phát hành).
  let so_van_ban = [];
  if (mau) {
    const ph = await vala.webform(`/PhatHanh.aspx?id=${mau['Mã']}`);
    if (!ph.read(id$('lblLoi'))) so_van_ban = ph.options('ddlSo').filter((o) => o.value).map((o) => ({ ma: o.value, ten: o.text }));
  }
  return { loai_van_ban, don_vi, so_van_ban };
}
vala.action('lay_danh_muc', { mo_ta: 'Danh mục để chọn khi tạo / chuyển / phát hành: loại văn bản, đơn vị và người nhận, sổ văn bản' }, layDanhMuc);

async function layDanhSach({ trang = 1, tu_khoa = '', trang_thai = '' }) {
  const f = await vala.webform('/VanBan.aspx');
  if (trang_thai) await f.postback('ddlTrangThai', { ddlTrangThai: chon(f.options('ddlTrangThai'), trang_thai, 'Trạng thái') });
  if (tu_khoa) await f.submit('btnTim', { txtTuKhoa: tu_khoa });
  const tong = Number((f.read(id$('lblTong')).match(/\d+/) || ['0'])[0]);
  const so_trang = Math.max(1, Math.ceil(tong / 10));
  if (trang > 1) {
    if (trang > so_trang) return { trang, so_trang, tong, van_ban: [] };
    await f.postback('gvVanBan', { __EVENTARGUMENT: `Page$${trang}` });
  }
  return { trang, so_trang, tong, van_ban: f.table(id$('gvVanBan')).map(dong) };
}
vala.action('lay_danh_sach_van_ban', {
  mo_ta: 'Danh sách văn bản (10 văn bản / trang, mới nhất trước)',
  params: { trang: 'số trang (mặc định 1)', tu_khoa: 'tìm theo số ký hiệu / trích yếu', trang_thai: 'Dự thảo | Đang xử lý | Đã kết thúc | Đã phát hành' },
}, layDanhSach);

vala.action('lay_chi_tiet_van_ban', { mo_ta: 'Thông tin và lịch sử xử lý của một văn bản', params: { id: 'mã văn bản' } }, async ({ id }) => {
  return chiTiet(await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`));
});

async function taoDuThao({ loai_van_ban, trich_yeu, noi_dung = '', tep }) {
  const f = await vala.webform('/DuThao.aspx');
  await f.submit('btnLuu', { ddlLoai: chon(f.options('ddlLoai'), loai_van_ban, 'Loại văn bản'), txtTrichYeu: trich_yeu ?? '', txtNoiDung: noi_dung }, tepDinhKem(tep));
  const id = Number(new URL(f.url).searchParams.get('id'));
  const ct = chiTiet(f);
  if (!id || ct.trang_thai !== 'Dự thảo' || ct.trich_yeu !== String(trich_yeu).trim()) throw loi('Không xác nhận được dự thảo vừa tạo');
  return { id, ...ct };
}
vala.action('tao_du_thao', {
  mo_ta: 'Tạo dự thảo văn bản',
  params: { loai_van_ban: 'mã hoặc tên loại', trich_yeu: 'bắt buộc', noi_dung: '', tep: '[{ ten, loai, base64 }] — tối đa 1 tệp' },
}, taoDuThao);

async function chuyen({ id, don_vi, nguoi_nhan = [], y_kien = '', han_xu_ly = '', tep }) {
  const f = await vala.webform(`/Chuyen.aspx?id=${Number(id)}`);
  kiemLoi(f);
  // WebForms: phải gửi lại "chọn đơn vị" trước — danh sách người nhận (và EventValidation) mới có người của đơn vị đó.
  await f.postback('ddlDonVi', { ddlDonVi: chon(f.options('ddlDonVi'), don_vi, 'Đơn vị') });
  const ds = f.options('cblNguoiNhan');
  const nhan = [].concat(nguoi_nhan).map((n) => chon(ds, n, 'Người nhận'));
  const truoc = (await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`)).table(id$('gvLichSu')).length;
  await f.submit('btnChuyen', { cblNguoiNhan: nhan, txtYKien: y_kien, txtHanXuLy: han_xu_ly }, tepDinhKem(tep));
  const ct = chiTiet(f);
  const moi = ct.lich_su[ct.lich_su.length - 1];
  if (ct.lich_su.length !== truoc + 1 || !moi || moi.hanh_dong !== 'Chuyển xử lý') throw loi('Không xác nhận được văn bản đã chuyển');
  return { id: ct.id, trang_thai: ct.trang_thai, han_xu_ly: ct.han_xu_ly, lich_su_moi: moi };
}
vala.action('chuyen_van_ban', {
  mo_ta: 'Chuyển văn bản cho người xử lý',
  params: { id: 'mã văn bản', don_vi: 'mã hoặc tên đơn vị', nguoi_nhan: '[mã hoặc tên]', y_kien: '', han_xu_ly: 'dd/MM/yyyy', tep: '[{ ten, loai, base64 }]' },
}, chuyen);

async function ketThuc({ id, y_kien = '' }) {
  const f = await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`);
  kiemLoi(f);
  if (!f.$(id$('lnkKetThuc'))) throw loi(`Văn bản ${f.read(id$('lblTrangThai')).toLowerCase()}, không kết thúc được`);
  await f.postback('lnkKetThuc', { txtYKienKetThuc: y_kien });
  const ct = chiTiet(f);
  if (ct.trang_thai !== 'Đã kết thúc') throw loi('Không xác nhận được văn bản đã kết thúc');
  return { id: ct.id, trang_thai: ct.trang_thai };
}
vala.action('ket_thuc_van_ban', { mo_ta: 'Kết thúc xử lý văn bản (văn bản đang xử lý)', params: { id: 'mã văn bản', y_kien: '' } }, ketThuc);

async function phatHanh({ id, so_van_ban, don_vi_nhan = [] }) {
  const f = await vala.webform(`/PhatHanh.aspx?id=${Number(id)}`);
  kiemLoi(f);
  // Sổ nằm trong UpdatePanel: chọn sổ ⇒ máy chủ điền số dự kiến (gửi một phần trang).
  await f.postback('ddlSo', { ddlSo: chon(f.options('ddlSo'), so_van_ban, 'Sổ văn bản') }, { async: true });
  const du_kien = f.$(id$('txtSoKyHieu')).getAttribute('value') || '';
  const nhan = [].concat(don_vi_nhan).map((d) => chon(f.options('cblDonViNhan'), d, 'Đơn vị nhận'));
  await f.submit('btnPhatHanh', { cblDonViNhan: nhan });
  const ct = chiTiet(f);
  if (ct.trang_thai !== 'Đã phát hành' || !ct.so_ky_hieu) throw loi('Không xác nhận được văn bản đã phát hành');
  return { id: ct.id, so_ky_hieu: ct.so_ky_hieu, so_du_kien: du_kien };
}
vala.action('phat_hanh_van_ban', {
  mo_ta: 'Phát hành văn bản (chỉ văn thư): vào sổ, cấp số ký hiệu',
  params: { id: 'mã văn bản', so_van_ban: 'mã hoặc tên sổ', don_vi_nhan: '[mã hoặc tên đơn vị]' },
}, phatHanh);

// ---- Phiên dịch cho giao diện Văn bản chung của Vala Desktop (docs/van-ban-chung.md): các thao tác vb_* ----

/** "dd/MM/yyyy[ HH:mm]" ⇒ "yyyy-MM-dd[ HH:mm]"; không khớp ⇒ giữ nguyên. */
const ngayISO = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}${m[4] ? ` ${m[4].padStart(5, '0')}` : ''}` : String(s || '');
};
/** "yyyy-MM-dd" (ô ngày của giao diện) ⇒ "dd/MM/yyyy" (hệ thống nhận). */
const ngayVN = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || ''); };

const HOP = [
  { ma: 'tat_ca', ten: 'Tất cả', loai: 'khac', trang_thai: '' },
  { ma: 'du_thao', ten: 'Dự thảo', loai: 'di', trang_thai: 'Dự thảo' },
  { ma: 'dang_xu_ly', ten: 'Đang xử lý', loai: 'den', trang_thai: 'Đang xử lý' },
  { ma: 'da_ket_thuc', ten: 'Đã kết thúc', loai: 'khac', trang_thai: 'Đã kết thúc' },
  { ma: 'da_phat_hanh', ten: 'Đã phát hành', loai: 'di', trang_thai: 'Đã phát hành' },
];

vala.action('vb_thong_tin', { mo_ta: 'Giao diện Văn bản: tên hệ thống, menu, loại văn bản tạo được' }, async () => ({
  he_thong: 'QLVB Thử nghiệm',
  menu: [{ ten: 'Văn bản', muc: HOP.map(({ ma, ten, loai }) => ({ ma, ten, loai })) }],
  tao: [{ ma: 'du_thao', ten: 'Dự thảo văn bản' }],
}));

vala.action('vb_dem', { mo_ta: 'Giao diện Văn bản: số văn bản mỗi hộp' }, async () => {
  const out = {};
  for (const h of HOP) out[h.ma] = { tong: (await layDanhSach({ trang_thai: h.trang_thai })).tong };
  return out;
});

vala.action('vb_mau_tao', { mo_ta: 'Giao diện Văn bản: form tạo một loại văn bản' }, async ({ loai }) => {
  if (loai !== 'du_thao') throw loi(`Không tạo được loại ${loai}`);
  const f = await vala.webform('/DuThao.aspx');
  return {
    ten: 'Dự thảo văn bản',
    truong: [
      { ma: 'loai_van_ban', ten: 'Loại văn bản', loai: 'chon', bat_buoc: true, lua_chon: f.options('ddlLoai').filter((o) => o.value).map((o) => ({ ma: o.value, ten: o.text })) },
      { ma: 'trich_yeu', ten: 'Trích yếu', loai: 'doan', bat_buoc: true, goi_y: 'V/v …' },
      { ma: 'noi_dung', ten: 'Nội dung', loai: 'doan' },
      { ma: 'tep', ten: 'Tệp đính kèm', loai: 'tep' },
    ],
  };
});

vala.action('vb_tao', { mo_ta: 'Giao diện Văn bản: tạo văn bản (dự thảo) trên hệ thống' }, async ({ loai, loai_van_ban, trich_yeu, noi_dung = '', tep = [] }) => {
  if (loai !== 'du_thao') throw loi(`Không tạo được loại ${loai}`);
  const r = await taoDuThao({ loai_van_ban, trich_yeu, noi_dung, tep: tep.length ? tep : undefined });
  return { id: String(r.id), thong_bao: 'Đã tạo dự thảo' };
});

vala.action('vb_danh_sach', { mo_ta: 'Giao diện Văn bản: danh sách một hộp (10 dòng / trang)' }, async ({ hop = 'tat_ca', trang = 1, tim = '' }) => {
  const h = HOP.find((x) => x.ma === hop) || HOP[0];
  const r = await layDanhSach({ trang: Number(trang) || 1, tu_khoa: tim, trang_thai: h.trang_thai });
  return {
    tong: r.tong, so_trang: r.so_trang,
    dong: r.van_ban.map((v) => ({ id: String(v.id), so_ky_hieu: v.so_ky_hieu, trich_yeu: v.trich_yeu, ngay: ngayISO(v.ngay_tao), trang_thai: v.trang_thai, nguoi_xu_ly: v.nguoi_xu_ly, loai: v.loai })),
  };
});

vala.action('vb_chi_tiet', { mo_ta: 'Giao diện Văn bản: chi tiết, quá trình xử lý và thao tác làm được' }, async ({ id }) => {
  const ct = chiTiet(await vala.webform(`/ChiTiet.aspx?id=${Number(id)}`));
  const thao_tac = [];
  if (ct.trang_thai === 'Dự thảo' || ct.trang_thai === 'Đang xử lý') {
    const dm = await layDanhMuc();
    thao_tac.push({
      ma: 'chuyen', ten: 'Chuyển xử lý', truong: [
        { ma: 'nguoi_nhan', ten: 'Người nhận', loai: 'chon', bat_buoc: true, nhieu: true,
          lua_chon: dm.don_vi.flatMap((dv) => dv.nguoi_nhan.map((n) => ({ ma: `${dv.ma}|${n.ma}`, ten: `${n.ten} — ${dv.ten}` }))) },
        { ma: 'han_xu_ly', ten: 'Hạn xử lý', loai: 'ngay' },
        { ma: 'y_kien', ten: 'Ý kiến', loai: 'doan' },
      ],
    });
    const ph = await vala.webform(`/PhatHanh.aspx?id=${Number(id)}`);
    if (!ph.read(id$('lblLoi')) && dm.so_van_ban.length) {
      thao_tac.push({
        ma: 'phat_hanh', ten: 'Phát hành', xac_nhan: 'Phát hành văn bản này? Hệ thống sẽ cấp số và gửi đơn vị nhận.', truong: [
          { ma: 'so_van_ban', ten: 'Sổ văn bản', loai: 'chon', bat_buoc: true, lua_chon: dm.so_van_ban },
          { ma: 'don_vi_nhan', ten: 'Đơn vị nhận', loai: 'chon', nhieu: true, lua_chon: dm.don_vi.map((d) => ({ ma: d.ma, ten: d.ten })) },
        ],
      });
    }
  }
  if (ct.trang_thai === 'Đang xử lý') {
    thao_tac.push({ ma: 'ket_thuc', ten: 'Kết thúc', xac_nhan: 'Kết thúc xử lý văn bản này?', truong: [{ ma: 'y_kien', ten: 'Ý kiến', loai: 'doan' }] });
  }
  return {
    id: String(ct.id), so_ky_hieu: ct.so_ky_hieu, trich_yeu: ct.trich_yeu, trang_thai: ct.trang_thai, han_xu_ly: ngayISO(ct.han_xu_ly),
    loai: ct.loai, noi_dung: ct.noi_dung,
    // Hệ thống chỉ hiện tên tệp ("a.pdf (123 byte), …"), không cho tải ⇒ tệp không có mã.
    tep: (ct.tep || '').split(/,\s*(?=[^,]+\(\d+ byte\))/).filter(Boolean).map((x) => {
      const m = /^(.*)\s\((\d+) byte\)$/.exec(x.trim());
      return m ? { ten: m[1], kich_thuoc: `${Math.max(1, Math.round(Number(m[2]) / 1024))} KB` } : { ten: x.trim() };
    }),
    qua_trinh: ct.lich_su.map((l) => ({ luc: ngayISO(l.thoi_gian), nguoi: l.nguoi_xu_ly, viec: [l.hanh_dong, l.noi_dung].filter(Boolean).join(': ') })),
    thao_tac,
  };
});

vala.action('vb_thuc_hien', { mo_ta: 'Giao diện Văn bản: thực hiện một thao tác (chuyen | phat_hanh | ket_thuc)' }, async ({ id, thao_tac, ...v }) => {
  if (thao_tac === 'chuyen') {
    const chon = [].concat(v.nguoi_nhan || []).map((x) => String(x).split('|'));
    const dv = [...new Set(chon.map((x) => x[0]))];
    if (dv.length !== 1) throw loi('Chọn người nhận trong cùng một đơn vị');
    await chuyen({ id, don_vi: dv[0], nguoi_nhan: chon.map((x) => x[1]), y_kien: v.y_kien || '', han_xu_ly: ngayVN(v.han_xu_ly) });
    return { thong_bao: 'Đã chuyển văn bản' };
  }
  if (thao_tac === 'phat_hanh') {
    const r = await phatHanh({ id, so_van_ban: v.so_van_ban, don_vi_nhan: [].concat(v.don_vi_nhan || []) });
    return { thong_bao: `Đã phát hành, số ký hiệu ${r.so_ky_hieu}` };
  }
  if (thao_tac === 'ket_thuc') { await ketThuc({ id, y_kien: v.y_kien || '' }); return { thong_bao: 'Đã kết thúc văn bản' }; }
  throw loi(`Không có thao tác ${thao_tac}`);
});

