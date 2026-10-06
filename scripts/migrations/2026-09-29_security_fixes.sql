-- Migration cho đợt sửa lỗi bảo mật / dữ liệu ngày 29/09/2026 (NOXH_ketnoiAPI)
--
-- Server (server/db.ts → initDatabase) TỰ CHẠY các lệnh này mỗi lần khởi động, nên thường không cần chạy tay.
-- Chỉ chạy file này thủ công khi tài khoản DB mà app dùng KHÔNG có quyền ALTER TABLE / DELETE,
-- hoặc khi muốn nâng cấp DB trước khi deploy code mới.
--
-- Tất cả lệnh đều idempotent (chạy lại nhiều lần không sao) và không xóa dữ liệu nghiệp vụ.

BEGIN;

-- Cờ bắt đổi mật khẩu sau khi Admin/SXD cấp mật khẩu tạm (khôi phục mật khẩu)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Phường/xã của tài khoản UBND cấp xã, phường (agency_id = '6'), dùng để lọc dự án theo địa bàn.
-- SAU KHI CHẠY: tài khoản phường chưa được gán phường sẽ KHÔNG thấy dự án nào →
-- Admin vào "Quản lý tài khoản" chọn phường cho từng tài khoản.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';

-- Các trường dự án chưa có cột riêng (tổng mức đầu tư, nguồn vốn, kế hoạch thực hiện, trạng thái bước…)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;

-- Bản sao danh sách user cũ trong app_metadata (có thể chứa mật khẩu chưa mã hóa); user chỉ nằm ở app_users
DELETE FROM app_metadata WHERE key = 'users';

COMMIT;

-- Kiểm tra sau khi chạy:
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE (table_name = 'app_users' AND column_name IN ('department', 'must_change_password'))
--     OR (table_name = 'projects' AND column_name = 'extra');
-- SELECT COUNT(*) FROM app_metadata WHERE key = 'users';   -- phải = 0
-- SELECT id, username FROM app_users WHERE agency_id = '6' AND COALESCE(department, '') = '';  -- cần gán phường
