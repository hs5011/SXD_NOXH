// Chi dung URL tuyet doi khi build production cho app Capacitor (Android/iOS),
// noi app khong chay chung origin voi backend. Web dev/test van dung URL
// tuong doi nhu truoc (cung origin voi Express dev server).
const API_BASE = import.meta.env.PROD
  ? 'https://noxh.vietinfo.tech'
  : '';

export default API_BASE;
