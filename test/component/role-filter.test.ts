// @vitest-environment node
/**
 * Test Phân quyền dữ liệu và hiển thị chức năng
 *
 * Nhóm quyền 1 – Admin / Sở Xây dựng (agencyId='1') : xem tất cả dự án + toàn bộ menu HỆ THỐNG
 * Nhóm quyền 2 – Chủ đầu tư                          : chỉ thấy dự án mình đang làm CĐT
 * Nhóm quyền 3 – Cơ quan phối hợp                    : chỉ thấy dự án đang ở bước thuộc đơn vị mình
 *
 * Chiến lược: test thuần logic (không render component) vì môi trường vitest pool:forks
 * trên Windows không hỗ trợ chạy jsdom file mới song song với các file e2e đang cache.
 * Logic lọc được tái hiện từ App.tsx (visibleProjects) và Sidebar.tsx (filteredMenuItems).
 */
import { describe, it, expect } from 'vitest';

// =============================================================================
// Dữ liệu fixture
// =============================================================================

const AGENCIES = [
  { id: '1', name: 'Sở Xây dựng' },
  { id: '2', name: 'Sở Quy hoạch Kiến trúc' },
  { id: '3', name: 'Sở NNMT' },
  { id: '6', name: 'UBND cấp xã, phường' },
  { id: '9', name: 'Công an TP (PCCC)' },
];

const STEP_AGENCY_MAP: Record<string, string> = {
  'Thẩm định chủ trương đầu tư': 'Sở Xây dựng',
  'Lập đồ án quy hoạch 1/500':   'Sở Quy hoạch Kiến trúc',
  'Thẩm định quy hoạch 1/500':   'Sở Quy hoạch Kiến trúc',
  'Xác nhận quy hoạch phường':   'UBND cấp xã, phường',
  'Thẩm duyệt PCCC':              'Công an TP (PCCC)',
};

const ALL_PROJECTS = [
  { id: 'da-001', name: 'Dự án A', investor: 'CDT_ALPHA', currentStep: 'Thẩm định chủ trương đầu tư' },
  { id: 'da-002', name: 'Dự án B', investor: 'CDT_BETA',  currentStep: 'Lập đồ án quy hoạch 1/500' },
  { id: 'da-003', name: 'Dự án C', investor: 'CDT_ALPHA', currentStep: 'Thẩm duyệt PCCC' },
  { id: 'da-004', name: 'Dự án D', investor: 'CDT_BETA',  currentStep: 'Thẩm định quy hoạch 1/500' },
];

// Dự án riêng cho test UBND cấp xã, phường (agencyId='6') — lọc theo địa bàn + bước
const WARD_PROJECTS = [
  { id: 'da-005', name: 'Dự án E', investor: 'CDT_ALPHA', currentStep: 'Xác nhận quy hoạch phường', location: 'Phường Bến Nghé, Quận 1' },
  { id: 'da-006', name: 'Dự án F', investor: 'CDT_BETA',  currentStep: 'Lập đồ án quy hoạch 1/500',  location: 'Phường Bến Nghé, Quận 1' },
  { id: 'da-007', name: 'Dự án G', investor: 'CDT_ALPHA', currentStep: 'Xác nhận quy hoạch phường', location: 'Phường Tân Định, Quận 1' },
  { id: 'da-008', name: 'Dự án H', investor: 'CDT_BETA',  currentStep: 'Thẩm duyệt PCCC',            location: 'Phường Bến Nghé, Quận 1' },
];

const USERS: Record<string, any> = {
  admin:  { roleId: 'Admin',     userType: 'agency',   agencyId: '1' },
  sxd:    { roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '1' },
  sqhkt:  { roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '2' },
  pccc:   { roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '9' },
  snnmt:  { roleId: 'Lãnh đạo', userType: 'agency',   agencyId: '3' },
  phuong_bennghe: { roleId: 'Chuyên viên', userType: 'agency', agencyId: '6', department: 'UBND Phường Bến Nghé' },
  phuong_tandinh: { roleId: 'Chuyên viên', userType: 'agency', agencyId: '6', department: 'UBND Phường Tân Định' },
  cdt_a:  { roleId: 'Lãnh đạo', userType: 'investor', investorId: 'CDT_ALPHA' },
  cdt_b:  { roleId: 'Lãnh đạo', userType: 'investor', investorId: 'CDT_BETA' },
};

