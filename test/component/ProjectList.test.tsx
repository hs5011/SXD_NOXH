// @vitest-environment jsdom
/**
 * Component Tests: ProjectList
 *
 * Kiểm tra:
 *   - Render danh sách dự án và tiêu đề
 *   - Lọc theo từ khóa tìm kiếm (tên, mã, nhà đầu tư)
 *   - Lọc bằng cách thay đổi các ô select filter trên giao diện
 *   - Kết hợp nhiều bộ lọc
 *   - Nút Tạo mới gọi onCreateClick
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import ProjectList from '../../src/components/ProjectList';

// ─── Mock modules ─────────────────────────────────────────────────────────────

vi.mock('../../src/components/StepManagementView.tsx', () => ({}));
vi.mock('../../src/components/AgencyManagement.tsx', () => ({}));

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProcesses = [
  {
    id: 'proc-1',
    name: 'Quy trình NOXH',
    parentSteps: [
      {
        id: 'ps-1',
        name: 'Giai đoạn 1',
        stage: 'Chuẩn bị',
        childSteps: [
          { id: 'cs-1', name: 'Chấp thuận chủ trương', agency: 'Sở Xây Dựng' }
        ]
      }
    ]
  }
];

const mockAgencies = [
  { id: 'loc-1', name: 'Bình Tân', departments: [] },
  { id: 'loc-2', name: 'Quận 7', departments: [] },
];

const mockProjects = [
  {
    id: 'p1',
    code: 'NOXH-2024-001',
    name: 'Nhà Ở Xã Hội Bình Tân',
    investor: 'Công ty A',
    location: 'Bình Tân',
    processId: 'proc-1',
    projectGroup: 'Nhóm 1',
    fundingSource: 'Ngân sách',
    follower: 'Nguyễn Văn A',
    stage: 'Chuẩn bị đầu tư',
    status: 'On Track',
    projectCategory: 'Loại 1',
    currentStep: 'Chấp thuận chủ trương',
    progress: 30,
    milestones: {},
    implementationPlan: {}
  },
  {
    id: 'p2',
    code: 'NOXH-2024-002',
    name: 'Nhà Ở Xã Hội Quận 7',
    investor: 'Công ty B',
    location: 'Quận 7',
    processId: 'proc-1',
    projectGroup: 'Nhóm 2',
    fundingSource: 'Vốn vay',
    follower: 'Trần Thị B',
    stage: 'Thực hiện',
    status: 'Delayed',
    projectCategory: 'Loại 2',
    currentStep: 'Quy hoạch 1/500',
    progress: 60,
    milestones: {},
    implementationPlan: {}
  },
  {
    id: 'p3',
    code: 'NOXH-2024-003',
    name: 'Chung Cư Tân Phú',
    investor: 'Công ty A',
    location: 'Tân Phú',
    processId: 'proc-1',
    projectGroup: 'Nhóm 1',
    fundingSource: 'Ngân sách',
    follower: 'Nguyễn Văn A',
    stage: 'Chuẩn bị đầu tư',
    status: 'On Track',
    projectCategory: 'Loại 1',
    currentStep: 'Chấp thuận chủ trương',
    progress: 10,
    milestones: {},
    implementationPlan: {}
  }
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderProjectList(overrideProps: Record<string, any> = {}) {
  const defaultProps = {
    projects: mockProjects,
    onProjectClick: vi.fn(),
    onEditClick: vi.fn(),
    onDeleteClick: vi.fn(),
    onUpdateProgressClick: vi.fn(),
    onCreateClick: vi.fn(),
    filter: {},
    projectStages: ['Chuẩn bị đầu tư', 'Thực hiện'],
    processingAgencies: mockAgencies,
    locations: [],
    processes: mockProcesses,
    projectGroups: ['Nhóm 1', 'Nhóm 2'],
    fundingSources: ['Ngân sách', 'Vốn vay'],
    followers: ['Nguyễn Văn A', 'Trần Thị B'],
    investors: ['Công ty A', 'Công ty B'],
    projectCategories: ['Loại 1', 'Loại 2'],
  };
  return render(<ProjectList {...defaultProps} {...overrideProps} />);
}

// SearchableSelect (div-based combobox, không phải <select> thật): click để mở,
// rồi click vào option cần chọn. Nhãn option đôi khi trùng với text hiển thị ở nơi
// khác trên trang (badge bước, tên nhóm...) nên ưu tiên phần tử có class "cursor-pointer"
// (đặc trưng của option trong danh sách dropdown).
function selectSearchable(currentText: string, optionLabel: string) {
  fireEvent.click(screen.getByText(currentText));
  const matches = screen.getAllByText(optionLabel);
  const option = matches.find(el => el.className.includes('cursor-pointer')) || matches[0];
  fireEvent.click(option);
}

// Nút X xóa lựa chọn nằm cùng hàng với nhãn hiện tại của SearchableSelect.
// Nhãn đã chọn có class "font-medium" (xem SearchableSelect.tsx) — phân biệt với
// badge/nhóm trùng text ở nơi khác trên trang.
function clearSearchable(currentText: string) {
  const matches = screen.getAllByText(currentText);
  const label = matches.find(el => el.className.includes('font-medium')) || matches[0];
  const row = label.closest('div')!;
  const clearBtn = row.querySelector('button')!;
  fireEvent.click(clearBtn);
}

// Nguồn vốn / Phân loại dự án / Người theo dõi / Cơ quan-Phòng ban / Chủ đầu tư / Thủ tục
// chỉ hiển thị sau khi mở panel "Bộ lọc"
function openFilterPanel() {
  fireEvent.click(screen.getByRole('button', { name: /^Bộ lọc$/i }));
}

// "Đang hiển thị N dự án" — số N nằm trong <span> con nên bị tách thành nhiều text node,
// cần matcher function so khớp textContent của phần tử cha thay vì so nguyên văn.
function expectProjectCount(n: number) {
  const expected = `Đang hiển thị ${n} dự án`;
  expect(screen.getByText((_, el) => {
    if (!el || el.textContent !== expected) return false;
    return Array.from(el.children).every(child => child.textContent !== expected);
  })).toBeInTheDocument();
}

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Render cơ bản', () => {
  it('render được mà không crash', () => {
    expect(() => renderProjectList()).not.toThrow();
  });

  it('hiển thị tên các dự án', () => {
    renderProjectList();
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
  });

  it('hiển thị mã dự án', () => {
    renderProjectList();
    expect(screen.getByText('NOXH-2024-001')).toBeInTheDocument();
  });

  it('hiển thị số lượng dự án đang hiển thị', () => {
    renderProjectList();
    expectProjectCount(3);
  });

  it('hiển thị thông báo khi không có dự án', () => {
    renderProjectList({ projects: [] });
    expectProjectCount(0);
  });

  it('hiển thị ô tìm kiếm', () => {
    renderProjectList();
    expect(screen.getByPlaceholderText('Tìm kiếm dự án...')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Lọc theo từ khóa (search input)', () => {
  it('lọc theo tên dự án', () => {
    renderProjectList();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm dự án...'), { target: { value: 'Bình Tân' } });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
    expect(screen.queryByText('Chung Cư Tân Phú')).not.toBeInTheDocument();
  });

  it('lọc theo mã dự án', () => {
    renderProjectList();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm dự án...'), { target: { value: 'NOXH-2024-002' } });
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('lọc theo nhà đầu tư (search)', () => {
    renderProjectList();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm dự án...'), { target: { value: 'Công ty B' } });
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('tìm không phân biệt hoa thường', () => {
    renderProjectList();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm dự án...'), { target: { value: 'nhà ở xã hội' } });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Chung Cư Tân Phú')).not.toBeInTheDocument();
  });

  it('từ khóa rỗng hiển thị tất cả', () => {
    renderProjectList();
    const searchInput = screen.getByPlaceholderText('Tìm kiếm dự án...');
    fireEvent.change(searchInput, { target: { value: 'Bình Tân' } });
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
  });

  it('từ khóa không tìm thấy', () => {
    renderProjectList();
    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm dự án...'), { target: { value: 'xxxxxxxxxxx' } });
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
    expectProjectCount(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Lọc bằng dropdown select (SearchableSelect)', () => {
  it('lọc theo nhóm dự án "Nhóm 1"', () => {
    renderProjectList();
    selectSearchable('Nhóm dự án', 'Nhóm 1');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('lọc theo nhóm dự án "Nhóm 2"', () => {
    renderProjectList();
    selectSearchable('Nhóm dự án', 'Nhóm 2');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
    expect(screen.queryByText('Chung Cư Tân Phú')).not.toBeInTheDocument();
  });

  it('lọc theo nguồn vốn "Vốn vay"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Nguồn vốn', 'Vốn vay');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('lọc theo nguồn vốn "Ngân sách"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Nguồn vốn', 'Ngân sách');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('lọc theo người theo dõi "Trần Thị B"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Người theo dõi', 'Trần Thị B');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('lọc theo người theo dõi "Nguyễn Văn A"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Người theo dõi', 'Nguyễn Văn A');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('lọc theo phân loại "Loại 2"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Phân loại dự án', 'Loại 2');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('lọc theo chủ đầu tư "Công ty A"', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Chủ đầu tư', 'Công ty A');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('lọc theo giai đoạn "Thực hiện"', () => {
    renderProjectList();
    selectSearchable('Giai đoạn', 'Thực hiện');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('lọc theo địa bàn "Bình Tân"', () => {
    renderProjectList();
    openFilterPanel();
    // locationFilter (SearchableSelect) dùng options nhóm theo processingAgencies: 'Bình Tân', 'Quận 7'
    selectSearchable('Cơ quan / Phòng ban', 'Bình Tân');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
    expect(screen.queryByText('Chung Cư Tân Phú')).not.toBeInTheDocument();
  });

  it('xóa bộ lọc nhóm → hiển thị lại tất cả', () => {
    renderProjectList();
    selectSearchable('Nhóm dự án', 'Nhóm 1');
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();

    clearSearchable('Nhóm 1');
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
  });

  it('kết hợp nhiều bộ lọc: Nhóm 1 + Ngân sách', () => {
    renderProjectList();
    selectSearchable('Nhóm dự án', 'Nhóm 1');
    openFilterPanel();
    selectSearchable('Nguồn vốn', 'Ngân sách');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Sự kiện người dùng', () => {
  it('nút Xuất báo cáo tồn tại trên giao diện', () => {
    renderProjectList();
    // Button có 2 span responsive ("Xuất báo cáo" + "Xuất") → dùng role query
    expect(screen.getByRole('button', { name: /Xuất báo cáo/i })).toBeInTheDocument();
  });

    // Nút Khởi tạo Dự án chỉ dành cho Sở Xây dựng / Admin (src/components/ProjectList.tsx: onCreateClick && isSxdOrAdmin)
  it('nút Khởi tạo Dự án gọi onCreateClick khi được click (tài khoản Sở Xây dựng)', () => {
    const onCreateClick = vi.fn();
    renderProjectList({ onCreateClick, currentUser: { id: 'u-sxd', roleId: 'Lãnh đạo', userType: 'agency', agencyId: '1' } });
    // Button có 2 span responsive → dùng role query bắt accessible name
    const createBtn = screen.getByRole('button', { name: /Khởi tạo Dự án/i });
        fireEvent.click(createBtn);
    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });

  it('tài khoản Sở khác / chủ đầu tư không thấy nút Khởi tạo Dự án', () => {
    renderProjectList({ currentUser: { id: 'u-qh', roleId: 'Lãnh đạo', userType: 'agency', agencyId: '2' } });
    expect(screen.queryByRole('button', { name: /Khởi tạo Dự án/i })).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Nút Cập nhật (onHousingUpdateClick)', () => {
  it('hiển thị ít nhất 1 nút "Cập nhật" cho dự án có bước hiện tại', () => {
    renderProjectList();
    const updateBtns = screen.getAllByText('Cập nhật');
    expect(updateBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('click "Cập nhật" gọi onHousingUpdateClick với dự án tương ứng', () => {
    const onHousingUpdateClick = vi.fn();
    renderProjectList({ onHousingUpdateClick });
    fireEvent.click(screen.getAllByText('Cập nhật')[0]);
    expect(onHousingUpdateClick).toHaveBeenCalledTimes(1);
    const [calledProject] = onHousingUpdateClick.mock.calls[0];
    expect(calledProject.id).toBe('p1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Phân trang', () => {
  const makePageProject = (i: number) => ({
    id: `pg-${i}`,
    code: `NOXH-2024-${String(i).padStart(3, '0')}`,
    name: `Dự án số ${i}`,
    investor: 'Công ty Test',
    location: 'Bình Tân',
    processId: 'proc-1',
    projectGroup: 'Nhóm 1',
    fundingSource: 'Ngân sách',
    follower: 'Nguyễn Văn A',
    stage: 'Chuẩn bị đầu tư',
    status: 'On Track',
    projectCategory: 'Loại 1',
    currentStep: 'Chấp thuận chủ trương',
    progress: 30,
    milestones: {},
    implementationPlan: {},
  });
  const manyProjects = Array.from({ length: 15 }, (_, i) => makePageProject(i + 1));

  it('với 15 dự án, trang 1 chỉ hiển thị dự án 1–10', () => {
    renderProjectList({ projects: manyProjects });
    expect(screen.getByText('Dự án số 1')).toBeInTheDocument();
    expect(screen.getByText('Dự án số 10')).toBeInTheDocument();
    expect(screen.queryByText('Dự án số 11')).not.toBeInTheDocument();
  });

  it('với 15 dự án, hiển thị nút trang "2"', () => {
    renderProjectList({ projects: manyProjects });
    // Nút số trang là button chứa text chính xác "2"
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('click trang 2 → hiển thị dự án 11–15, ẩn dự án 1', () => {
    renderProjectList({ projects: manyProjects });
    fireEvent.click(screen.getByText('2'));
    expect(screen.getByText('Dự án số 11')).toBeInTheDocument();
    expect(screen.queryByText('Dự án số 1')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Lọc theo Quy trình', () => {
  const proc2Project = {
    id: 'p-proc2',
    code: 'NOXH-2024-099',
    name: 'Dự án Quy trình 2',
    investor: 'Công ty C',
    location: 'Tân Phú',
    processId: 'proc-2',
    projectGroup: 'Nhóm 3',
    fundingSource: 'Ngân sách',
    follower: 'Nguyễn Văn A',
    stage: 'Chuẩn bị đầu tư',
    status: 'On Track',
    projectCategory: 'Loại 1',
    currentStep: '',
    progress: 0,
    milestones: {},
    implementationPlan: {},
  };
  const extProcesses = [
    ...mockProcesses,
    {
      id: 'proc-2',
      name: 'Quy trình 2',
      parentSteps: [
        {
          id: 'ps-2',
          name: 'Giai đoạn khác',
          stage: 'Thực hiện',
          childSteps: [{ id: 'cs-2', name: 'Bước khác', agency: 'UBND' }],
        },
      ],
    },
  ];

  it('lọc "Quy trình 2" chỉ hiển thị dự án proc-2', () => {
    renderProjectList({
      projects: [...mockProjects, proc2Project],
      processes: extProcesses,
    });
    selectSearchable('Quy trình', 'Quy trình 2');
    expect(screen.getByText('Dự án Quy trình 2')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('xóa bộ lọc quy trình → hiện lại tất cả', () => {
    renderProjectList({
      projects: [...mockProjects, proc2Project],
      processes: extProcesses,
    });
    selectSearchable('Quy trình', 'Quy trình 2');
    clearSearchable('Quy trình 2');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Dự án Quy trình 2')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectList – Lọc theo Thủ tục', () => {
  it('lọc "Chấp thuận chủ trương" chỉ hiện dự án có bước đó', () => {
    renderProjectList();
    openFilterPanel();
    // p1 & p3 có currentStep='Chấp thuận chủ trương', p2 có 'Quy hoạch 1/500'
    selectSearchable('Thủ tục', 'Chấp thuận chủ trương');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('xóa bộ lọc thủ tục → hiện lại tất cả', () => {
    renderProjectList();
    openFilterPanel();
    selectSearchable('Thủ tục', 'Chấp thuận chủ trương');
    clearSearchable('Chấp thuận chủ trương');
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Quận 7')).toBeInTheDocument();
    expect(screen.getByText('Chung Cư Tân Phú')).toBeInTheDocument();
  });
});
