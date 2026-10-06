# /sync-tests — Kiem tra va bo sung test sau khi merge source

Ban la AI chuyen viet test cho du an NOXH (React 19 + TypeScript + Vitest + Playwright).

## Nhiem vu

Khi nguoi dung noi "vua merge xong, check va bo sung test" hoac chay `/sync-tests`,
thuc hien DUNG cac buoc sau:

---

## BUOC 1 — Doc file pending

Dau tien, doc file `.sync-pending-tests.md` de biet file nao vua thay doi:

```
Read: .sync-pending-tests.md
```

Neu file khong ton tai → hoi nguoi dung file nao can kiem tra (dung AskUserQuestion voi
lua chon: ra soat toan bo test/ so voi source hien tai / chi file tu lan sync ghi trong
CHANGELOG.md gan nhat / nguoi dung tu chi ro). Luu y: cac file trong toan bo OneDrive co
the bi "cham" mtime dong loat boi OneDrive re-sync/re-hydrate — DUNG dua vao mtime de
doan file nao vua thay doi that, hay doi chieu voi CHANGELOG.md (cac dong do
sync-from-demo.ps1 tu ghi) hoac hoi truc tiep.

---

## BUOC 2 — Doc tung file source da thay doi

Voi moi file liet ke trong `.sync-pending-tests.md`, doc noi dung file do.

Phan tich de tim:
- **Route/API moi** trong `server.ts` hoac `server/*.ts`
- **Logic phan quyen moi** (role, userType, agencyId...)
- **Component moi** hoac **props moi** trong `src/components/`
- **Ham tien ich moi** trong `src/lib/` hoac `src/utils/`
- **State/hook moi** co the test duoc

---

## BUOC 3 — Kiem tra test hien tai