// Tái hiện logic visibleProjects trong App.tsx (src/App.tsx:700-758)
function getVisibleProjects(projects: any[], currentUser: any): any[] {
  if (!currentUser) return [];
  if (currentUser.roleId === 'Admin') return projects;
  if (currentUser.userType === 'agency' && currentUser.agencyId === '1') return projects;

  return projects.filter(p => {
    const stepAgency = STEP_AGENCY_MAP[p.currentStep];
    if (currentUser.userType === 'agency') {
      const agency = AGENCIES.find(a => a.id === currentUser.agencyId);
      const userAgencyName = agency?.name || '';

      // UBND cấp xã, phường (agencyId='6'): chỉ thấy dự án nếu địa bàn dự án
      // trùng khớp với department của mình VÀ bước hiện tại thuộc
      // 'UBND cấp xã, phường' hoặc 'Sở Quy hoạch Kiến trúc'
      if (currentUser.agencyId === '6') {
        const projectLocation = p.location || '';
        const userDepartment = currentUser.department || '';

        const cleanProjectLoc = projectLocation.toLowerCase().replace(/đường|quận|huyện|phường|xã|thành phố|tp\.hcm|tp/g, '').trim();
        const cleanDept = userDepartment.toLowerCase().replace(/ubnd|phường|xã/g, '').trim();

        const isRelatedLocation = cleanDept && (
          projectLocation.toLowerCase().includes(cleanDept) ||
          cleanProjectLoc.includes(cleanDept)
        );
        const isRelatedStep = stepAgency === 'UBND cấp xã, phường' || stepAgency === 'Sở Quy hoạch Kiến trúc';
        return isRelatedLocation && isRelatedStep;
      }

      return stepAgency === userAgencyName;
    }
    if (currentUser.userType === 'investor') {
      return p.investor === currentUser.investorId;
    }
    return false;
  });
}

// Tái hiện logic filteredMenuItems trong Sidebar.tsx (src/components/Sidebar.tsx:29-55)
const MENU_GROUPS = ['ĐIỀU HÀNH', 'QUẢN LÝ TIẾN ĐỘ DA HIỆN TẠI', 'QUẢN LÝ', 'HỆ THỐNG'];
const HE_THONG_ITEMS = ['Cấu hình quy trình', 'Cấu hình giai đoạn dự án', 'CĐT & Cơ quan xử lý', 'Danh mục dự án', 'Danh mục trạng thái', 'Quản lý tài khoản'];

// Admin HOẶC agency agencyId='1' (Sở Xây dựng) đều thấy nhóm HỆ THỐNG
function getVisibleMenuGroups(currentUser: any): string[] {
  if (currentUser.roleId === 'Admin' || (currentUser.userType === 'agency' && currentUser.agencyId === '1')) {
    return MENU_GROUPS;
  }
  return MENU_GROUPS.filter(g => g !== 'HỆ THỐNG');
}

// =============================================================================
// PHẦN 1 – Logic lọc dự án theo quyền (visibleProjects)
// =============================================================================
describe('Phần 1 – Nhóm quyền 1: Admin và Sở Xây dựng thấy tất cả', () => {
  it('1.1 – Admin thấy 4/4 dự án', () => {
    expect(getVisibleProjects(ALL_PROJECTS, USERS.admin)).toHaveLength(4);
  });
  it('1.2 – Sở Xây dựng (agencyId=1) thấy 4/4 dự án', () => {
    expect(getVisibleProjects(ALL_PROJECTS, USERS.sxd)).toHaveLength(4);
  });
  it('1.3 – Không có user (null) → danh sách rỗng', () => {
    expect(getVisibleProjects(ALL_PROJECTS, null)).toHaveLength(0);
  });
  it('1.4 – Admin và SXD thấy cùng tập dự án (4/4)', () => {
    const a = getVisibleProjects(ALL_PROJECTS, USERS.admin).map((p: any) => p.id).sort();
    const b = getVisibleProjects(ALL_PROJECTS, USERS.sxd).map((p: any) => p.id).sort();
    expect(a).toEqual(b);
  });
  it('1.5 – Admin thấy cả dự án đang ở bước QHKT lẫn PCCC', () => {
    const ids = getVisibleProjects(ALL_PROJECTS, USERS.admin).map((p: any) => p.id);
    expect(ids).toContain('da-002');
    expect(ids).toContain('da-003');
  });
});

