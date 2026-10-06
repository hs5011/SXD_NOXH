// @vitest-environment jsdom
/**
 * Test End-to-End: Luồng tạo dự án → Gantt → Danh sách → Tiến độ năm → Tiến độ bước → Gantt → Chi tiết
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, ...rest }: any) => <div className={className} {...rest}>{children}</div>,
    tr:  ({ children, className, ...rest }: any) => <tr className={className} {...rest}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('react-datepicker', () => ({
  default: ({ onChange, selected, placeholderText, className }: any) => (
    <input
      data-testid="datepicker"
      placeholder={placeholderText}
      className={className}
      value={selected ? (selected instanceof Date ? selected.toISOString().split('T')[0] : selected) : ''}
      onChange={(e) => onChange && onChange(e.target.value ? new Date(e.target.value) : null)}
    />
  ),
  registerLocale: vi.fn(),
}));

vi.mock('xlsx', () => ({
  utils: { book_new: vi.fn(), aoa_to_sheet: vi.fn(), book_append_sheet: vi.fn() },
  writeFile: vi.fn(),
  write: vi.fn(),
}));

vi.mock('date-fns/locale', () => ({ vi: {} }));
vi.mock('date-fns', () => ({
  format:  vi.fn((d: Date) => d.toISOString()),
  parse:   vi.fn((s: string) => new Date(s)),
  isValid: vi.fn(() => true),
}));

vi.mock('../../src/data/appData', () => ({
  INITIAL_PROCESSES: [
    {
      id: 'proc-e2e',
      name: 'Quy trình NOXH E2E',
      parentSteps: [
        {
          id: 'ps-1', name: 'Chấp thuận chủ trương', slaDays: 30,
          childSteps: [
            { id: 'cs-1', name: 'Thẩm định chủ trương đầu tư', agency: 'Sở Xây Dựng', slaDays: 15 },
            { id: 'cs-2', name: 'Trình UBND TP phê duyệt',    agency: 'Sở Xây Dựng', slaDays: 15 },
          ],
        },
        {
          id: 'ps-2', name: 'Quy hoạch 1/500', slaDays: 45,
          childSteps: [
            { id: 'cs-3', name: 'Lập đồ án quy hoạch', agency: 'Sở QHKT', slaDays: 30 },
            { id: 'cs-4', name: 'Thẩm định quy hoạch', agency: 'Sở QHKT', slaDays: 15 },
          ],
        },
      ],
    },
  ],
  INITIAL_PROJECTS: [],
  INITIAL_USERS: [],
}));

vi.mock('../../src/components/StepManagementView.tsx', () => ({}));
vi.mock('../../src/components/AgencyManagement.tsx',   () => ({}));

// ─── Shared data ─────────────────────────────────────────────────────────────

const MOCK_PROCESS = {
  id: 'proc-e2e',
  name: 'Quy trình NOXH E2E',
  parentSteps: [
    {
      // isMilestone: true bắt buộc để AnnualProgressUpdate.tsx nhận đây là 1 cột mốc
      // (xem activePhases trong AnnualProgressUpdate.tsx)
      id: 'ps-1', name: 'Chấp thuận chủ trương', slaDays: 30, isMilestone: true,
      childSteps: [
        { id: 'cs-1', name: 'Thẩm định chủ trương đầu tư', agency: 'Sở Xây Dựng', slaDays: 15 },
        { id: 'cs-2', name: 'Trình UBND TP phê duyệt',    agency: 'Sở Xây Dựng', slaDays: 15 },
      ],
    },
    {
      id: 'ps-2', name: 'Quy hoạch 1/500', slaDays: 45,
      childSteps: [
        { id: 'cs-3', name: 'Lập đồ án quy hoạch', agency: 'Sở QHKT', slaDays: 30 },
        { id: 'cs-4', name: 'Thẩm định quy hoạch', agency: 'Sở QHKT', slaDays: 15 },
      ],
    },
  ],
};

const MOCK_AGENCY = { id: 'ag-1', name: 'Sở Xây Dựng', departments: [] };
// locationOptions trong CreateProject.tsx chỉ lấy department của agency tên đúng
// 'UBND cấp xã, phường' (địa bàn dự án nay gắn với 1 phường/xã cụ thể)
const MOCK_WARD_AGENCY = { id: 'ag-ubnd', name: 'UBND cấp xã, phường', departments: ['Phường Bình Tân'] };

const CREATED_PROJECT = {
  id: 'proj-e2e-001',
  code: 'NOXH-2026-E2E',
  name: 'Dự án Nhà ở xã hội Số 10',
  investor: 'Chưa có chủ đầu tư',
  location: 'Sở Xây Dựng',
  projectCategory: 'Bộ công an',
  processId: 'proc-e2e',
  totalArea: 0.55,
  height: 18,
  apartmentCount: 300,
  totalInvestment: 500,
  startDate: '2026-01-01',
  endDate: '2028-12-31',
  deadline: '2028-12-31',
  progress: 0,
  status: 'On Track',
  stage: 'CHUẨN BỊ ĐẦU TƯ',
  currentStep: 'Thẩm định chủ trương đầu tư',
  parentStep: 'Chấp thuận chủ trương',
  childStep: 'Thẩm định chủ trương đầu tư',
  currentAgency: 'Sở Xây Dựng',
  isKeyProject: false,
  isPublicInvestment: false,
  chutruong_cdt_date: '25/5/26',
  chutruong_nn_date: '14/7/26',
  qh1500_cdt_date: '15/7/26',
  qh1500_nn_date: '23/7/26',
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
  milestones: { 'cs-1': { investor: '2026-01-15', agency: '2026-02-01' } },
  implementationPlan: {},
  files: [],
  processSteps: [
    { id: 'cs-1', name: 'Thẩm định chủ trương đầu tư', agency: 'Sở Xây Dựng', status: 'pending' },
    { id: 'cs-2', name: 'Trình UBND TP phê duyệt',    agency: 'Sở Xây Dựng', status: 'pending' },
    { id: 'cs-3', name: 'Lập đồ án quy hoạch',        agency: 'Sở QHKT',     status: 'pending' },
    { id: 'cs-4', name: 'Thẩm định quy hoạch',        agency: 'Sở QHKT',     status: 'pending' },
  ],
};

// ─── Import components ────────────────────────────────────────────────────────
import CreateProject        from '../../src/components/CreateProject';
import GanttDashboardNOXH  from '../../src/components/GanttDashboardNOXH';
import { computeMilestones, legacyValuesFor } from '../../src/lib/stepProgress';

// Gantt: cột = danh mục mốc, số liệu = milestoneProgress do server tính (đây: từ cột mốc cũ + tiến độ cũ)
const STAGES_RAW = [{ name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'QĐ Giao đất', 'ĐN HTKT', 'BC NCKT', 'TD PCCC', 'GPXD'] }];
const progressOf = (projects: any[], actual: Record<string, any> = {}) => Object.fromEntries(
  projects.map(p => [p.id, computeMilestones(null, STAGES_RAW, {}, m => legacyValuesFor(p, actual[p.id] || {}, m.name))])
);
import ProjectList          from '../../src/components/ProjectList';
import AnnualProgressUpdate from '../../src/components/AnnualProgressUpdate';
import UpdateProgress       from '../../src/components/UpdateProgress';
import ProjectDetail        from '../../src/components/ProjectDetail';

// ─── Helper ───────────────────────────────────────────────────────────────────
// SearchableSelect (div-based combobox, không phải <select> thật): click để mở
// dropdown rồi click vào option theo label.
function selectSearchable(currentText: string, optionLabel: string) {
  fireEvent.click(screen.getByText(currentText));
  const matches = screen.getAllByText(optionLabel);
  const option = matches.find(el => el.className.includes('cursor-pointer')) || matches[0];
  fireEvent.click(option);
}

function fillRequiredFields(projectName = 'Dự án test E2E') {
  fireEvent.change(
    screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i),
    { target: { value: projectName } }
  );
  selectSearchable('Chọn quy trình...', 'Quy trình NOXH E2E');
  // Click "Chưa có chủ đầu tư" checkbox → investor select disappears
  fireEvent.click(screen.getByRole('checkbox', { name: /Chưa có chủ đầu tư/i }));
  // Địa điểm (location select nay chỉ liệt kê department của agency 'UBND cấp xã, phường')
  selectSearchable('Chọn phường/xã...', 'Phường Bình Tân');
  selectSearchable('Chọn phân loại...', 'Bộ công an');
}

// =============================================================================
// BƯỚC 1 – Tạo dự án mới
// =============================================================================
describe('Bước 1 – Tạo dự án mới (CreateProject)', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    investors: ['Chưa có chủ đầu tư', 'Công ty ABC'],
    locations: [{ ward: 'Phường 1', oldArea: 'Quận 1' }],
    projectGroups: ['Nhóm A'],
    fundingSources: ['Ngân sách nhà nước'],
    projectStages: ['CHUẨN BỊ ĐẦU TƯ'],
    processingAgencies: [MOCK_AGENCY, MOCK_WARD_AGENCY],
    processes: [MOCK_PROCESS],
    followers: ['Nguyễn Văn A'],
    buildingGrades: ['Cấp I'],
    projectCategories: ['Bộ công an', 'Địa phương'],
    projectStatuses: ['On Track', 'Delayed'],
  };

  beforeEach(() => vi.clearAllMocks());

  it('1.1 – Hiển thị form tạo dự án với tiêu đề đúng', () => {
    render(<CreateProject {...defaultProps} />);
    expect(screen.getByText(/Khởi tạo Dự án NOXH mới/i)).toBeInTheDocument();
  });

  it('1.2 – Tự động sinh mã dự án', () => {
    render(<CreateProject {...defaultProps} />);
    expect(screen.getByDisplayValue(/^NOXH-\d{4}-\d{4}$/)).toBeInTheDocument();
  });

  it('1.3 – Validation: submit rỗng → onSuccess không được gọi', async () => {
    render(<CreateProject {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Khởi tạo dự án/i }));
    await waitFor(() => {
      expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    });
  });

  it('1.4 – Validation: diện tích âm → lỗi', async () => {
    render(<CreateProject {...defaultProps} />);
    fireEvent.change(
      screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i),
      { target: { value: 'Dự án test' } }
    );
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Khởi tạo dự án/i }));
        // Thông báo hiện tại: src/components/CreateProject.tsx validateForm ("Diện tích không được âm")
    await waitFor(() => {
      expect(screen.getByText(/Diện tích không được âm/i)).toBeInTheDocument();
    });
  });

  it('1.5 – Submit hợp lệ: onSuccess được gọi với object dự án đúng', async () => {
    render(<CreateProject {...defaultProps} />);
    fillRequiredFields('Dự án Nhà ở xã hội Số 10');
    fireEvent.click(screen.getByRole('button', { name: /Khởi tạo dự án/i }));
    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });
    const arg = defaultProps.onSuccess.mock.calls[0][0];
    expect(arg).toMatchObject({
      name: 'Dự án Nhà ở xã hội Số 10',
      investor: 'Chưa có chủ đầu tư',
      location: 'Phường Bình Tân',
      projectCategory: 'Bộ công an',
      processId: 'proc-e2e',
    });
    expect(typeof arg.progress).toBe('number');
    expect(arg.currentStep).toBeDefined();
    expect(arg.status).toBeDefined();
  });

  it('1.6 – Nút Hủy bỏ gọi onClose', () => {
    render(<CreateProject {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Hủy bỏ/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('1.7 – Chế độ chỉnh sửa: pre-fill mã dự án và tên', () => {
    render(<CreateProject {...defaultProps} project={CREATED_PROJECT} />);
    expect(screen.getByDisplayValue('NOXH-2026-E2E')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
  });

  it('1.8 – Chế độ chỉnh sửa: tiêu đề thay đổi', () => {
    render(<CreateProject {...defaultProps} project={CREATED_PROJECT} />);
    expect(screen.getByText(/Cập nhật thông tin Dự án/i)).toBeInTheDocument();
  });
});

// =============================================================================
// BƯỚC 2 – Gantt NOXH
// =============================================================================
describe('Bước 2 – GanttDashboardNOXH hiển thị dự án vừa tạo', () => {
  beforeEach(() => localStorage.clear());

  const ganttProps = {
    projects: [CREATED_PROJECT],
    reportDate: '2026-06-16',
    projectStatuses: ['On Track', 'Delayed'],
    projectStages: ['CHUẨN BỊ ĐẦU TƯ'],
    projectStagesRaw: STAGES_RAW,
    milestoneProgress: progressOf([CREATED_PROJECT]),
  };

  it('2.1 – Render không crash', () => {
    expect(() => render(<GanttDashboardNOXH {...ganttProps} />)).not.toThrow();
  });

  it('2.2 – Hiển thị tên dự án', async () => {
    render(<GanttDashboardNOXH {...ganttProps} />);
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
    });
  });

  it('2.3 – Hiển thị mã dự án', async () => {
    render(<GanttDashboardNOXH {...ganttProps} />);
    await waitFor(() => {
      expect(screen.getByText('NOXH-2026-E2E')).toBeInTheDocument();
    });
  });

  it('2.4 – Hiển thị ngày kế hoạch CĐT (25/05/2026)', async () => {
    render(<GanttDashboardNOXH {...ganttProps} />);
    await waitFor(() => {
      expect(screen.getAllByText('25/05/2026').length).toBeGreaterThan(0);
    });
  });

  it('2.5 – Tìm kiếm theo tên lọc đúng dự án', async () => {
    const p2 = { ...CREATED_PROJECT, id: 'p2', code: 'P2', name: 'Dự án khác hoàn toàn' };
    render(<GanttDashboardNOXH {...ganttProps} projects={[CREATED_PROJECT, p2]} />);
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
    });
    fireEvent.change(
      screen.getByPlaceholderText('Tìm mã dự án, tên dự án, bước hiện tại...'),
      { target: { value: 'Số 10' } }
    );
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
      expect(screen.queryByText('Dự án khác hoàn toàn')).not.toBeInTheDocument();
    });
  });

  it('2.6 – Danh sách rỗng không hiển thị dự án', async () => {
    render(<GanttDashboardNOXH {...ganttProps} projects={[]} />);
    await waitFor(() => {
      expect(screen.queryByText('Dự án Nhà ở xã hội Số 10')).not.toBeInTheDocument();
    });
  });

  it('2.7 – onProjectClick được gọi khi click tên dự án', async () => {
    const onProjectClick = vi.fn();
    render(<GanttDashboardNOXH {...ganttProps} onProjectClick={onProjectClick} />);
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Dự án Nhà ở xã hội Số 10'));
    expect(onProjectClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj-e2e-001' }));
  });

  it('2.8 – Render nhiều dự án không crash', () => {
    const p2 = { ...CREATED_PROJECT, id: 'p2', code: 'P2', name: 'Dự án B' };
    expect(() =>
      render(<GanttDashboardNOXH {...ganttProps} projects={[CREATED_PROJECT, p2]} />)
    ).not.toThrow();
  });
});

// =============================================================================
// BƯỚC 3 – Danh sách dự án
// =============================================================================
describe('Bước 3 – ProjectList hiển thị dự án vừa tạo', () => {
  const listProps = {
    projects: [CREATED_PROJECT],
    onProjectClick: vi.fn(),
    onEditClick: vi.fn(),
    onDeleteClick: vi.fn(),
    onUpdateProgressClick: vi.fn(),
    onHousingUpdateClick: vi.fn(),
    onCreateClick: vi.fn(),
    processes: [MOCK_PROCESS],
    processingAgencies: [MOCK_AGENCY],
        projectCategories: ['Bộ công an'],
    projectStages: ['CHUẨN BỊ ĐẦU TƯ'],
    // Nút Khởi tạo / Sửa / Xóa chỉ hiện cho Sở Xây dựng hoặc Admin (src/components/ProjectList.tsx isSxdOrAdmin)
    currentUser: { id: 'u-sxd', roleId: 'Lãnh đạo', userType: 'agency', agencyId: '1' },
  };

  beforeEach(() => vi.clearAllMocks());

  it('3.1 – Render không crash', () => {
    expect(() => render(<ProjectList {...listProps} />)).not.toThrow();
  });

  it('3.2 – Tên dự án xuất hiện trong danh sách', () => {
    render(<ProjectList {...listProps} />);
    expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
  });

  it('3.3 – Mã dự án và địa điểm hiển thị đúng', () => {
    render(<ProjectList {...listProps} />);
    expect(screen.getByText('NOXH-2026-E2E')).toBeInTheDocument();
    expect(screen.getAllByText(/Sở Xây Dựng/i).length).toBeGreaterThan(0);
  });

  it('3.4 – Bước hiện tại hiển thị trong step card', () => {
    render(<ProjectList {...listProps} />);
    expect(screen.getAllByText('Thẩm định chủ trương đầu tư').length).toBeGreaterThan(0);
  });

  it('3.5 – Tìm kiếm theo tên lọc đúng', async () => {
    const p2 = { ...CREATED_PROJECT, id: 'p2', code: 'P2', name: 'Khu dân cư Bình Dương' };
    render(<ProjectList {...listProps} projects={[CREATED_PROJECT, p2]} />);
    fireEvent.change(
      screen.getByPlaceholderText('Tìm kiếm dự án...'),
      { target: { value: 'Số 10' } }
    );
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
      expect(screen.queryByText('Khu dân cư Bình Dương')).not.toBeInTheDocument();
    });
  });

    it('3.6 – Click nút chỉnh sửa (title "Sửa") gọi onEditClick', () => {
    render(<ProjectList {...listProps} />);
    // Nút chỉ có icon, nhận diện bằng title (không dựa vào class của icon)
    const editBtns = screen.getAllByTitle('Sửa');
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    expect(listProps.onEditClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj-e2e-001' }));
  });

  it('3.7 – Nút tạo mới gọi onCreateClick', () => {
        render(<ProjectList {...listProps} />);
    const createBtn = screen.getByRole('button', { name: /Khởi tạo Dự án/i });
    fireEvent.click(createBtn);
    expect(listProps.onCreateClick).toHaveBeenCalledTimes(1);
  });

  it('3.8 – Danh sách rỗng không crash', () => {
    render(<ProjectList {...listProps} projects={[]} />);
    expect(screen.queryByText('Dự án Nhà ở xã hội Số 10')).not.toBeInTheDocument();
  });
});

// =============================================================================
// BƯỚC 4 – Cập nhật tiến độ năm
// =============================================================================
describe('Bước 4 – AnnualProgressUpdate', () => {
  const annualProps = {
    projects: [CREATED_PROJECT],
    reportDate: '16/06/2026',
    setReportDate: vi.fn(),
    onUpdateProject: vi.fn(),
    processes: [MOCK_PROCESS],
    // Cột mốc lấy từ danh mục Giai đoạn & Mốc; giá trị từ milestone view của server
    projectStages: STAGES_RAW,
    milestoneProgress: progressOf([CREATED_PROJECT]),
  };

  beforeEach(() => vi.clearAllMocks());

  it('4.1 – Render không crash', () => {
    expect(() => render(<AnnualProgressUpdate {...annualProps} />)).not.toThrow();
  });

  it('4.2 – Dự án hiển thị trong bảng', () => {
    render(<AnnualProgressUpdate {...annualProps} />);
    expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
  });

  it('4.3 – Header cột mốc "chủ trương" hiển thị', () => {
    render(<AnnualProgressUpdate {...annualProps} />);
    // Tên cột = tên mốc trong danh mục Cấu hình Giai đoạn & Mốc Milestone
    expect(screen.getByText('Chấp thuận chủ trương')).toBeInTheDocument();
  });

  it('4.4 – Ngày kế hoạch 25/05/2026 hiển thị', () => {
    render(<AnnualProgressUpdate {...annualProps} />);
    expect(screen.getByText('25/05/2026')).toBeInTheDocument();
  });

  it('4.5 – Nút cập nhật tiến độ mở modal', async () => {
    render(<AnnualProgressUpdate {...annualProps} />);
    fireEvent.click(screen.getByTitle('Cập nhật tiến độ'));
    await waitFor(() => {
      expect(screen.getByText('Cập nhật tiến độ dự án')).toBeInTheDocument();
    });
  });

  it('4.6 – Tìm kiếm theo tên dự án', () => {
    const p2 = { ...CREATED_PROJECT, id: 'p2', code: 'P2', name: 'Dự án khác' };
    render(<AnnualProgressUpdate {...annualProps} projects={[CREATED_PROJECT, p2]} />);
    fireEvent.change(
      screen.getByPlaceholderText('Tìm dự án, mã dự án...'),
      { target: { value: 'Số 10' } }
    );
    expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
    expect(screen.queryByText('Dự án khác')).not.toBeInTheDocument();
  });
});

// =============================================================================
// BƯỚC 5 – Cập nhật tiến độ bước
// =============================================================================
describe('Bước 5 – UpdateProgress', () => {
  const onClose   = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('5.1 – Render không crash', () => {
    expect(() =>
      render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />)
    ).not.toThrow();
  });

  it('5.2 – Hiển thị tên dự án', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
  });

  it('5.3 – Hiển thị các bước quy trình', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText('Thẩm định chủ trương đầu tư')).toBeInTheDocument();
    expect(screen.getByText('Trình UBND TP phê duyệt')).toBeInTheDocument();
    expect(screen.getByText('Lập đồ án quy hoạch')).toBeInTheDocument();
    expect(screen.getByText('Thẩm định quy hoạch')).toBeInTheDocument();
  });

  it('5.4 – Hiển thị cơ quan xử lý của ít nhất một bước', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    // currentAgency or step.agency shown somewhere
    expect(screen.getAllByText(/Sở Xây Dựng|Sở QHKT/i).length).toBeGreaterThanOrEqual(1);
  });

  it('5.5 – Click "Hoàn tất" cập nhật trạng thái bước', async () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    const btns = screen.getAllByRole('button', { name: /Hoàn tất/i });
    fireEvent.click(btns[0]);
    await waitFor(() => {
      expect(btns[0]).toHaveClass('bg-emerald-50');
    });
  });

  it('5.6 – Nút "Lưu thay đổi" gọi onSuccess với processSteps đã cập nhật', async () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    const hoanTatBtns = screen.getAllByRole('button', { name: /Hoàn tất/i });
    fireEvent.click(hoanTatBtns[0]);
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });
    const updated = onSuccess.mock.calls[0][0];
    expect(updated.processSteps).toBeDefined();
    expect(updated.processSteps[0].status).toBe('completed');
  });

  it('5.7 – Click "Đang xử lý" cập nhật class bg-blue-50', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    const btns = screen.getAllByRole('button', { name: /Đang xử lý/i });
    fireEvent.click(btns[0]);
    expect(btns[0]).toHaveClass('bg-blue-50');
  });

  it('5.8 – Click "Quá hạn" cập nhật class bg-rose-50', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    const btns = screen.getAllByRole('button', { name: /Quá hạn/i });
    fireEvent.click(btns[0]);
    expect(btns[0]).toHaveClass('bg-rose-50');
  });

  it('5.9 – Nút "Hủy bỏ" gọi onClose', () => {
    render(<UpdateProgress project={CREATED_PROJECT} onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: /Hủy bỏ/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// BƯỚC 6 – Gantt sau cập nhật
// =============================================================================
describe('Bước 6 – GanttDashboardNOXH sau khi cập nhật tiến độ', () => {
  beforeEach(() => localStorage.clear());

  const actualProgress: Record<string, any> = {
    'proj-e2e-001': {
      chutruong: { cdtDate: '2026-05-25', nnDate: '2026-07-14' },
      qh1500:  { cdtDate: '', nnDate: '' },
      giaodat: { cdtDate: '', nnDate: '' },
      htkt:    { cdtDate: '', nnDate: '' },
      bcnckt:  { cdtDate: '', nnDate: '' },
      pccc:    { cdtDate: '', nnDate: '' },
      gpxd:    { cdtDate: '', nnDate: '' },
    },
  };

  it('6.1 – Render với actualProgress không crash', () => {
    expect(() =>
      render(
        <GanttDashboardNOXH
          projects={[CREATED_PROJECT]}
          reportDate="2026-06-16"
          projectStatuses={['On Track']}
          projectStages={['CHUẨN BỊ ĐẦU TƯ']}
          actualProgress={actualProgress}
        />
      )
    ).not.toThrow();
  });

  it('6.2 – Tên dự án vẫn hiển thị sau cập nhật', async () => {
    render(
      <GanttDashboardNOXH
        projects={[CREATED_PROJECT]}
        reportDate="2026-06-16"
        projectStatuses={['On Track']}
        projectStages={['CHUẨN BỊ ĐẦU TƯ']}
        actualProgress={actualProgress}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
    });
  });

  it('6.3 – Ngày 25/05/2026 vẫn hiển thị (cả KH lẫn TĐ)', async () => {
    render(
      <GanttDashboardNOXH
        projects={[CREATED_PROJECT]}
        reportDate="2026-06-16"
        projectStatuses={['On Track']}
        projectStages={['CHUẨN BỊ ĐẦU TƯ']}
        projectStagesRaw={STAGES_RAW}
        milestoneProgress={progressOf([CREATED_PROJECT], actualProgress)}
        actualProgress={actualProgress}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText('25/05/2026').length).toBeGreaterThan(0);
    });
  });

  it('6.4 – Legend "Quá hạn" luôn hiển thị trong bảng', async () => {
    render(
      <GanttDashboardNOXH
        projects={[CREATED_PROJECT]}
        reportDate="2026-06-16"
        projectStatuses={['On Track', 'Delayed']}
        projectStages={['CHUẨN BỊ ĐẦU TƯ']}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Quá hạn/i).length).toBeGreaterThan(0);
    });
  });

  it('6.5 – Mã dự án vẫn hiển thị sau cập nhật', async () => {
    render(
      <GanttDashboardNOXH
        projects={[CREATED_PROJECT]}
        reportDate="2026-06-16"
        projectStatuses={['On Track']}
        projectStages={['CHUẨN BỊ ĐẦU TƯ']}
        actualProgress={actualProgress}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('NOXH-2026-E2E')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// BƯỚC 7 – Chi tiết dự án
// =============================================================================
describe('Bước 7 – ProjectDetail', () => {
  const onClose = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('7.1 – Render không crash', () => {
    expect(() => render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />)).not.toThrow();
  });

  it('7.2 – Hiển thị tên dự án', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('Dự án Nhà ở xã hội Số 10')).toBeInTheDocument();
  });

  it('7.3 – Hiển thị mã dự án', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('NOXH-2026-E2E')).toBeInTheDocument();
  });

  it('7.4 – Hiển thị địa điểm hoặc cơ quan', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getAllByText('Sở Xây Dựng').length).toBeGreaterThan(0);
  });

  it('7.5 – Hiển thị chủ đầu tư', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('Chưa có chủ đầu tư')).toBeInTheDocument();
  });

  it('7.6 – Hiển thị badge trạng thái "Đang xử lý"', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
  });

  it('7.7 – Có đủ 4 tab điều hướng', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Tổng quan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiến độ thực hiện/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hồ sơ dự án/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nhật ký/i })).toBeInTheDocument();
  });

  it('7.8 – Tab Tổng quan: hiển thị chỉ số quy mô', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('0.55 ha')).toBeInTheDocument();
    expect(screen.getByText('18 tầng')).toBeInTheDocument();
    expect(screen.getByText('300 căn')).toBeInTheDocument();
    expect(screen.getByText('500 Tỷ')).toBeInTheDocument();
  });

  it('7.9 – Tab Tổng quan: hiển thị bước đang thực hiện', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getByText('Thẩm định chủ trương đầu tư')).toBeInTheDocument();
  });

  it('7.10 – Tab Tổng quan: cơ quan chủ trì hiển thị', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    expect(screen.getAllByText('Sở Xây Dựng').length).toBeGreaterThan(0);
  });

  it('7.11 – Tab "Tiến độ thực hiện": hiển thị sơ đồ gantt tiến độ', async () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Tiến độ thực hiện/i }));
    await waitFor(() => {
      expect(screen.getByText(/Sơ đồ gantt tiến độ thực hiện/i)).toBeInTheDocument();
    });
  });

  it('7.12 – Nút X đóng modal gọi onClose', () => {
    render(<ProjectDetail project={CREATED_PROJECT} onClose={onClose} />);
    const allBtns = screen.getAllByRole('button');
    const closeBtn = allBtns.find(btn => !btn.textContent?.trim());
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('7.13 – isKeyProject = true hiển thị badge "Trọng điểm"', () => {
    const keyProject = { ...CREATED_PROJECT, isKeyProject: true };
    render(<ProjectDetail project={keyProject} onClose={onClose} />);
    expect(screen.getByText(/Trọng điểm/i)).toBeInTheDocument();
  });

  it('7.14 – Trả về null khi project là null', () => {
    const { container } = render(<ProjectDetail project={null} onClose={onClose} />);
    expect(container.firstChild).toBeNull();
  });
});

// =============================================================================
// LUỒNG TÍCH HỢP
// =============================================================================
describe('Luồng tích hợp – Nhất quán dữ liệu qua toàn bộ luồng', () => {
  it('INT-1 – Project từ CreateProject đủ trường để GanttDashboardNOXH render', async () => {
    const onSuccess = vi.fn();
    render(
      <CreateProject
        onClose={vi.fn()}
        onSuccess={onSuccess}
        investors={['Chưa có chủ đầu tư']}
        locations={[]}
        projectGroups={[]}
        fundingSources={[]}
        projectStages={[]}
        processingAgencies={[MOCK_AGENCY, MOCK_WARD_AGENCY]}
        processes={[MOCK_PROCESS]}
        followers={[]}
        buildingGrades={[]}
        projectCategories={['Bộ công an']}
        projectStatuses={[]}
      />
    );
    fillRequiredFields('Dự án Test Integration');
    fireEvent.click(screen.getByRole('button', { name: /Khởi tạo dự án/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const created = onSuccess.mock.calls[0][0];
    expect(created.name).toBe('Dự án Test Integration');
    expect(created.processId).toBe('proc-e2e');
    expect(typeof created.progress).toBe('number');
    expect(() =>
      render(
        <GanttDashboardNOXH
          projects={[{ ...created, id: 'int-001', code: 'INT-001' }]}
          reportDate="2026-06-16"
          projectStatuses={['On Track']}
          projectStages={['CHUẨN BỊ ĐẦU TƯ']}
        />
      )
    ).not.toThrow();
  });

  it('INT-2 – UpdateProgress "Lưu thay đổi" → ProjectDetail render đúng', async () => {
    const onUpdateSuccess = vi.fn();
    render(
      <UpdateProgress
        project={CREATED_PROJECT}
        onClose={vi.fn()}
        onSuccess={onUpdateSuccess}
      />
    );
    const hoanTatBtns = screen.getAllByRole('button', { name: /Hoàn tất/i });
    hoanTatBtns.forEach(btn => fireEvent.click(btn));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/i }));
    await waitFor(() => expect(onUpdateSuccess).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const updatedProject = onUpdateSuccess.mock.calls[0][0];
    expect(updatedProject.processSteps.every((s: any) => s.status === 'completed')).toBe(true);
    expect(() => render(<ProjectDetail project={updatedProject} onClose={vi.fn()} />)).not.toThrow();
  });

  it('INT-3 – Tất cả 7 component khởi tạo không crash', () => {
    const noop = vi.fn();
    const { unmount: u1 } = render(
      <CreateProject onClose={noop} onSuccess={noop} investors={[]} locations={[]} projectGroups={[]}
        fundingSources={[]} projectStages={[]} processingAgencies={[]} processes={[MOCK_PROCESS]}
        followers={[]} buildingGrades={[]} projectCategories={[]} projectStatuses={[]} />
    );
    u1();
    const { unmount: u2 } = render(
      <GanttDashboardNOXH projects={[CREATED_PROJECT]} reportDate="16/06/2026"
        projectStatuses={[]} projectStages={[]} />
    );
    u2();
    const { unmount: u3 } = render(
      <ProjectList projects={[CREATED_PROJECT]} processes={[MOCK_PROCESS]} />
    );
    u3();
    const { unmount: u4 } = render(
      <AnnualProgressUpdate projects={[CREATED_PROJECT]} reportDate="16/06/2026" setReportDate={noop} />
    );
    u4();
    const { unmount: u5 } = render(
      <UpdateProgress project={CREATED_PROJECT} onClose={noop} onSuccess={noop} />
    );
    u5();
    const { unmount: u6 } = render(
      <GanttDashboardNOXH projects={[CREATED_PROJECT]} reportDate="16/06/2026"
        projectStatuses={[]} projectStages={[]}
        actualProgress={{ 'proj-e2e-001': { chutruong: { cdtDate: '2026-05-25', nnDate: '2026-07-14' } } }} />
    );
    u6();
    const { unmount: u7 } = render(<ProjectDetail project={CREATED_PROJECT} onClose={noop} />);
    u7();
  });
});
