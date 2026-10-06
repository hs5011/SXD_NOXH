// @vitest-environment jsdom
/**
 * Component Tests: UpdateProgress
 *
 * Kiểm tra:
 *   - Render modal với tên dự án
 *   - Hiển thị danh sách bước quy trình
 *   - Hiển thị thông báo khi không có bước
 *   - Click thay đổi trạng thái bước
 *   - Nút Hủy bỏ gọi onClose
 *   - Nút Lưu thay đổi gọi onSuccess với dữ liệu đúng
 *   - Trạng thái đang lưu (disabled)
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import UpdateProgress from '../../src/components/UpdateProgress';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockSteps = [
  { id: 'step-1', name: 'Chấp thuận chủ trương', agency: 'Sở Xây Dựng', status: 'pending' },
  { id: 'step-2', name: 'Quy hoạch 1/500', agency: 'Sở QHKT', status: 'in_progress', department: 'Phòng QH' },
  { id: 'step-3', name: 'Giao đất', agency: 'UBND', status: 'completed' },
];

const mockProject = {
  id: 'proj-1',
  name: 'Dự án Nhà Ở Xã Hội Bình Tân',
  processSteps: mockSteps,
};

const projectNoSteps = {
  id: 'proj-2',
  name: 'Dự án chưa có quy trình',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderUpdateProgress(
  project: any = mockProject,
  onClose = vi.fn(),
  onSuccess = vi.fn()
) {
  return render(
    <UpdateProgress project={project} onClose={onClose} onSuccess={onSuccess} />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Render cơ bản', () => {
  it('hiển thị tiêu đề "Cập nhật tiến độ"', () => {
    renderUpdateProgress();
    expect(screen.getByText('Cập nhật tiến độ')).toBeInTheDocument();
  });

  it('hiển thị tên dự án trong header', () => {
    renderUpdateProgress();
    expect(screen.getByText('Dự án Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('hiển thị nút Hủy bỏ', () => {
    renderUpdateProgress();
    expect(screen.getByText('Hủy bỏ')).toBeInTheDocument();
  });

  it('hiển thị nút Lưu thay đổi', () => {
    renderUpdateProgress();
    expect(screen.getByText('Lưu thay đổi')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Danh sách bước quy trình', () => {
  it('hiển thị tất cả tên bước', () => {
    renderUpdateProgress();
    expect(screen.getByText('Chấp thuận chủ trương')).toBeInTheDocument();
    expect(screen.getByText('Quy hoạch 1/500')).toBeInTheDocument();
    expect(screen.getByText('Giao đất')).toBeInTheDocument();
  });

  it('hiển thị cơ quan của từng bước', () => {
    renderUpdateProgress();
    expect(screen.getByText(/Sở Xây Dựng/)).toBeInTheDocument();
    expect(screen.getByText(/Sở QHKT/)).toBeInTheDocument();
    expect(screen.getByText(/UBND/)).toBeInTheDocument();
  });

  it('hiển thị phòng ban khi có department', () => {
    renderUpdateProgress();
    expect(screen.getByText(/Phòng QH/)).toBeInTheDocument();
  });

  it('hiển thị đủ 4 lựa chọn trạng thái cho mỗi bước', () => {
    renderUpdateProgress();
    // 3 bước × 4 trạng thái = 12 button trạng thái, mỗi label xuất hiện 3 lần
    expect(screen.getAllByText('Chưa bắt đầu').length).toBe(3);
    expect(screen.getAllByText('Đang xử lý').length).toBe(3);
    expect(screen.getAllByText('Hoàn tất').length).toBe(3);
    expect(screen.getAllByText('Quá hạn').length).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Dự án không có bước', () => {
  it('hiển thị thông báo khi processSteps là undefined', () => {
    renderUpdateProgress(projectNoSteps);
    expect(screen.getByText(/Dự án này chưa có các bước quy trình chi tiết/)).toBeInTheDocument();
  });

  it('hiển thị thông báo khi processSteps là mảng rỗng', () => {
    renderUpdateProgress({ ...mockProject, processSteps: [] });
    expect(screen.getByText(/Dự án này chưa có các bước quy trình chi tiết/)).toBeInTheDocument();
  });

  it('vẫn hiển thị nút Lưu thay đổi ngay cả khi không có bước', () => {
    renderUpdateProgress(projectNoSteps);
    expect(screen.getByText('Lưu thay đổi')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Thay đổi trạng thái', () => {
  it('click "Hoàn tất" cho bước đầu tiên không crash', () => {
    renderUpdateProgress();
    const completedBtns = screen.getAllByText('Hoàn tất');
    expect(() => fireEvent.click(completedBtns[0])).not.toThrow();
  });

  it('click "Quá hạn" cho bước 2 không crash', () => {
    renderUpdateProgress();
    const delayedBtns = screen.getAllByText('Quá hạn');
    expect(() => fireEvent.click(delayedBtns[1])).not.toThrow();
  });

  it('click nhiều lần thay đổi trạng thái không crash', () => {
    renderUpdateProgress();
    const inProgressBtns = screen.getAllByText('Đang xử lý');
    fireEvent.click(inProgressBtns[0]);
    fireEvent.click(inProgressBtns[2]);
    expect(screen.getAllByText('Đang xử lý').length).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Hủy bỏ và đóng modal', () => {
  it('click Hủy bỏ gọi onClose', () => {
    const onClose = vi.fn();
    renderUpdateProgress(mockProject, onClose);
    fireEvent.click(screen.getByText('Hủy bỏ'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('UpdateProgress – Lưu thay đổi', () => {
  it('nút Lưu bị disable trong lúc đang lưu', async () => {
    vi.useFakeTimers();
    renderUpdateProgress();

    const saveBtn = screen.getByText('Lưu thay đổi').closest('button')!;

    // Click ngay lập tức sẽ set saving=true → text thay đổi sang "Đang lưu..."
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Trong lúc saving=true (trước khi timer giải quyết), text phải là "Đang lưu..."
    expect(screen.getByText('Đang lưu...')).toBeInTheDocument();

    // Dọn dẹp: advance timers để resolve promise
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('click Lưu thay đổi gọi onSuccess với dữ liệu đúng', async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    renderUpdateProgress(mockProject, vi.fn(), onSuccess);

    fireEvent.click(screen.getByText('Lưu thay đổi'));
    await vi.runAllTimersAsync();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const [calledWith] = onSuccess.mock.calls[0];
    expect(calledWith.id).toBe('proj-1');
    expect(calledWith.processSteps).toBeDefined();
    expect(calledWith.processSteps.length).toBe(3);
    vi.useRealTimers();
  });

  it('lưu lại trạng thái đã thay đổi trong onSuccess', async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    renderUpdateProgress(mockProject, vi.fn(), onSuccess);

    // Thay đổi bước 1 từ pending → completed
    fireEvent.click(screen.getAllByText('Hoàn tất')[0]);
    fireEvent.click(screen.getByText('Lưu thay đổi'));
    await vi.runAllTimersAsync();

    const [calledWith] = onSuccess.mock.calls[0];
    const savedStep1 = calledWith.processSteps.find((s: any) => s.id === 'step-1');
    expect(savedStep1.status).toBe('completed');
    vi.useRealTimers();
  });

  it('lưu dự án không có bước vẫn gọi onSuccess', async () => {
    vi.useFakeTimers();
    const onSuccess = vi.fn();
    renderUpdateProgress(projectNoSteps, vi.fn(), onSuccess);

    fireEvent.click(screen.getByText('Lưu thay đổi'));
    await vi.runAllTimersAsync();

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const [calledWith] = onSuccess.mock.calls[0];
    expect(calledWith.processSteps).toEqual([]);
    vi.useRealTimers();
  });
});
