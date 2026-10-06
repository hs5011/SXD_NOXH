// @vitest-environment jsdom
/**
 * Component Tests: CreateProject
 *
 * Kiểm tra:
 *   - Render modal ở chế độ tạo mới và chế độ chỉnh sửa
 *   - Hiển thị các tab (1. THÔNG TIN CHUNG DỰ ÁN / 2. Kế hoạch thực hiện)
 *   - Validation: tên, nhà đầu tư, địa bàn, loại hình, quy trình bắt buộc
 *   - Nút Hủy gọi onClose
 *   - Submit hợp lệ gọi onSuccess
 *   - Tự động tạo mã dự án khi tạo mới
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import CreateProject from '../../src/components/CreateProject';

// ─── Mock external dependencies ───────────────────────────────────────────────

vi.mock('react-datepicker', () => ({
  default: ({ onChange, selected, placeholderText, className }: any) => (
    <input
      data-testid="datepicker"
      placeholder={placeholderText}
      className={className}
      value={selected ? selected.toISOString().split('T')[0] : ''}
      onChange={(e) => onChange && onChange(new Date(e.target.value))}
    />
  ),
  registerLocale: vi.fn(),
}));

vi.mock('../../src/components/StepManagementView.tsx', () => ({}));
vi.mock('../../src/components/AgencyManagement.tsx', () => ({}));

vi.mock('../../src/lib/projectUtils', async (importOriginal) => ({
  // Real helpers (toDisplayDate, getAgencyWithDepartment…) + the overrides below
  ...(await importOriginal<typeof import('../../src/lib/projectUtils')>()),
  calculateProjectStatus: vi.fn(() => ({
    progress: 0,
    currentStep: 'Bước 1',
    status: 'On Track',
    currentAgency: 'Sở XD',
    childStep: '',
    parentStep: ''
  })),
  parseDate: vi.fn(() => null),
  formatLocalDate: vi.fn(() => '2024-01-01'),
  syncDetailedToRoot: vi.fn((project: any) => project),
}));

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProcesses = [
  {
    id: 'proc-1',
    name: 'Quy trình NOXH',
    parentSteps: [
      {
        id: 'ps-1',
        name: 'Giai đoạn chuẩn bị',
        // Phải khớp với defaultProps.projectStages[0] ('Chuẩn bị đầu tư') để
        // CreateProject.tsx lọc đúng parentStepsInStage cho tab đang active
        stage: 'Chuẩn bị đầu tư',
        childSteps: [
          { id: 'cs-1', name: 'Chấp thuận chủ trương', agency: 'Sở XD' }
        ]
      }
    ]
  }
];

const mockAgencies = [
  { id: 'ag-1', name: 'Sở Xây Dựng', departments: ['Phòng QLXD'] },
  // locationOptions trong CreateProject.tsx chỉ lấy department của agency tên đúng
  // 'UBND cấp xã, phường' (địa bàn dự án nay gắn với 1 phường/xã cụ thể)
  { id: 'ag-6', name: 'UBND cấp xã, phường', departments: ['Phường Bến Nghé'] },
];

const defaultProps = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  project: undefined,
  investors: ['Công ty A', 'Công ty B'],
  locations: [{ ward: 'Bình Tân', oldArea: '' }],
  projectGroups: ['Nhóm 1', 'Nhóm 2'],
  fundingSources: ['Ngân sách', 'Vốn vay'],
  projectStages: ['Chuẩn bị đầu tư', 'Thực hiện'],
  processingAgencies: mockAgencies,
  processes: mockProcesses,
  followers: ['Nguyễn Văn A'],
  buildingGrades: ['Cấp I', 'Cấp II'],
  projectCategories: ['Loại A', 'Loại B'],
  projectStatuses: ['Đang thực hiện', 'Dừng'],
};

function renderCreateProject(overrideProps: Record<string, any> = {}) {
  const props = { ...defaultProps, onClose: vi.fn(), onSuccess: vi.fn(), ...overrideProps };
  return { ...render(<CreateProject {...props} />), props };
}

// ─── Helper: SearchableSelect (div-based combobox, không phải <select> thật) ──
// Click để mở dropdown rồi click vào option theo label. Nếu label bị trùng ở nơi
// khác trên trang, ưu tiên phần tử có class "cursor-pointer" (đặc trưng của option).
function selectSearchable(currentText: string, optionLabel: string) {
  fireEvent.click(screen.getByText(currentText));
  const matches = screen.getAllByText(optionLabel);
  const option = matches.find(el => el.className.includes('cursor-pointer')) || matches[0];
  fireEvent.click(option);
}

// ─── Helper: điền đủ các trường bắt buộc ────────────────────────────────────

function fillRequiredFields() {
  // Tên dự án
  fireEvent.change(
    screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i),
    { target: { value: 'Dự án Test NOXH' } }
  );
  // Chủ đầu tư
  selectSearchable('Chọn chủ đầu tư...', 'Công ty A');
  // Địa điểm (location select nay chỉ liệt kê department của agency 'UBND cấp xã, phường')
  selectSearchable('Chọn phường/xã...', 'Phường Bến Nghé');
  // Phân loại dự án
  selectSearchable('Chọn phân loại...', 'Loại A');
  // Quy trình (option label = tên quy trình, không phải id)
  selectSearchable('Chọn quy trình...', 'Quy trình NOXH');
}

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Render chế độ tạo mới', () => {
  it('render được mà không crash', () => {
    expect(() => renderCreateProject()).not.toThrow();
  });

  it('hiển thị tiêu đề "Khởi tạo Dự án NOXH mới"', () => {
    renderCreateProject();
    expect(screen.getByText('Khởi tạo Dự án NOXH mới')).toBeInTheDocument();
  });

  it('hiển thị tab "1. THÔNG TIN CHUNG DỰ ÁN"', () => {
    renderCreateProject();
    // Tab text có thể xuất hiện nhiều lần (button + heading) → kiểm tra button
    const tabBtn = screen.getByRole('button', { name: '1. THÔNG TIN CHUNG DỰ ÁN' });
    expect(tabBtn).toBeInTheDocument();
  });

  it('hiển thị tab "2. Kế hoạch thực hiện"', () => {
    renderCreateProject();
    expect(screen.getByRole('button', { name: '2. Kế hoạch thực hiện' })).toBeInTheDocument();
  });

  it('tự động tạo mã dự án (NOXH-XXXX-XXXX)', () => {
    renderCreateProject();
    const inputs = screen.getAllByRole('textbox');
    // Ô đầu tiên là mã dự án, có dạng NOXH-YYYY-XXXX
    const codeInput = inputs.find(inp =>
      /NOXH-\d{4}-\d{4}/.test((inp as HTMLInputElement).value)
    );
    expect(codeInput).toBeDefined();
  });

  it('hiển thị nút submit "Khởi tạo dự án"', () => {
    renderCreateProject();
    expect(screen.getByRole('button', { name: 'Khởi tạo dự án' })).toBeInTheDocument();
  });

  it('hiển thị ô nhập tên dự án', () => {
    renderCreateProject();
    expect(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Render chế độ chỉnh sửa', () => {
  const existingProject = {
    id: 'p-existing',
    code: 'NOXH-2023-999',
    name: 'Dự án Hiện có',
    investor: 'Công ty A',
    location: 'Sở Xây Dựng',
    projectCategory: 'Loại A',
    processId: 'proc-1',
    milestones: {},
    implementationPlan: {}
  };

  it('hiển thị tiêu đề "Cập nhật thông tin Dự án"', () => {
    renderCreateProject({ project: existingProject });
    expect(screen.getByText('Cập nhật thông tin Dự án')).toBeInTheDocument();
  });

  it('điền sẵn tên dự án hiện có', () => {
    renderCreateProject({ project: existingProject });
    expect(screen.getByDisplayValue('Dự án Hiện có')).toBeInTheDocument();
  });

  it('điền sẵn mã dự án hiện có', () => {
    renderCreateProject({ project: existingProject });
    expect(screen.getByDisplayValue('NOXH-2023-999')).toBeInTheDocument();
  });

  it('hiển thị nút submit "Cập nhật dự án"', () => {
    renderCreateProject({ project: existingProject });
    expect(screen.getByRole('button', { name: 'Cập nhật dự án' })).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Validation (đồng bộ)', () => {
  it('hiện lỗi khi tên dự án trống', () => {
    renderCreateProject();
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText('Tên dự án không được để trống')).toBeInTheDocument();
  });

  it('hiện lỗi khi chưa chọn chủ đầu tư', () => {
    renderCreateProject();
    // Điền tên để qua lỗi tên
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i), { target: { value: 'Tên test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText('Vui lòng chọn chủ đầu tư')).toBeInTheDocument();
  });

  it('hiện lỗi khi chưa chọn địa bàn', () => {
    renderCreateProject();
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i), { target: { value: 'Tên test' } });
    selectSearchable('Chọn chủ đầu tư...', 'Công ty A');
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText(/Vui lòng chọn địa điểm/i)).toBeInTheDocument();
  });

  it('hiện lỗi khi chưa chọn loại hình dự án', () => {
    renderCreateProject();
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i), { target: { value: 'Tên test' } });
    selectSearchable('Chọn chủ đầu tư...', 'Công ty A');
    selectSearchable('Chọn phường/xã...', 'Phường Bến Nghé');
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText(/Vui lòng chọn loại hình dự án/i)).toBeInTheDocument();
  });

  it('hiện lỗi khi chưa chọn quy trình', () => {
    renderCreateProject();
    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i), { target: { value: 'Tên test' } });
    selectSearchable('Chọn chủ đầu tư...', 'Công ty A');
    selectSearchable('Chọn phường/xã...', 'Phường Bến Nghé');
    selectSearchable('Chọn phân loại...', 'Loại A');
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText(/Vui lòng chọn quy trình/i)).toBeInTheDocument();
  });

  it('không có lỗi khi tất cả trường bắt buộc đã điền', () => {
    renderCreateProject();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    // Không có lỗi name
    expect(screen.queryByText('Tên dự án không được để trống')).not.toBeInTheDocument();
    expect(screen.queryByText('Vui lòng chọn chủ đầu tư')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Submit hợp lệ', () => {
  it('submit hợp lệ gọi onSuccess', async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    render(<CreateProject {...defaultProps} onSuccess={onSuccess} />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    await vi.runAllTimersAsync();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('onSuccess được gọi với object chứa tên dự án', async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    render(<CreateProject {...defaultProps} onSuccess={onSuccess} />);

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    await vi.runAllTimersAsync();

    const [project] = onSuccess.mock.calls[0];
    expect(project.name).toBe('Dự án Test NOXH');
    expect(project.investor).toBe('Công ty A');
    vi.useRealTimers();
  });

  it('nút submit hiện "Đang xử lý..." trong lúc submit', async () => {
    vi.useFakeTimers();
    render(<CreateProject {...defaultProps} />);

    fillRequiredFields();

    const submitBtn = screen.getByRole('button', { name: 'Khởi tạo dự án' });
    fireEvent.click(submitBtn);

    // Sau click, saving=true → text đổi thành 'Đang xử lý...'
    expect(screen.getByText('Đang xử lý...')).toBeInTheDocument();

    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Tabs', () => {
  it('mặc định hiển thị tab Thông tin chung', () => {
    renderCreateProject();
    // Khi tab general active, tên dự án input hiển thị
    expect(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i)).toBeInTheDocument();
  });

  it('click tab "2. Kế hoạch thực hiện" chuyển sang tab đó', () => {
    renderCreateProject();
    const planTab = screen.getByRole('button', { name: '2. Kế hoạch thực hiện' });
    fireEvent.click(planTab);
    // Tab legal: hiển thị thông báo chọn quy trình hoặc bảng kế hoạch
    expect(screen.getByText(/Vui lòng chọn quy trình/i)).toBeInTheDocument();
  });

  it('click lại tab "1. THÔNG TIN CHUNG DỰ ÁN" hiển thị lại form', () => {
    renderCreateProject();
    fireEvent.click(screen.getByRole('button', { name: '2. Kế hoạch thực hiện' }));
    fireEvent.click(screen.getByRole('button', { name: '1. THÔNG TIN CHUNG DỰ ÁN' }));
    expect(screen.getByPlaceholderText(/Ví dụ: Dự án Nhà ở xã hội/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Nút Hủy bỏ', () => {
  it('click "Hủy bỏ" gọi onClose', () => {
    const onClose = vi.fn();
    renderCreateProject({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Checkbox đặc biệt', () => {
  it('"Dự án trọng điểm" mặc định không tick', () => {
    renderCreateProject();
    const cb = screen.getByRole('checkbox', { name: /Dự án trọng điểm/i });
    expect(cb).not.toBeChecked();
  });

  it('tick "Dự án trọng điểm" → checkbox được check', () => {
    renderCreateProject();
    const cb = screen.getByRole('checkbox', { name: /Dự án trọng điểm/i });
    fireEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it('tick "Chưa có chủ đầu tư" → ẩn select chủ đầu tư', () => {
    renderCreateProject();
    expect(screen.getByText('Chọn chủ đầu tư...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Chưa có chủ đầu tư/i }));
    expect(screen.queryByText('Chọn chủ đầu tư...')).not.toBeInTheDocument();
  });

  it('bỏ tick "Chưa có chủ đầu tư" → hiện lại select chủ đầu tư', () => {
    renderCreateProject();
    const cb = screen.getByRole('checkbox', { name: /Chưa có chủ đầu tư/i });
    fireEvent.click(cb); // check → ẩn select
    fireEvent.click(cb); // uncheck → hiện lại
    expect(screen.getByText('Chọn chủ đầu tư...')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Validation số học', () => {
  // Thông báo hiện tại: src/components/CreateProject.tsx:445 ("Diện tích không được âm")
  it('diện tích âm hiển thị lỗi "Diện tích không được âm"', () => {
    renderCreateProject();
    fillRequiredFields();
    // getAllByPlaceholderText('0.00')[0] là input totalArea (xuất hiện đầu tiên trong grid)
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.getByText('Diện tích không được âm')).toBeInTheDocument();
  });

  it('diện tích dương hợp lệ → không có lỗi totalArea', () => {
    renderCreateProject();
    fillRequiredFields();
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Khởi tạo dự án' }));
    expect(screen.queryByText('Diện tích không được âm')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Vùng đính kèm file', () => {
  it('hiển thị "Chưa có tài liệu" khi chưa upload', () => {
    renderCreateProject();
    expect(screen.getByText('Chưa có tài liệu')).toBeInTheDocument();
  });

  it('hiển thị "0 file" khi chưa upload', () => {
    renderCreateProject();
    expect(screen.getByText('0 file')).toBeInTheDocument();
  });

  it('hiển thị vùng kéo thả "Kéo thả hoặc nhấp để tải lên"', () => {
    renderCreateProject();
    expect(screen.getByText('Kéo thả hoặc nhấp để tải lên')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('CreateProject – Tab 2 khi đã chọn quy trình', () => {
  it('tab 2 hiển thị banner giai đoạn đang active', () => {
    renderCreateProject();
    selectSearchable('Chọn quy trình...', 'Quy trình NOXH');
    fireEvent.click(screen.getByRole('button', { name: '2. Kế hoạch thực hiện' }));
    // Banner hiển thị "Giai đoạn: {activeStageTab}" — mặc định là projectStages[0]
    expect(screen.getByText(/Giai đoạn:\s*Chuẩn bị đầu tư/i)).toBeInTheDocument();
  });

  it('tab 2 hiển thị tên bước con của quy trình', () => {
    renderCreateProject();
    selectSearchable('Chọn quy trình...', 'Quy trình NOXH');
    fireEvent.click(screen.getByRole('button', { name: '2. Kế hoạch thực hiện' }));
    expect(screen.getByText('Chấp thuận chủ trương')).toBeInTheDocument();
  });

  it('tab 2 hiển thị header cột "Hạn CĐT" và "Hạn Cơ quan NN"', () => {
    renderCreateProject();
    selectSearchable('Chọn quy trình...', 'Quy trình NOXH');
    fireEvent.click(screen.getByRole('button', { name: '2. Kế hoạch thực hiện' }));
    expect(screen.getByText('Hạn CĐT')).toBeInTheDocument();
    expect(screen.getByText('Hạn Cơ quan NN')).toBeInTheDocument();
  });
});
