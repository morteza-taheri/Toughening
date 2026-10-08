# Toughening Console — اجرای سریع

## ۱) سرور
```bat
cd /d D:\PMC\Documents\PlatformIO\Projects\Toughening
pc\venv\Scripts\python.exe -m pc.server
```
مرورگر: http://localhost:8000/  (اگر نسخه قبلی دیده شد: Ctrl + F5)

## ۲) داده
* دستگاه واقعی / شبیه‌ساز قراردادی (فقط مقادیر ۰ و null):
  `pc\venv\Scripts\python.exe pc\simulator.py --loop`
* **داده نمایشی** برای دیدن کامل رابط (۱۶ ایستگاه، ۲۴ ساعت سابقه، رویدادها):
  `pc\venv\Scripts\python.exe -m pc.demo_feed`
  حذف داده نمایشی: `pc\venv\Scripts\python.exe -m pc.demo_feed --purge`

> داده نمایشی ساختگی است، با پیشوند `demo:` ذخیره می‌شود و هیچ معنای کالیبراسیون ندارد.

## صفحات
| مسیر | محتوا |
|---|---|
| `#/dashboard` | نوار وضعیت، ۱۶ ایستگاه، نمودار سوابق ایستگاه انتخابی (پیش‌فرض ۱۲ ساعت)، مقادیر زنده خام/تبدیل‌شده |
| `#/stations/7` | صفحه کامل ایستگاه: نمودار بزرگ، بازه دلخواه، جدول چرخه‌ها، خروجی CSV |
| `#/events` | آلارم‌ها، رویدادهای سیستم، تغییر تنظیمات، ازدست‌رفتن داده |
| `#/reports` | سازنده گزارش: بازه، ایستگاه‌ها، نوع رکورد، پیش‌نمایش، CSV / JSON / چاپ PDF |
| `#/settings` | تم (۶ تم)، رنگ تأکید، گوشه‌ها، تراکم، انیمیشن، قلم، اندازه متن، ارقام، زبان، تقویم، ساعت، بازه پیش‌فرض، واحدها، نام ایستگاه‌ها، سیستم، تنظیمات دستگاه (قفل) |

## فایل‌های جدید
* `pc/static/` — رابط کاربری (HTML/CSS/JS ماژولار، بدون CDN، فونت محلی Vazirmatn)
* `pc/history.py` — مدل خواندنی سوابق؛ endpointهای `/api/stations/overview`، `/api/stations/{id}/history`، `/api/events`، `/api/summary`
* `pc/demo_feed.py` — داده نمایشی
* `pc/tests/test_history_api.py` — تست‌ها
