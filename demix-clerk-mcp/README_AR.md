# DeMix Clerk MCP — OAuth قراءة آمنة

خادم MCP محلي يتيح قراءة بيانات مستخدمي ودعوات Clerk من خلال أدوات MCP، مع مصادقة Clerk OAuth وقصر الوصول على حساب إداري واحد.

## الوضع الأمني

- خمس أدوات قراءة فقط: فحص الاتصال، عرض المستخدمين، قراءة مستخدم، عرض الدعوات، وقراءة دعوة.
- لا توجد أدوات لإنشاء أو حذف أو تعديل المستخدمين أو الدعوات.
- لا يقرأ أو يعرض `private_metadata` أو مفاتيح الأسرار.
- لا يقبل إلا Clerk OAuth access tokens؛ لا يقبل Session Tokens أو Bearer tokens ثابتة.
- يتحقق Clerk من صلاحية الرمز وتوقيعه وانتهائه، ويُطلب منه التحقق من الجمهور المطابق تمامًا لـ `MCP_RESOURCE_URL`.
- يسمح فقط لمعرف المسؤول المحدد في `DEMIX_ADMIN_USER_ID`.
- يستمع محليًا على `127.0.0.1` فقط.
- لا ترفع ملف `.env` إلى GitHub أو Vercel.

## المتطلبات

- Node.js 20 أو أحدث.
- Clerk Development instance الخاصة بتطبيق DEMIX ENTERPRISE ERP.
- مفتاح Clerk Secret Key ومفتاح Publishable Key لنفس الـ instance.

## الإعداد على Windows

1. افتح PowerShell داخل مجلد `demix-clerk-mcp`.
2. أنشئ ملف الإعداد المحلي:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. أدخل القيم محليًا في `.env` فقط:
   - `CLERK_SECRET_KEY`: مفتاح Development Secret Key.
   - `CLERK_PUBLISHABLE_KEY`: مفتاح Development Publishable Key.
   - `DEMIX_ADMIN_USER_ID`: معرف المسؤول المعتمد.
   - `MCP_RESOURCE_URL`: `http://localhost:8787/mcp`.
   - `PORT`: `8787`.

4. ثبّت الاعتماديات وشغّل الخادم:

   ```powershell
   npm ci
   npm start
   ```

5. تحقق من حالة الخادم:
   `http://127.0.0.1:8787/health`

## مسارات OAuth

- مورد MCP: `http://localhost:8787/mcp`
- Protected Resource Metadata:
  `http://localhost:8787/.well-known/oauth-protected-resource/mcp`
- Authorization Server Metadata:
  `http://localhost:8787/.well-known/oauth-authorization-server`

يجب أن يكون عنوان المورد في إعداد Clerk مطابقًا تمامًا لقيمة `MCP_RESOURCE_URL` المستخدمة عند تشغيل الخادم. إذا تغير المنفذ أو العنوان، يجب تحديث الإعداد في الطرفين.

## الاختبارات

```powershell
npm ci
npm test
```

تتضمن الاختبارات التحقق من غياب الرمز، والرموز المنتهية أو ذات الجمهور الخاطئ، ورفض الحسابات غير الإدارية، ورفض Session Tokens، والطلبات المتزامنة، واكتشاف بيانات Clerk الوصفية، وفحص HTTP للخادم.

اختبارات المصادقة السلبية والإيجابية تستخدم محاكاة للتحقق من استجابة Clerk؛ اختبار تسجيل دخول OAuth تفاعلي باستخدام حساب حقيقي يتطلب عميل MCP ومتصفحًا مسجلًا لدى Clerk.

## ملاحظات مهمة

- عنوان localhost لا يمكن لخوادم ChatGPT السحابية الوصول إليه مباشرة. يجب أن يكون عميل MCP على الجهاز نفسه، أو استخدام استضافة HTTPS مناسبة بعد إعدادها وتأمينها.
- خادم `server.mjs` الحالي خادم Node محلي، وليس Vercel Serverless Function. نشر مشروع ERP على Vercel لا يعني نشر هذا الخادم تلقائيًا.
- لا تعطل حماية SSO في Vercel لمجرد إتاحة MCP، ولا تستخدم Vercel bypass secret كوسيلة مصادقة.
- لا تستخدم Production keys أثناء الاختبار المحلي.
