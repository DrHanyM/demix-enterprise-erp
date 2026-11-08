# DeMix Clerk MCP — اتصال قراءة آمن

هذا خادم MCP محلي يربط ChatGPT (عبر MCP Remote/HTTPS بعد إعداد نفق آمن) بواجهة Clerk Backend API.

## الوضع الأمني الحالي
- قراءة فقط: فحص الاتصال، عرض المستخدمين، قراءة مستخدم، عرض الدعوات، قراءة دعوة.
- لا توجد أدوات لإنشاء/حذف/تعطيل مستخدم أو دعوة.
- لا يقرأ أو يعرض `private_metadata` أو مفاتيح الأسرار.
- يستمع على `127.0.0.1` فقط.
- كل طلب MCP محمي بـ Bearer token مستقل عن Clerk secret.
- لا ترفع `.env` إلى GitHub أو Vercel.

## المتطلبات
- Node.js 20 أو أحدث.
- مفتاح Clerk Secret Key صالح لنفس Development instance الخاصة بـ DEMIX ENTERPRISE ERP.
- لا تستخدم مفتاح Production لهذا الاختبار.

## التشغيل على Windows
1. فك ضغط الحزمة داخل مجلد محلي خاص، مثل:
   `E:\Program Files\HR\CHATGPT\tools\demix-clerk-mcp`
2. افتح PowerShell داخل المجلد.
3. نفّذ:
   ```powershell
   Copy-Item .env.example .env
   npm install
   ```
4. أنشئ رمز MCP عشوائيًا:
   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   $token = [Convert]::ToHexString($bytes).ToLower()
   notepad .env
   ```
5. داخل `.env` ضع مفتاح Clerk الصحيح محليًا، وضع الرمز الناتج في `MCP_ACCESS_TOKEN`. لا ترسل أيًا منهما في المحادثة.
6. شغّل:
   ```powershell
   npm start
   ```
7. تحقق محليًا من:
   `http://127.0.0.1:8787/health`

## توصيل ChatGPT
هذا الخادم محلي ولا يصبح مرئيًا لـ ChatGPT تلقائيًا. يلزم نشره على HTTPS موثوق أو إنشاء نفق HTTPS آمن إلى الجهاز، ثم إضافة عنوان `/mcp` كاتصال MCP مخصص في واجهة ChatGPT إذا كانت هذه الميزة متاحة في حسابك. استخدم مصادقة Bearer token إذا كانت واجهة الاتصال تدعمها. لا تجعل الخادم عامًا دون المصادقة.

لا تستخدم رابط HTTP محليًا مباشرة في إعداد MCP السحابي. لا تفتح المنفذ 8787 على الإنترنت ولا تستخدم Vercel bypass secret.

## أدوات MCP
- `clerk_connection_check`
- `clerk_list_users`
- `clerk_get_user`
- `clerk_list_invitations`
- `clerk_get_invitation`

## ملاحظات
- `CLERK_SECRET_KEY` يجب أن يكون من Clerk → Instance → API keys لنفس instance.
- لا يثبت نجاح فحص الاتصال أن Clerk webhook يعمل؛ فحص webhook يحتاج مراجعة إعدادات Signing Secret وVercel ونتيجة HTTP من Svix.
- الحزمة لا تغيّر أي بيانات في Clerk أو Convex.
