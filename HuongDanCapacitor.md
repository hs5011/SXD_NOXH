# Huong Dan Tich Hop Capacitor - Build App Android/iOS

> Bien React Web App (NOXH_ketnoiAPI) thanh ung dung Android (APK) va iOS (IPA)
> Chi lam 1 lan setup, tu do ve sau chi can: build -> sync -> xuat APK

---

## Yeu cau truoc khi bat dau

| Phan mem | Dung cho | Ghi chu |
|---|---|---|
| Android Studio | Build APK Android | Bao gom JDK + SDK tu dong |
| Xcode | Build IPA iOS | Chi co tren may Mac |
| Node.js | Da co san | Kem theo du an |
| Railway account | Deploy backend | Dang ky tai railway.app |

> **Luu y:** Chi can Android Studio de build Android.
> iOS bat buoc phai co may Mac + Xcode.

---

## GIAI DOAN 1 - Deploy Backend len Server (bat buoc)

App chay tren dien thoai khong the goi localhost:3000 tren may tinh ban.
Phai deploy backend len server co dia chi internet co dinh.

### Buoc 1.1 - Dang ky Railway

1. Vao `https://railway.app`
2. Click **Login with GitHub**
3. Tao project moi

### Buoc 1.2 - Them bien moi truong tren Railway

Vao project Railway -> **Variables** -> them cac bien tu file `.env`:
```
DB_HOST=192.168.1.2
DB_PORT=5432
DB_NAME=NOXH
DB_USER=...
DB_PASSWORD=...
NODE_ENV=production
```

### Buoc 1.3 - Deploy

```powershell
# Chay trong thu muc NOXH_ketnoiAPI
npm run ci:deploy:railway
```

Sau khi deploy xong, Railway cap URL dang:
```
https://noxh-ketnoiapi-production.up.railway.app
```

**Luu lai URL nay** - dung o buoc tiep theo.

### Buoc 1.4 - Kiem tra backend hoat dong

Mo browser, vao URL:
```
https://noxh-ketnoiapi-production.up.railway.app/api/health
```

Thay `{"status":"ok"}` la thanh cong.

---

## GIAI DOAN 2 - Cau hinh Frontend goi dung URL

Chi lam 1 lan. Tu do ve sau khong can sua code.

### Buoc 2.1 - Tao file cau hinh URL

Tao file `src/config.ts`:

```typescript
const API_BASE = import.meta.env.PROD
  ? 'https://noxh-ketnoiapi-production.up.railway.app'  // URL Railway cua ban
  : 'http://localhost:3000'                              // Dev local

export default API_BASE
```

### Buoc 2.2 - Cap nhat cac file dung fetch

Tim tat ca cho co `fetch('/api/` va them `API_BASE` vao truoc:

**Truoc:**
```typescript
const res = await fetch('/api/projects')
```

**Sau:**
```typescript
import API_BASE from '../config'
const res = await fetch(API_BASE + '/api/projects')
```

> **Meo:** Chay lenh nay de tim tat ca file can sua:
> ```powershell
> grep -r "fetch('/api/" src/
> ```

### Buoc 2.3 - Them cau hinh CORS tren backend

Mo file `server.ts`, them CORS cho phep app goi API:

```typescript
import cors from 'cors'

app.use(cors({
  origin: '*',   // Cho phep moi nguon (thay bang domain cu the neu can bao mat)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))
```

Cai them package neu chua co:
```powershell
npm install cors
npm install @types/cors -D
```

---

## GIAI DOAN 3 - Cai va Khoi tao Capacitor

### Buoc 3.1 - Cai Capacitor

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
```

### Buoc 3.2 - Khoi tao Capacitor

```powershell
npx cap init
```

Dien vao cac cau hoi:
```
App name:    NOXH
App ID:      vn.vietinfo.noxh
Web dir:     dist
```

> **App ID** phai duy nhat, dang reverse domain.
> Vi du: `vn.vietinfo.noxh` nghia la domain vietinfo.vn, app ten noxh.

### Buoc 3.3 - Kiem tra file capacitor.config.ts

File `capacitor.config.ts` se duoc tao tu dong:

```typescript
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'vn.vietinfo.noxh',
  appName: 'NOXH',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
```

---

## GIAI DOAN 4 - Build App Android

### Buoc 4.1 - Build frontend

```powershell
npm run build
```

Lenh nay tao thu muc `dist/` chua toan bo giao dien da compile.

### Buoc 4.2 - Them platform Android

```powershell
npx cap add android
```

Tao thu muc `android/` chua project Android Studio.

### Buoc 4.3 - Sync code vao Android

```powershell
npx cap sync
```

Copy noi dung `dist/` vao project Android.

### Buoc 4.4 - Cai Android Studio

1. Tai tai: `https://developer.android.com/studio`
2. Cai dat binh thuong (Next -> Next -> Finish)
3. Lan dau mo se tu dong cai JDK + Android SDK (~2-3GB)

