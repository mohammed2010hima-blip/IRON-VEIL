# نشر اللعبة

مجلد `publish/` جاهز للنشر كصفحة ويب ثابتة. يحتوي `index.html` في جذر المجلد وكل ملفات النماذج والحركات والصورة والصوت التي تحتاجها اللعبة، من دون نماذج GLB الكبيرة غير المستخدمة.

## أسرع طريقة: Cloudflare Pages

1. سجّل الدخول إلى Cloudflare وافتح **Workers & Pages**.
2. اختر **Create application → Pages → Drag and drop your files**.
3. اكتب اسمًا للمشروع وارفع مجلد `publish/`.
4. اختر **Deploy site**. سيظهر رابط اللعبة على نطاق `pages.dev`.

المجلد يحتوي 22 ملفًا (نحو 129.6 MiB)، وأكبر ملف فيه نحو 11.3 MiB؛ وهذا أقل من حد 25 MiB للملف الواحد في Pages. النشر المباشر مناسب للتحديث اليدوي. إذا أردت أن يُعاد النشر تلقائيًا عند كل تحديث، أنشئ مستودع Git واربطه بـ Pages من البداية؛ مشروع Direct Upload لا يمكن تحويله لاحقًا إلى Git integration.

اللعبة صفحة ثابتة ولا تحتاج إلى تشغيل `server.js` على الاستضافة. لكنها تحمل Three.js من jsDelivr، لذلك يحتاج اللاعب إلى اتصال بالإنترنت عند فتح اللعبة.

المراجع: [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) و[حدود Pages](https://developers.cloudflare.com/pages/platform/limits/).