describe('Phần 2 – Nhóm quyền 2: Chủ đầu tư chỉ thấy dự án của mình', () => {
  it('2.1 – CDT_ALPHA thấy da-001 và da-003 (2 dự án)', () => {
    const r = getVisibleProjects(ALL_PROJECTS, USERS.cdt_a);
    expect(r).toHaveLength(2);
    expect(r.map((p: any) => p.id)).toEqual(expect.arrayContaining(['da-001', 'da-003']));
  });
  it('2.2 – CDT_BETA thấy da-002 và da-004 (2 dự án)', () => {
    const r = getVisibleProjects(ALL_PROJECTS, USERS.cdt_b);
    expect(r).toHaveLength(2);
    expect(r.map((p: any) => p.id)).toEqual(expect.arrayContaining(['da-002', 'da-004']));
  });
  it('2.3 – CDT_ALPHA KHÔNG thấy dự án CDT_BETA', () => {
    const ids = getVisibleProjects(ALL_PROJECTS, USERS.cdt_a).map((p: any) => p.id);
    expect(ids).not.toContain('da-002');
    expect(ids).not.toContain('da-004');
  });
  it('2.4 – CDT_BETA KHÔNG thấy dự án CDT_ALPHA', () => {
    const ids = getVisibleProjects(ALL_PROJECTS, USERS.cdt_b).map((p: any) => p.id);
    expect(ids).not.toContain('da-001');
    expect(ids).not.toContain('da-003');
  });
  it('2.5 – CĐT không có dự án nào → rỗng', () => {
    expect(getVisibleProjects(ALL_PROJECTS, { ...USERS.cdt_a, investorId: 'KHONG_CO' })).toHaveLength(0);
  });
  it('2.6 – Hai CĐT không giao nhau', () => {
    const idsA = new Set(getVisibleProjects(ALL_PROJECTS, USERS.cdt_a).map((p: any) => p.id));
    const idsB = new Set(getVisibleProjects(ALL_PROJECTS, USERS.cdt_b).map((p: any) => p.id));
    expect([...idsA].filter(id => idsB.has(id))).toHaveLength(0);
  });
});

describe('Phần 3 – Nhóm quyền 3: Cơ quan phối hợp chỉ thấy bước của mình', () => {
  it('3.1 – Sở QHKT thấy da-002 và da-004 (2 dự án bước QHKT)', () => {
    const r = getVisibleProjects(ALL_PROJECTS, USERS.sqhkt);
    expect(r).toHaveLength(2);
    expect(r.map((p: any) => p.id)).toEqual(expect.arrayContaining(['da-002', 'da-004']));
  });
  it('3.2 – Sở QHKT KHÔNG thấy bước SXD (da-001)', () => {
    expect(getVisibleProjects(ALL_PROJECTS, USERS.sqhkt).map((p: any) => p.id)).not.toContain('da-001');
  });
  it('3.3 – Sở QHKT KHÔNG thấy bước PCCC (da-003)', () => {
    expect(getVisibleProjects(ALL_PROJECTS, USERS.sqhkt).map((p: any) => p.id)).not.toContain('da-003');
  });
  it('3.4 – Công an PCCC chỉ thấy da-003 (1 dự án)', () => {
    const r = getVisibleProjects(ALL_PROJECTS, USERS.pccc);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('da-003');
  });
  it('3.5 – Sở NNMT không có dự án ở bước mình → rỗng', () => {
    expect(getVisibleProjects(ALL_PROJECTS, USERS.snnmt)).toHaveLength(0);
  });
  it('3.6 – QHKT và PCCC không giao nhau', () => {
    const q = getVisibleProjects(ALL_PROJECTS, USERS.sqhkt).map((p: any) => p.id);
    const p = getVisibleProjects(ALL_PROJECTS, USERS.pccc).map((p: any) => p.id);
    expect(q.filter((id: string) => p.includes(id))).toHaveLength(0);
  });
  it('3.7 – Mỗi dự án tại một thời điểm chỉ thuộc 1 cơ quan xử lý', () => {
    ALL_PROJECTS.forEach(project => {
      const q = getVisibleProjects([project], USERS.sqhkt);
      const p = getVisibleProjects([project], USERS.pccc);
      expect(q.length + p.length).toBeLessThanOrEqual(1);
    });
  });
});

