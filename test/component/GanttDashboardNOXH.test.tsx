// @vitest-environment jsdom
/**
 * Component Tests: GanttDashboardNOXH
 *
 * Kiểm tra:
 *   - Render bảng Gantt tổng hợp dự án NOXH
 *   - Bộ lọc: tìm kiếm, giai đoạn, trạng thái
 *   - Stat cards (tổng dự án, đang xử lý, chậm tiến độ)
 *   - Toggle expand/collapse bảng
 *   - Click project → gọi onProjectClick
 *   - Reset data gọi onResetActualProgress
 *   - Hiển thị legend trạng thái
 *   - Export xlsx không crash
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import GanttDashboardNOXH from '../../src/components/GanttDashboardNOXH';
import { computeMilestones, legacyValuesFor } from '../../src/lib/stepProgress';

// Cột Gantt = danh mục mốc (Cấu hình Giai đoạn & Mốc Milestone); số liệu từ server (milestoneProgress).
// Ở đây tính như server làm với dự án chưa có dữ liệu theo bước: lấy từ các cột mốc cũ của dự án.
const STAGES_RAW = [
  { name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'QĐ Giao đất', 'ĐN HTKT', 'BC NCKT', 'TD PCCC', 'GPXD'] },
  { name: 'THỰC HIỆN ĐẦU TƯ', milestones: [] }
];
const progressOf = (projects: any[]) => Object.fromEntries(
  projects.map(p => [p.id, computeMilestones(null, STAGES_RAW, {}, m => legacyValuesFor(p, {}, m.name))])
);

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));


vi.mock('lucide-react', () => {
  const M = () => null;
  return {
    Calendar: M, Filter: M, Download: M, ChevronLeft: M, ChevronRight: M,
    ChevronDown: M, Search: M, Building2: M, MapPin: M, Info: M,
    CheckCircle2: M, Clock: M, AlertCircle: M, Check: M, RotateCcw: M,
    Layers: M, X: M,
  };
});

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProject1 = {
  id: 'p-1',
  code: 'NOXH-001',
  name: 'Nhà Ở Xã Hội Bình Tân',
  investor: 'Công ty A',
  location: 'Quận Bình Tân, TP.HCM',
  stage: 'CHUẨN BỊ ĐẦU TƯ',
  currentStep: 'Chấp thuận chủ trương',
  progress: 30,
  status: 'On Track',
  deadline: '31/12/2026',
  totalArea: 2.5,
  height: 15,
  apartmentCount: 300,
  startDate: '01/01/2024',
  endDate: '31/12/2026',
  chutruong_cdt_date: '01/03/2024',
  chutruong_nn_date: '30/06/2025',
  qh1500_cdt_date: '',
  qh1500_nn_date: '',
  qdgiaodat_cdt_date: '',
  qdgiaodat_nn_date: '',
  htkt_dtm_cdt_date: '',
  htkt_dtm_nn_date: '',
  baocaonckt_cdt_date: '',
  baocaonckt_nn_date: '',
  pccc_cdt_date: '',
  pccc_nn_date: '',
  gpxaydung_cdt_date: '',
  gpxaydung_nn_date: '',
};

const mockProject2 = {
  id: 'p-2',
  code: 'NOXH-002',
  name: 'Nhà Ở Xã Hội Quận 7',
  investor: 'Công ty B',
  location: 'Quận 7, TP.HCM',
  stage: 'THỰC HIỆN ĐẦU TƯ',
  currentStep: 'QH 1/500',
  progress: 60,
  status: 'Delayed',
  deadline: '31/06/2025',
  totalArea: 1.8,
  height: 20,
  apartmentCount: 200,
  startDate: '01/06/2022',
  endDate: '31/06/2025',
  chutruong_cdt_date: 'X',
  chutruong_nn_date: 'X',
  qh1500_cdt_date: '01/01/2023',
  qh1500_nn_date: '01/01/2022', // quá hạn
  qdgiaodat_cdt_date: '',
  qdgiaodat_nn_date: '',
  htkt_dtm_cdt_date: '',
  htkt_dtm_nn_date: '',
  baocaonckt_cdt_date: '',
  baocaonckt_nn_date: '',
  pccc_cdt_date: '',
  pccc_nn_date: '',
  gpxaydung_cdt_date: '',
  gpxaydung_nn_date: '',
};

const defaultProps = {
  projects: [mockProject1, mockProject2],
  reportDate: '31/12/2026',
  projectStatuses: ['Đang xử lý', 'Quá hạn', 'Hoàn thành'],
  projectStages: ['CHUẨN BỊ ĐẦU TƯ', 'THỰC HIỆN ĐẦU TƯ'],
  projectStagesRaw: STAGES_RAW,
  onProjectClick: vi.fn(),
  actualProgress: {},
  onResetActualProgress: vi.fn(),
};

function renderGantt(overrides: Record<string, any> = {}) {
  const props: any = { ...defaultProps, ...overrides };
  return render(<GanttDashboardNOXH {...props} milestoneProgress={overrides.milestoneProgress ?? progressOf(props.projects || [])} />);
}

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Render cơ bản', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render được mà không crash', () => {
    expect(() => renderGantt()).not.toThrow();
  });

  it('hiển thị tiêu đề "Sơ đồ Gantt dự án NOXH"', () => {
    renderGantt();
    expect(screen.getByText('Sơ đồ Gantt dự án NOXH')).toBeInTheDocument();
  });

  it('hiển thị mô tả phụ', () => {
    renderGantt();
    expect(screen.getByText(/Theo dõi tất cả/i)).toBeInTheDocument();
  });

  it('render không crash khi projects rỗng', () => {
    expect(() => renderGantt({ projects: [] })).not.toThrow();
  });

  it('render không crash khi không truyền projects', () => {
    expect(() => renderGantt({ projects: undefined })).not.toThrow();
  });

  it('render không crash khi actualProgress có data', () => {
    const actualProgress = { 'p-1': { chutruong: { cdtDate: '2024-03-01', nnDate: '' } } };
    expect(() => renderGantt({ actualProgress })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Stat cards', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị stat card "Tổng số dự án"', () => {
    renderGantt();
    expect(screen.getByText('Tổng số dự án')).toBeInTheDocument();
  });

  it('hiển thị stat card "CQNN Đang xử lý"', () => {
    renderGantt();
    expect(screen.getByText('CQNN Đang xử lý')).toBeInTheDocument();
  });

  it('hiển thị stat card "KH của CQNN bị chậm tiến độ"', () => {
    renderGantt();
    expect(screen.getByText('KH của CQNN bị chậm tiến độ')).toBeInTheDocument();
  });

  it('hiển thị đúng tổng số dự án là 2', () => {
    renderGantt();
    const twos = screen.queryAllByText('2');
    expect(twos.length).toBeGreaterThan(0);
  });

  it('click stat card "Tổng số dự án" không crash', () => {
    renderGantt();
    const card = screen.getByText('Tổng số dự án').closest('div[class]');
    if (card) expect(() => fireEvent.click(card)).not.toThrow();
  });

  it('click stat card "CQNN Đang xử lý" không crash', () => {
    renderGantt();
    const card = screen.getByText('CQNN Đang xử lý').closest('div[class]');
    if (card) expect(() => fireEvent.click(card)).not.toThrow();
  });

  it('click stat card "KH của CQNN bị chậm tiến độ" không crash', () => {
    renderGantt();
    const card = screen.getByText('KH của CQNN bị chậm tiến độ').closest('div[class]');
    if (card) expect(() => fireEvent.click(card)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Bộ lọc tìm kiếm', () => {
  beforeEach(() => { localStorage.clear(); });

  it('input tìm kiếm tồn tại', () => {
    renderGantt();
    expect(screen.getByPlaceholderText(/Tìm mã dự án/i)).toBeInTheDocument();
  });

  it('nhập tên dự án lọc danh sách', () => {
    renderGantt();
    const input = screen.getByPlaceholderText(/Tìm mã dự án/i);
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('nhập mã dự án lọc chính xác', () => {
    renderGantt();
    const input = screen.getByPlaceholderText(/Tìm mã dự án/i);
    fireEvent.change(input, { target: { value: 'NOXH-001' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('xóa search hiển thị lại tất cả dự án', () => {
    renderGantt();
    const input = screen.getByPlaceholderText(/Tìm mã dự án/i);
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Bộ lọc giai đoạn', () => {
  beforeEach(() => { localStorage.clear(); });

  it('select giai đoạn tồn tại', () => {
    renderGantt();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('select option "CHUẨN BỊ ĐẦU TƯ" lọc dự án theo giai đoạn', () => {
    renderGantt();
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'CHUẨN BỊ ĐẦU TƯ' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('select "Tất cả giai đoạn" hiển thị tất cả', () => {
    renderGantt();
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'CHUẨN BỊ ĐẦU TƯ' } });
    fireEvent.change(select, { target: { value: 'Tất cả giai đoạn' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Bộ lọc trạng thái', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click stat card thay đổi bộ lọc trạng thái', () => {
    renderGantt();
    const delayedCard = screen.getByText('KH của CQNN bị chậm tiến độ');
    fireEvent.click(delayedCard);
    expect(screen.queryByText('Hiển thị tất cả')).toBeInTheDocument();
  });

  it('click "Hiển thị tất cả" reset bộ lọc trạng thái', () => {
    renderGantt();
    const delayedCard = screen.getByText('KH của CQNN bị chậm tiến độ');
    fireEvent.click(delayedCard);
    const resetBtn = screen.queryByText('Hiển thị tất cả');
    if (resetBtn) {
      fireEvent.click(resetBtn);
      expect(screen.queryByText('Hiển thị tất cả')).not.toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Legend trạng thái', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị "Hoàn thành" trong legend', () => {
    renderGantt();
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
  });

  it('hiển thị "Đang thực hiện" trong legend', () => {
    renderGantt();
    expect(screen.getByText('Đang thực hiện')).toBeInTheDocument();
  });

  it('hiển thị "Đúng hạn" trong legend', () => {
    renderGantt();
    expect(screen.getByText('Đúng hạn')).toBeInTheDocument();
  });

  it('hiển thị "Quá hạn" trong legend', () => {
    renderGantt();
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });

  it('hiển thị "Chưa bắt đầu" trong legend', () => {
    renderGantt();
    expect(screen.getByText('Chưa bắt đầu')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Header bảng Gantt', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị cột "Tên dự án" trong header', () => {
    renderGantt();
    expect(screen.getAllByText(/Tên dự án/i).length).toBeGreaterThan(0);
  });

  it('hiển thị cột "Địa điểm" trong header', () => {
    renderGantt();
    expect(screen.getByText(/Địa điểm \/ Chủ đầu tư/i)).toBeInTheDocument();
  });

  it('hiển thị cột milestone "Chấp thuận chủ trương"', () => {
    renderGantt();
    expect(screen.getByText('Chấp thuận chủ trương')).toBeInTheDocument();
  });

  it('hiển thị cột milestone "QH 1/500"', () => {
    renderGantt();
    expect(screen.getByText('QH 1/500')).toBeInTheDocument();
  });

  it('hiển thị cột milestone "GPXD"', () => {
    renderGantt();
    expect(screen.getByText('GPXD')).toBeInTheDocument();
  });

  it('hiển thị sub-header "CĐT" cho mỗi milestone', () => {
    renderGantt();
    const cdtHeaders = screen.getAllByText('CĐT');
    expect(cdtHeaders.length).toBeGreaterThan(0);
  });

  it('hiển thị sub-header "Cơ quan NN" cho mỗi milestone', () => {
    renderGantt();
    const nnHeaders = screen.getAllByText('Cơ quan NN');
    expect(nnHeaders.length).toBeGreaterThan(0);
  });

  it('hiển thị cột "Ngày hoàn thành"', () => {
    renderGantt();
    expect(screen.getByText('Ngày hoàn thành')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Dữ liệu dự án trong bảng', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị mã dự án p-1', () => {
    renderGantt();
    expect(screen.getByText('NOXH-001')).toBeInTheDocument();
  });

  it('hiển thị tên dự án p-1', () => {
    renderGantt();
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('hiển thị tên dự án p-2', () => {
    renderGantt();
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
  });

  it('hiển thị chủ đầu tư "Công ty A"', () => {
    renderGantt();
    expect(screen.getByText('Công ty A')).toBeInTheDocument();
  });

  it('hiển thị nhãn row "KH" trong bảng', () => {
    renderGantt();
    const khLabels = screen.getAllByText('KH');
    expect(khLabels.length).toBeGreaterThan(0);
  });

  it('hiển thị nhãn row "TT" trong bảng', () => {
    renderGantt();
    const ttLabels = screen.getAllByText('TT');
    expect(ttLabels.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – onClick project', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click tên dự án gọi onProjectClick', () => {
    const onProjectClick = vi.fn();
    renderGantt({ onProjectClick });
    const projectName = screen.queryAllByText('Nhà Ở Xã Hội Bình Tân')[0];
    if (projectName) {
      fireEvent.click(projectName);
      expect(onProjectClick).toHaveBeenCalled();
    }
  });

  it('gọi onProjectClick với đối tượng project', () => {
    const onProjectClick = vi.fn();
    renderGantt({ onProjectClick });
    const projectName = screen.queryAllByText('Nhà Ở Xã Hội Bình Tân')[0];
    if (projectName) {
      fireEvent.click(projectName);
      expect(onProjectClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
    }
  });

  it('không crash khi onProjectClick không được truyền', () => {
    renderGantt({ onProjectClick: undefined });
    const projectName = screen.queryAllByText('Nhà Ở Xã Hội Bình Tân')[0];
    if (projectName) {
      expect(() => fireEvent.click(projectName)).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Toggle expand/collapse', () => {
  beforeEach(() => { localStorage.clear(); });

  it('nút "Xem tất cả" tồn tại', () => {
    renderGantt();
    expect(screen.getByText('Xem tất cả')).toBeInTheDocument();
  });

  it('click "Xem tất cả" chuyển thành "Thu gọn"', () => {
    renderGantt();
    const btn = screen.getByText('Xem tất cả');
    fireEvent.click(btn);
    expect(screen.getByText('Thu gọn')).toBeInTheDocument();
  });

  it('click "Thu gọn" chuyển về "Xem tất cả"', () => {
    renderGantt();
    const btn = screen.getByText('Xem tất cả');
    fireEvent.click(btn);
    const collapseBtn = screen.getByText('Thu gọn');
    fireEvent.click(collapseBtn);
    expect(screen.getByText('Xem tất cả')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Nút Reset data', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Nút "Reset tiến độ thực tế" (trước đây "Reset dữ liệu") chỉ hiển thị khi currentUser.roleId === 'Admin'
  // (src/components/GanttDashboardNOXH.tsx:782)
  const ADMIN_USER = { roleId: 'Admin' };

  it('nút "Reset tiến độ thực tế" tồn tại', () => {
    renderGantt({ currentUser: ADMIN_USER });
    expect(screen.getByText('Reset tiến độ thực tế')).toBeInTheDocument();
  });

  it('click "Reset tiến độ thực tế" hiển thị confirm', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGantt({ currentUser: ADMIN_USER });
    fireEvent.click(screen.getByText('Reset tiến độ thực tế'));
    expect(confirm).toHaveBeenCalled();
  });

  it('xác nhận reset gọi onResetActualProgress', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onResetActualProgress = vi.fn();
    renderGantt({ onResetActualProgress, currentUser: ADMIN_USER });
    fireEvent.click(screen.getByText('Reset tiến độ thực tế'));
    expect(onResetActualProgress).toHaveBeenCalledTimes(1);
  });

  it('hủy confirm không gọi onResetActualProgress', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onResetActualProgress = vi.fn();
    renderGantt({ onResetActualProgress, currentUser: ADMIN_USER });
    fireEvent.click(screen.getByText('Reset tiến độ thực tế'));
    expect(onResetActualProgress).not.toHaveBeenCalled();
  });

  it('xác nhận reset xóa localStorage actual_progress_*', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem('actual_progress_p-1', JSON.stringify({ test: true }));
    renderGantt({ onResetActualProgress: vi.fn(), currentUser: ADMIN_USER });
    fireEvent.click(screen.getByText('Reset tiến độ thực tế'));
    expect(localStorage.getItem('actual_progress_p-1')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Nút Xuất dữ liệu', () => {
  beforeEach(() => { localStorage.clear(); });

  it('nút "Xuất dữ liệu dự án" tồn tại', () => {
    renderGantt();
    expect(screen.getByText('Xuất dữ liệu dự án')).toBeInTheDocument();
  });

  it('click "Xuất dữ liệu dự án" không crash', () => {
    renderGantt();
    const btn = screen.getByText('Xuất dữ liệu dự án');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – actualProgress từ props', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render bình thường với actualProgress đầy đủ', () => {
    const actualProgress = {
      'p-1': {
        chutruong: { cdtDate: '2024-03-01', nnDate: '2024-06-30' },
        qh1500: { cdtDate: '', nnDate: '' },
      },
    };
    expect(() => renderGantt({ actualProgress })).not.toThrow();
  });

  it('render bình thường với localStorage actual_progress', () => {
    localStorage.setItem(
      'actual_progress_p-1',
      JSON.stringify({ chutruong: { cdtDate: '2024-03-01', nnDate: '2024-06-30' } })
    );
    expect(() => renderGantt()).not.toThrow();
  });

  it('render bình thường khi localStorage JSON không hợp lệ', () => {
    localStorage.setItem('actual_progress_p-1', '{invalid}');
    expect(() => renderGantt()).not.toThrow();
  });

  it('dự án với tất cả phase "X" render không crash', () => {
    const allDoneProject = {
      ...mockProject1,
      chutruong_cdt_date: 'X', chutruong_nn_date: 'X',
      qh1500_cdt_date: 'X', qh1500_nn_date: 'X',
      qdgiaodat_cdt_date: 'X', qdgiaodat_nn_date: 'X',
      htkt_dtm_cdt_date: 'X', htkt_dtm_nn_date: 'X',
      baocaonckt_cdt_date: 'X', baocaonckt_nn_date: 'X',
      pccc_cdt_date: 'X', pccc_nn_date: 'X',
      gpxaydung_cdt_date: 'X', gpxaydung_nn_date: 'X',
    };
    expect(() => renderGantt({ projects: [allDoneProject] })).not.toThrow();
  });

  it('dự án với "Đã xong" badge khi cả 2 date là "X"', () => {
    const allDoneProject = {
      ...mockProject1,
      chutruong_cdt_date: 'X', chutruong_nn_date: 'X',
    };
    renderGantt({ projects: [allDoneProject] });
    const doneBadges = screen.queryAllByText('Đã xong');
    expect(doneBadges.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('GanttDashboardNOXH – Thẻ chậm tiến độ, lọc giai đoạn, xuất Excel (sửa 06/10/2026)', () => {
  beforeEach(() => { localStorage.clear(); });
  const base = { ...mockProject1, chutruong_cdt_date: '', chutruong_nn_date: '' };
  // Chấp thuận chủ trương: CQNN đã xong; CĐT có KH đã qua nhưng chưa nhập TT
  const cdtLate = { ...base, id: 'p-cdt', code: 'CDT-LATE', name: 'Dự án chỉ chậm phía CĐT' };
  const mp = (legacy: any) => computeMilestones(null, STAGES_RAW, {}, m => (m.name === 'Chấp thuận chủ trương' ? legacy : {}));
  const lateCard = () => screen.getByText('KH của CQNN bị chậm tiến độ').closest('div[class]')!;

  it('chậm phía CĐT không tính vào "KH của CQNN bị chậm tiến độ"', () => {
    renderGantt({ projects: [cdtLate], milestoneProgress: { 'p-cdt': mp({ cdtPlan: '01/01/2025', nnActual: '2025-02-01' }) } });
    fireEvent.click(lateCard());
    expect(screen.queryByText('Dự án chỉ chậm phía CĐT')).toBeNull();
  });

  it('chậm phía CQNN vẫn được tính', () => {
    const nnLate = { ...base, id: 'p-nn', code: 'NN-LATE', name: 'Dự án chậm phía CQNN' };
    renderGantt({ projects: [nnLate], milestoneProgress: { 'p-nn': mp({ nnPlan: '01/01/2025' }) } });
    fireEvent.click(lateCard());
    expect(screen.getByText('Dự án chậm phía CQNN')).toBeInTheDocument();
  });

  it('lọc giai đoạn không phân biệt hoa thường; dự án chưa có giai đoạn nằm ở giai đoạn đầu', () => {
    const noStage = { ...base, id: 'p-ns', code: 'NS', name: 'Dự án chưa có giai đoạn', stage: '' };
    const lower = { ...base, id: 'p-lo', code: 'LO', name: 'Dự án giai đoạn chữ thường', stage: 'Thực hiện đầu tư' };
    renderGantt({ projects: [noStage, lower] });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'CHUẨN BỊ ĐẦU TƯ' } });
    expect(screen.getByText('Dự án chưa có giai đoạn')).toBeInTheDocument();
    expect(screen.queryByText('Dự án giai đoạn chữ thường')).toBeNull();
    fireEvent.change(select, { target: { value: 'THỰC HIỆN ĐẦU TƯ' } });
    expect(screen.getByText('Dự án giai đoạn chữ thường')).toBeInTheDocument();
  });

  it('xuất Excel: mỗi dự án 2 dòng KH / TT, ngày dd/mm/yyyy', async () => {
    const XLSX: any = await import('xlsx');
    XLSX.utils.aoa_to_sheet.mockClear();
    renderGantt({ projects: [cdtLate], milestoneProgress: { 'p-cdt': mp({ cdtPlan: '01/01/2025', nnActual: '2025-02-01' }) } });
    fireEvent.click(screen.getByText('Xuất dữ liệu dự án'));
    const rows = XLSX.utils.aoa_to_sheet.mock.calls[0][0];
    expect(rows).toHaveLength(4);
    expect(rows[2].slice(8, 11)).toEqual(['KH', '01/01/2025', '--']);
    expect(rows[3].slice(8, 11)).toEqual(['TT', '--', '01/02/2025']);
  });
});