Doc cac file test lien quan:
- `test/integration/api.routes.test.ts` — cho server.ts / server/*.ts
- `test/integration/api.auth.test.ts` — cho phan quyen / JWT
- `test/component/*.test.tsx` — cho src/components/
- `test/unit/*.test.ts` — cho src/lib/ va src/utils/

So sanh source vs test → phat hien:
- **Logic chua co test nao**
- **Case bieu con thieu** (edge case, error case, phan quyen)

---

## BUOC 4 — Bo sung test con thieu

### Neu la server.ts / server/*.ts (route moi, quyen moi):
Them vao `test/integration/api.auth.test.ts` (cho phan quyen)
hoac `test/integration/api.routes.test.ts` (cho logic nghiep vu).

Cau truc test auth:
```typescript
describe('Ten nhom quyen moi', () => {
  it('XX-01: Admin co quyen → 200', async () => { ... });
  it('XX-02: User khong co quyen → 403', async () => { ... });
  it('XX-03: Khong co token → 401', async () => { ... });
});
```

### Neu la src/components/ (component moi hoac them tinh nang):
Tao moi hoac cap nhat `test/component/TenComponent.test.tsx`.

Cau truc bat buoc:
```tsx
// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// KHONG mock lucide-react bang Proxy — gay loi tren Windows
// Chi mock nhung gi that su can:
vi.mock('../../src/data/appData', () => ({ ... }));

import TenComponent from '../../src/components/TenComponent';
```

### Neu la src/lib/ hoac src/utils/ (ham tien ich):
Tao moi hoac cap nhat `test/unit/tenFile.test.ts`.

---

## BUOC 5 — Quy tac bat buoc

### Mock
- KHONG: `vi.mock('lucide-react', () => new Proxy({}, { get: () => () => null }))`
- DUOC: `vi.mock('lucide-react', () => ({ IconName: () => null }))` (chi khi can)
- DUOC: Khong mock gi — icon render SVG, khong anh huong test text/button

### Fetch/API
- Mock: `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({...}) }))`
- Dung `await waitFor(() => ...)` sau action async

### Phan quyen (RBAC) — token mau
```typescript
// Dung jsonwebtoken de tao token test
const TOKEN_ADMIN    = jwt.sign({ id: 'u1', roleId: 'Admin',  userType: 'agency',   agencyId: '1' }, SECRET);
const TOKEN_SXD      = jwt.sign({ id: 'u2', roleId: 'User',   userType: 'agency',   agencyId: '1' }, SECRET);
const TOKEN_AGENCY   = jwt.sign({ id: 'u3', roleId: 'User',   userType: 'agency',   agencyId: '2' }, SECRET);
const TOKEN_INVESTOR = jwt.sign({ id: 'u4', roleId: 'User',   userType: 'investor', investorId: 'INV-001' }, SECRET);
```

### So luong test
- File moi: toi thieu 8 test, ly tuong 15-30
- File cap nhat: them du de cover feature moi
- Moi route moi: it nhat 3 test (thanh cong, khong quyen, khong token)

---

## BUOC 6 — Chay test de xac nhan

Sau khi viet xong, chay:
```powershell
npm test -- test/integration/
# hoac
npm test -- test/component/TenFile.test.tsx
```

Neu co loi → sua ngay truoc khi bao cao.

---

## BUOC 7 — Don dep va bao cao

1. **Xoa file** `.sync-pending-tests.md` sau khi hoan thanh
2. **Bao cao ngan gon:**
   - Da kiem tra: X file source
   - Da them: Y test case moi vao Z file
   - Ket qua chay: N/N pass

---

## Quy tac quan trong nhat

- **Mac dinh chi them, khong xoa** test da co.
  **Ngoai le**: neu nguoi dung RO RANG yeu cau xoa/sua test sai/khong con dung
  (vd. "test case nao khong dung thi bo di"), duoc phep SUA hoac XOA — nhung phai xac
  minh truoc bang cach doc component/route that (khong doan), va neu sua hanh vi
  mong doi (vd. doi assertion tu "KHONG thay X" sang "THAY X") thi ghi ro comment
  trong test giai thich VI SAO thay doi (tham chieu file:line cua source).
- **Chay test truoc khi bao cao** — khong noi pass neu chua chay. Uu tien chay tung
  file rieng le tu nhe → nang thay vi ca suite mot luc, nhat la khi may yeu/it RAM
  (chay `npm test` toan bo co the bi treo do integration test thu ket noi DB that).
- **Neu mot file test treo (khong chi cham) thay vi fail**: dung
  `timeout <giay> npx vitest run <file> -t "<ten describe/it>"` de bisect nhi phan
  tim dung test gay treo, thay vi doan mo. Kiem tra CPU time cua tien trinh qua
  nhieu lan (vai phut/lan) — neu dung yen khong tang thi la deadlock/vong lap vo han
  that su, khong phai do may cham. Nguyen nhan pho bien nhat: component destructure
  prop voi gia tri mac dinh la literal `[]`/`{}` (vd `projects = []`), tao reference
  moi moi lan render, khien `useEffect`/`useMemo` phu thuoc vao no chay lai vo han
  neu effect co goi setState ben trong.
- **Doc file thuc te** — khong doan, khong bịa logic
- **Moi route moi bat buoc co** test: quyen dung (200), sai quyen (403), khong token (401)
- **Component da chuyen tu `<select>` sang `SearchableSelect`** (div click-to-open,
  khong phai form element that): KHONG dung `fireEvent.change` + `getByDisplayValue`;
  phai `fireEvent.click` de mo roi `fireEvent.click` vao option theo label.
- **`vi.mock(...)` cho `lucide-react` hoac `src/lib/*`** phai liet ke DAY DU cac
  export/icon component that su dung — thieu 1 cai se lam CA FILE test loi dong loat
  voi loi kieu "No 'X' export is defined on the mock", de bi nham la loi logic test.
- Xem them cac bai hoc chi tiet trong bo nho Claude: `feedback-vitest-component-tests`
  (SearchableSelect, mock drift, bug treo vo han) va `project-agency-permission-model`
  (agencyId='1' = quyen nhu Admin, agencyId='6' = loc theo dia ban UBND cap xa/phuong).