describe('Phần 4 – Chuyển bước dự án → cập nhật phạm vi hiển thị động', () => {
  it('4.1 – da-001 chuyển sang QHKT: QHKT thấy thêm, PCCC không thấy', () => {
    const updated = [{ ...ALL_PROJECTS[0], currentStep: 'Lập đồ án quy hoạch 1/500' }, ...ALL_PROJECTS.slice(1)];
    expect(getVisibleProjects(updated, USERS.sqhkt).map((p: any) => p.id)).toContain('da-001');
    expect(getVisibleProjects(updated, USERS.pccc).map((p: any) => p.id)).not.toContain('da-001');
  });
  it('4.2 – da-003 chuyển sang QHKT: PCCC không còn thấy, QHKT thấy thêm', () => {
    const updated = [...ALL_PROJECTS.slice(0, 2), { ...ALL_PROJECTS[2], currentStep: 'Lập đồ án quy hoạch 1/500' }, ALL_PROJECTS[3]];
    expect(getVisibleProjects(updated, USERS.pccc).map((p: any) => p.id)).not.toContain('da-003');
    expect(getVisibleProjects(updated, USERS.sqhkt).map((p: any) => p.id)).toContain('da-003');
  });
  it('4.3 – Admin luôn thấy tất cả bất kể bước', () => {
    const allPCCC = ALL_PROJECTS.map(p => ({ ...p, currentStep: 'Thẩm duyệt PCCC' }));
    expect(getVisibleProjects(allPCCC, USERS.admin)).toHaveLength(4);
  });
  it('4.4 – SXD luôn thấy tất cả bất kể bước', () => {
    const allPCCC = ALL_PROJECTS.map(p => ({ ...p, currentStep: 'Thẩm duyệt PCCC' }));
    expect(getVisibleProjects(allPCCC, USERS.sxd)).toHaveLength(4);
  });
  it('4.5 – CĐT_ALPHA thấy dự án của mình dù bước thay đổi', () => {
    const updated = [{ ...ALL_PROJECTS[0], currentStep: 'Thẩm duyệt PCCC' }, ...ALL_PROJECTS.slice(1)];
    expect(getVisibleProjects(updated, USERS.cdt_a).map((p: any) => p.id)).toContain('da-001');
  });
});

