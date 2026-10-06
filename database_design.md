# Database Schema for NOXH Management System

## 1. Core Tables

### agencies (Cơ quan/Sở ngành)
- id: UUID (PK)
- name: VARCHAR(255)
- code: VARCHAR(50) (e.g., 'SXD', 'SKHDT', 'STNMT')
- type: ENUM('DEPARTMENT', 'DISTRICT', 'INVESTOR')
- parent_id: UUID (FK to agencies)

### users (Người dùng)
- id: UUID (PK)
- email: VARCHAR(255) (Unique)
- password_hash: TEXT
- full_name: VARCHAR(255)
- agency_id: UUID (FK to agencies)
- role_id: UUID (FK to roles)
- status: ENUM('ACTIVE', 'INACTIVE')

### roles (Vai trò)
- id: UUID (PK)
- name: VARCHAR(50) (e.g., 'ADMIN', 'LEADER', 'SPECIALIST', 'INVESTOR')
- permissions: JSONB

### projects (Dự án NOXH)
- id: UUID (PK)
- name: VARCHAR(500)
- location: TEXT
- investor_id: UUID (FK to agencies - type INVESTOR)
- scale_area: DECIMAL
- total_apartments: INTEGER
- total_investment: DECIMAL
- current_stage: ENUM('PREPARATION', 'IMPLEMENTATION', 'COMPLETION')
- status: VARCHAR(50)
- start_date: DATE
- end_date_expected: DATE

### project_stages (Giai đoạn dự án)
- id: UUID (PK)
- name: VARCHAR(255)
- order: INTEGER

### workflow_steps (Các bước quy trình)
- id: UUID (PK)
- stage_id: UUID (FK to project_stages)
- name: VARCHAR(255)
- handling_agency_id: UUID (FK to agencies)
- duration_days: INTEGER
- order: INTEGER

### project_workflow (Tiến độ thực tế dự án)
- id: UUID (PK)
- project_id: UUID (FK to projects)
- step_id: UUID (FK to workflow_steps)
- status: ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED')
- start_date: TIMESTAMP
- end_date_actual: TIMESTAMP
- deadline: TIMESTAMP
- handler_id: UUID (FK to users)
- note: TEXT

### documents (Hồ sơ pháp lý)
- id: UUID (PK)
- project_id: UUID (FK to projects)
- step_id: UUID (FK to workflow_steps)
- title: VARCHAR(500)
- doc_number: VARCHAR(100)
- sign_date: DATE
- signer: VARCHAR(255)

### document_files (Tệp tin đính kèm)
- id: UUID (PK)
- document_id: UUID (FK to documents)
- file_name: VARCHAR(255)
- file_path: TEXT
- file_size: INTEGER
- mime_type: VARCHAR(100)

### activity_logs (Nhật ký hệ thống)
- id: UUID (PK)
- user_id: UUID (FK to users)
- action: VARCHAR(255)
- target_type: VARCHAR(50)
- target_id: UUID
- content: JSONB
- created_at: TIMESTAMP

### notifications (Thông báo)
- id: UUID (PK)
- user_id: UUID (FK to users)
- title: VARCHAR(255)
- content: TEXT
- is_read: BOOLEAN
- type: VARCHAR(50)
- created_at: TIMESTAMP
