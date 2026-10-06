# CONTEXT - NOXH_ketnoiAPI

> Mo ta trang thai hien tai cua du an. Cap nhat tu dong sau moi lan sync.

---

## Kien truc tong quan

- **Framework:** React 19 + Express 4 + TypeScript
- **Database:** PostgreSQL (192.168.1.2:5432, database: NOXH)
- **Build:** Vite (frontend) + esbuild (backend)
- **Test:** Vitest (unit/integration) + Playwright (E2E)
- **Process manager:** PM2 (production)
- **Port:** 3000 - Express serve ca API lan React static files

## Cau truc thu muc quan trong

```
NOXH_ketnoiAPI/
+-- server.ts                        Entry point Express
+-- server/db.ts                     Ket noi PostgreSQL, tat ca query
+-- src/
|   +-- App.tsx                      Router chinh React
|   +-- components/
|       +-- GanttDashboardNOXH.tsx   Man hinh Gantt tien do
|       +-- HousingUpdateView.tsx    Cap nhat tien do du an
|       +-- ProfileModal.tsx         Thong tin ca nhan user
+-- test/
|   +-- integration/                 Vitest + supertest (khong can server)
|   +-- e2e/                         Playwright (can server o localhost:3000)
+-- scripts/
|   +-- sync-from-demo.ps1           Script sync tu NOXH_demo
+-- .sync-base/                      Baseline 3-way merge (KHONG XOA)
+-- .sync-backup/                    Backup tu dong truoc moi lan sync
+-- CONTEXT.md                       File nay - mo ta du an
+-- CHANGELOG.md                     Lich su thay doi theo tung lan sync
```

## File bi loai tru khi sync

Nhung file nay khong bao gio bi ghi de tu Demo:
`.env`, `.env.local`, `.deploy.env`, `package-lock.json`, `package.json`,
`node_modules/`, `dist/`, `test/`, `scripts/`, `.sync-base/`, `.git/`, `uploads/`

## Luu y quan trong

- **Khong co auth middleware** - tat ca API route deu mo, khong can JWT token
- **package.json o Goc khac Demo** - Goc co them scripts: test, ci, sync
- **Chay E2E** phai start server truoc (`npm run dev`) roi moi `npm run test:e2e`
- **PowerShell tren may nay** la v5.1 (`powershell.exe`), khong co `pwsh`
- **Read-Host bi chan** khi chay qua npm -NonInteractive, dung `[System.Console]::ReadLine()`

## Lenh hay dung

```powershell
npm run dev              # Chay dev server
npm test                 # Chay tat ca unit + integration test
npm run test:e2e         # Chay E2E (phai co dev server truoc)
npm run sync:dry-run     # Xem truoc khac gi giua Demo va Goc
npm run sync:from-demo   # Thuc hien sync
```

---

## Lich su sync gan nhat

<!-- TU DONG CAP NHAT BOI scripts/sync-from-demo.ps1 - KHONG SUA TAY PHAN NAY -->
- **2026-09-29 09:47** | Sync | Copy: 1 file | Conflict: 0 | Test: FAIL
- **2026-09-29 09:35** | Sync | Copy: 8 file | Conflict: 1 | Test: FAIL
- **2026-09-29 08:42** | Sync | Copy: 14 file | Conflict: 0 | Test: FAIL
- **2026-07-30 13:58** | Sync | Copy: 2 file | Conflict: 1 | Test: FAIL
- **2026-07-30 13:26** | Sync | Copy: 6 file | Conflict: 1 | Test: FAIL
- **2026-07-30 11:48** | Sync | Copy: 3 file | Conflict: 0 | Test: FAIL
- **2026-07-30 11:33** | Sync | Copy: 2 file | Conflict: 0 | Test: FAIL
- **2026-07-30 10:01** | Sync | Copy: 1 file | Conflict: 1 | Test: FAIL
- **2026-07-30 09:40** | Sync | Copy: 7 file | Conflict: 0 | Test: FAIL
- **2026-07-29 13:40** | Sync | Copy: 2 file | Conflict: 0 | Test: FAIL
- **2026-07-29 11:30** | Sync | Copy: 4 file | Conflict: 0 | Test: FAIL
- **2026-07-29 09:34** | Sync | Copy: 1 file | Conflict: 1 | Test: PASS
- **2026-07-29 09:28** | Sync | Copy: 2 file | Conflict: 0 | Test: PASS
- **2026-07-29 09:19** | Sync | Copy: 4 file | Conflict: 0 | Test: PASS
- **2026-07-28 16:30** | Sync | Copy: 0 file | Conflict: 3 | Test: FAIL
- **2026-07-01 14:28** | Sync | Copy: 5 file | Conflict: 1 | Test: FAIL
- **2026-06-18 14:14** | Sync | Copy: 5 file | Conflict: 0 | Test: FAIL
- **2026-06-18 10:15** | Sync | Copy: 3 file | Conflict: 1 | Test: PASS
- **2026-06-17 16:03** | Sync | Copy: 11 file | Conflict: 3 | Test: FAIL
- **2026-06-17 10:31** | Sync | Copy: 11 file | Conflict: 0 | Test: FAIL
- **2026-06-17 10:15** | Sync lan dau | Copy: 9 file | Conflict: 0 | Test: skip




