// =============================================================================
// PHẦN 5 – Logic menu Sidebar theo phân quyền (filteredMenuItems)
// =============================================================================
describe('Phần 5 – Sidebar menu: Admin thấy HỆ THỐNG, non-admin không thấy', () => {
  it('5.1 – Admin thấy nhóm HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.admin)).toContain('HỆ THỐNG');
  });
  it('5.2 – Lãnh đạo SXD (agencyId=1, không phải Admin) VẪN thấy HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.sxd)).toContain('HỆ THỐNG');
  });
  it('5.3 – Sở QHKT KHÔNG thấy HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.sqhkt)).not.toContain('HỆ THỐNG');
  });
  it('5.4 – Công an PCCC KHÔNG thấy HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.pccc)).not.toContain('HỆ THỐNG');
  });
  it('5.5 – CĐT_ALPHA KHÔNG thấy HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.cdt_a)).not.toContain('HỆ THỐNG');
  });
  it('5.6 – Admin thấy đủ 4 nhóm menu', () => {
    expect(getVisibleMenuGroups(USERS.admin)).toHaveLength(4);
  });
  it('5.6b – SXD (agencyId=1) cũng thấy đủ 4 nhóm menu như Admin', () => {
    expect(getVisibleMenuGroups(USERS.sxd)).toHaveLength(4);
  });
  it('5.7 – Non-admin, agency khác agencyId=1 thấy 3 nhóm menu (thiếu HỆ THỐNG)', () => {
    expect(getVisibleMenuGroups(USERS.sqhkt)).toHaveLength(3);
    expect(getVisibleMenuGroups(USERS.pccc)).toHaveLength(3);
    expect(getVisibleMenuGroups(USERS.cdt_a)).toHaveLength(3);
  });
  it('5.8 – Admin thấy ĐIỀU HÀNH', () => {
    expect(getVisibleMenuGroups(USERS.admin)).toContain('ĐIỀU HÀNH');
  });
  it('5.9 – Non-admin vẫn thấy ĐIỀU HÀNH và QUẢN LÝ', () => {
    const groups = getVisibleMenuGroups(USERS.sqhkt);
    expect(groups).toContain('ĐIỀU HÀNH');
    expect(groups).toContain('QUẢN LÝ');
  });
  it('5.10 – Menu HỆ THỐNG của Admin bao gồm các mục quản trị', () => {
    // Kiểm tra rằng MENU_GROUPS bao gồm 'HỆ THỐNG' (Admin thấy)
    expect(MENU_GROUPS).toContain('HỆ THỐNG');
    // Và các mục trong HỆ THỐNG tồn tại
    expect(HE_THONG_ITEMS).toContain('Quản lý tài khoản');
    expect(HE_THONG_ITEMS).toContain('Cấu hình quy trình');
  });
});

// =============================================================================
// PHẦN 5B – UBND cấp xã, phường (agencyId='6'): lọc theo địa bàn + bước xử lý
// =============================================================================
describe('Phần 5B – UBND cấp xã, phường: chỉ thấy dự án đúng địa bàn và đúng bước', () => {
  it('5B.1 – Phường Bến Nghé thấy da-005 (bước UBND, cùng địa bàn)', () => {
    const ids = getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe).map((p: any) => p.id);
    expect(ids).toContain('da-005');
  });
  it('5B.2 – Phường Bến Nghé thấy da-006 (bước QHKT, cùng địa bàn)', () => {
    const ids = getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe).map((p: any) => p.id);
    expect(ids).toContain('da-006');
  });
  it('5B.3 – Phường Bến Nghé KHÔNG thấy da-007 (đúng bước nhưng khác địa bàn)', () => {
    const ids = getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe).map((p: any) => p.id);
    expect(ids).not.toContain('da-007');
  });
  it('5B.4 – Phường Bến Nghé KHÔNG thấy da-008 (cùng địa bàn nhưng bước PCCC không liên quan)', () => {
    const ids = getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe).map((p: any) => p.id);
    expect(ids).not.toContain('da-008');
  });
  it('5B.5 – Phường Bến Nghé thấy đúng 2 dự án (da-005, da-006)', () => {
    expect(getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe)).toHaveLength(2);
  });
  it('5B.6 – Phường Tân Định thấy da-007 (bước UBND, cùng địa bàn)', () => {
    const ids = getVisibleProjects(WARD_PROJECTS, USERS.phuong_tandinh).map((p: any) => p.id);
    expect(ids).toEqual(['da-007']);
  });
  it('5B.7 – Hai phường không giao nhau', () => {
    const a = new Set(getVisibleProjects(WARD_PROJECTS, USERS.phuong_bennghe).map((p: any) => p.id));
    const b = new Set(getVisibleProjects(WARD_PROJECTS, USERS.phuong_tandinh).map((p: any) => p.id));
    expect([...a].filter(id => b.has(id))).toHaveLength(0);
  });
  it('5B.8 – UBND phường KHÔNG thấy nhóm menu HỆ THỐNG', () => {
    expect(getVisibleMenuGroups(USERS.phuong_bennghe)).not.toContain('HỆ THỐNG');
  });
});