### Buoc 4.5 - Mo project trong Android Studio

```powershell
npx cap open android
```

Android Studio tu mo vao thu muc `android/`.

### Buoc 4.6 - Tao Keystore (chi lam 1 lan)

Keystore la chu ky so de ky APK. Phai giu cung keystore cho tat ca cac lan
update sau nay (mat keystore = khong cap nhat duoc app cu).

Trong Android Studio:
1. Menu **Build** -> **Generate Signed Bundle / APK**
2. Chon **APK** -> **Next**
3. Click **Create new...** de tao keystore moi
4. Dien vao:
   ```
   Key store path: C:\keystore\noxh.jks   (chon noi de luu)
   Password:       (dat mat khau manh, nho lai)
   Key alias:      noxh
   Key password:   (dat mat khau)
   Validity:       25 (nam)
   First and Last Name: Ten ban
   ```
5. Click **OK**

> **QUAN TRONG:** Sao luu file `.jks` va mat khau ra noi an toan.
> Mat file nay = khong the cap nhat app tren CH Play.

### Buoc 4.7 - Build APK

Tiep tuc sau khi tao keystore:
1. Chon **release** (khong phai debug)
2. Tick ca 2: **V1** va **V2 Signature**
3. Click **Finish**
4. Doi vai phut...

File APK nam tai:
```
android\app\release\app-release.apk
```

---

## GIAI DOAN 5 - Cai APK len Dien thoai Android

### Cach 1 - Copy truc tiep

1. Cam day USB vao may tinh
2. Copy file `app-release.apk` vao dien thoai
3. Tren dien thoai: mo File Manager -> tim file APK -> bam cai dat
4. Neu hoi "Cho phep cai tu nguon khong ro": bat ON -> cai tiep

### Cach 2 - Qua Google Drive

1. Upload `app-release.apk` len Google Drive
2. Tren dien thoai mo Drive -> tai ve -> cai dat

---

## GIAI DOAN 6 - Build IPA cho iOS (can may Mac)

> **Bat buoc phai co may Mac.** Khong the build IPA tren Windows.

### Buoc 6.1 - Them platform iOS (chay tren Mac)

```bash
npx cap add ios
npx cap sync
npx cap open ios
```

### Buoc 6.2 - Mo Xcode

Xcode tu mo vao thu muc `ios/`.

### Buoc 6.3 - Cai dat Signing

1. Chon project trong sidebar
2. **Signing & Capabilities** -> dang nhap Apple ID
3. Chon **Team**

### Buoc 6.4 - Build IPA

1. Menu **Product** -> **Archive**
2. Sau khi archive xong: **Distribute App**
3. Chon **Ad Hoc** (phan phoi truc tiep, khong qua App Store)
4. Xuat ra file `.ipa`

### Cai IPA len iPhone

Dung **AltStore** hoac **Apple Configurator 2** de cai file `.ipa` ma khong
can dang ky Apple Developer ($99/nam).

---

## Workflow sau nay (khi update code)

Moi lan sua code va muon cap nhat app:

```powershell
# 1. Build lai frontend
npm run build

# 2. Sync vao Capacitor
npx cap sync

# 3. Build APK moi (command line, khong can mo Android Studio)
cd android
.\gradlew assembleRelease
cd ..

# File APK moi nam tai:
# android\app\build\outputs\apk\release\app-release-unsigned.apk
```

> **Luu y:** APK build bang command line can ky thu cong them.
> De don gian hon, dung Android Studio build nhu Buoc 4.6-4.7.

---

## Xu ly loi thuong gap

### Loi: "SDK location not found"
```powershell
# Tao file local.properties trong thu muc android/
echo "sdk.dir=C:\\Users\\SonDH\\AppData\\Local\\Android\\Sdk" > android\local.properties
```

### Loi: "JAVA_HOME is not set"
Cai JDK 17 tai `https://adoptium.net` roi them vao PATH:
```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17..."
```

### Loi: App mo len trang trang (blank screen)
Kiem tra `capacitor.config.ts` co `webDir: 'dist'` va da chay `npm run build` chua.

### Loi: API khong goi duoc (network error)
- Kiem tra URL trong `src/config.ts` dung chua
- Kiem tra backend Railway dang chay
- Kiem tra da them CORS trong `server.ts` chua

### Loi: "cleartext traffic not permitted" (Android)
Mo file `android/app/src/main/AndroidManifest.xml`, them:
```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

---

## Tom tat cac lenh quan trong

```powershell
npm run build          # Build frontend
npx cap sync           # Sync vao Capacitor
npx cap open android   # Mo Android Studio
npx cap open ios       # Mo Xcode (Mac only)
npx cap run android    # Chay truc tiep tren dien thoai/gia lap
npx cap run ios        # Chay tren iPhone/gia lap (Mac only)
```