// =============================================================================
// PHẦN 6 – Quy tắc kiểm tra chung (cross-cutting)
// =============================================================================
describe('Phần 6 – Quy tắc kiểm tra chung', () => {
  it('6.1 – Admin và SXD thấy cùng số dự án (không rò rỉ quyền)', () => {
    const admin = getVisibleProjects(ALL_PROJECTS, USERS.admin);
    const sxd   = getVisibleProjects(ALL_PROJECTS, USERS.sxd);
    expect(admin.length).toBe(sxd.length);
  });
  it('6.2 – QHKT và PCCC thấy tập dự án riêng biệt, không giao nhau', () => {
    const q = new Set(getVisibleProjects(ALL_PROJECTS, USERS.sqhkt).map((p: any) => p.id));
    const p = new Set(getVisibleProjects(ALL_PROJECTS, USERS.pccc).map((p: any) => p.id));
    expect([...q].filter(id => p.has(id))).toHaveLength(0);
  });
  it('6.3 – CDT_ALPHA và CDT_BETA thấy tập dự án riêng biệt, không giao nhau', () => {
    const a = new Set(getVisibleProjects(ALL_PROJECTS, USERS.cdt_a).map((p: any) => p.id));
    const b = new Set(getVisibleProjects(ALL_PROJECTS, USERS.cdt_b).map((p: any) => p.id));
    expect([...a].filter(id => b.has(id))).toHaveLength(0);
  });
  it('6.4 – Mỗi dự án đúng 1 CĐT (không bị thấy bởi CĐT khác)', () => {
    ALL_PROJECTS.forEach(project => {
      const visibleA = getVisibleProjects([project], USERS.cdt_a);
      const visibleB = getVisibleProjects([project], USERS.cdt_b);
      expect(visibleA.length + visibleB.length).toBeLessThanOrEqual(1);
    });
  });
  it('6.5 – Cơ quan chỉ thấy dự án đúng bước của mình', () => {
    ALL_PROJECTS.forEach(project => {
      const stepAgency = STEP_AGENCY_MAP[project.currentStep];
      const visibleQHKT = getVisibleProjects([project], USERS.sqhkt);
      if (stepAgency === 'Sở Quy hoạch Kiến trúc') {
        expect(visibleQHKT).toHaveLength(1);
      } else {
        expect(visibleQHKT).toHaveLength(0);
      }
    });
  });
  it('6.6 – Tổng dự án các cơ quan phối hợp thấy ≤ tổng dự án thực (không tạo thừa)', () => {
    const q = getVisibleProjects(ALL_PROJECTS, USERS.sqhkt).map((p: any) => p.id);
    const p = getVisibleProjects(ALL_PROJECTS, USERS.pccc).map((p: any) => p.id);
    const n = getVisibleProjects(ALL_PROJECTS, USERS.snnmt).map((p: any) => p.id);
    const union = new Set([...q, ...p, ...n]);
    expect(union.size).toBeLessThanOrEqual(ALL_PROJECTS.length);
  });
  it('6.7 – Admin có nhiều quyền hơn bất kỳ non-admin nào', () => {
    const adminCount = getVisibleProjects(ALL_PROJECTS, USERS.admin).length;
    [USERS.sxd, USERS.sqhkt, USERS.pccc, USERS.cdt_a, USERS.cdt_b, USERS.snnmt].forEach(user => {
      expect(getVisibleProjects(ALL_PROJECTS, user).length).toBeLessThanOrEqual(adminCount);
    });
  });
  it('6.8 – Xóa dự án không tạo ra dự án ma trong danh sách', () => {
    const subset = ALL_PROJECTS.slice(0, 2); // chỉ 2 dự án
    expect(getVisibleProjects(subset, USERS.admin)).toHaveLength(2);
    expect(getVisibleProjects(subset, USERS.sqhkt).length).toBeLessThanOrEqual(2);
  });
});
