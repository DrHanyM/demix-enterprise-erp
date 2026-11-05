
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const actionLabels: Record<string, string> = {
  "station.create": "إنشاء محطة",
  "station.update": "تعديل بيانات محطة",
  "station.status_change": "تغيير حالة محطة",
  "security.audit_engine.test": "اختبار محرك التدقيق",
};

export default function AuditLogsPage() {
  const logs = useQuery(api.auditLogs.listRecentAuditLogs);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const stations = useMemo(() => {
    if (!logs) return [];

    const unique = new Map<string, string>();

    logs.forEach((log) => {
      if (log.stationId) {
        unique.set(
          log.stationId,
          `${log.stationCode ? log.stationCode + " - " : ""}${log.stationName}`
        );
      }
    });

    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    const term = search.trim().toLowerCase();

    const from = dateFrom
      ? new Date(`${dateFrom}T00:00:00`).getTime()
      : null;

    const to = dateTo
      ? new Date(`${dateTo}T23:59:59.999`).getTime()
      : null;

    return logs.filter((log) => {
      const searchableText = [
        log.action,
        log.entityType,
        log.operationId,
        log.entityId ?? "",
        log.actorName,
        log.actorEmail,
        log.stationName,
        log.stationCode,
        JSON.stringify(log.details ?? {}),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);

      const matchesAction =
        actionFilter === "all" || log.action === actionFilter;

      const matchesStation =
        stationFilter === "all" || log.stationId === stationFilter;

      const matchesFrom = from === null || log.createdAt >= from;
      const matchesTo = to === null || log.createdAt <= to;

      return (
        matchesSearch &&
        matchesAction &&
        matchesStation &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [logs, search, actionFilter, stationFilter, dateFrom, dateTo]);

  function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(timestamp));
  }

  function formatDetails(details: unknown) {
    if (!details || typeof details !== "object") {
      return "لا توجد تفاصيل إضافية";
    }

    const data = details as Record<string, unknown>;

    const labels: Record<string, string> = {
      oldName: "الاسم السابق",
      newName: "الاسم الجديد",
      oldStatus: "الحالة السابقة",
      newStatus: "الحالة الجديدة",
      stationCode: "كود المحطة",
      stationName: "اسم المحطة",
      status: "الحالة",
      test: "نوع الاختبار",
      result: "النتيجة",
    };

    const values = Object.entries(data).map(([key, value]) => {
      let displayValue = String(value);

      if (value === "active") displayValue = "نشطة";
      if (value === "inactive") displayValue = "غير نشطة";
      if (value === "success") displayValue = "ناجح";

      return `${labels[key] ?? key}: ${displayValue}`;
    });

    return values.join(" | ");
  }

  const actions = logs
    ? Array.from(new Set(logs.map((log) => log.action)))
    : [];

  return (
    <main
      dir="rtl"
      style={{
        maxWidth: "1450px",
        margin: "30px auto",
        padding: "20px",
        fontFamily: "Tahoma, Arial, sans-serif",
        color: "#1e293b",
      }}
    >
      <header>
        <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>
          سجل التدقيق والرقابة
        </h1>

        <p style={{ color: "#64748b", marginTop: "8px" }}>
          متابعة وتوثيق العمليات المنفذة داخل نظام DEMIX ENTERPRISE ERP.
        </p>
      </header>

      <section
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginTop: "25px",
        }}
      >
        {[
          {
            label: "إجمالي السجلات المحملة",
            value: logs?.length ?? "—",
          },
          {
            label: "نتائج الفلترة",
            value: logs ? filteredLogs.length : "—",
          },
          {
            label: "أنواع العمليات",
            value: actions.length,
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "18px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              minWidth: "180px",
              flex: 1,
              background: "#fff",
            }}
          >
            <div style={{ color: "#64748b", fontSize: "14px" }}>
              {item.label}
            </div>
            <strong style={{ fontSize: "26px" }}>{item.value}</strong>
          </div>
        ))}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
          marginTop: "25px",
          padding: "18px",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          background: "#fff",
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث باسم المستخدم أو المحطة أو العملية..."
          style={inputStyle}
        />

        <select
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="all">كل العمليات</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {actionLabels[action] ?? action}
            </option>
          ))}
        </select>

        <select
          value={stationFilter}
          onChange={(event) => setStationFilter(event.target.value)}
          style={inputStyle}
        >
          <option value="all">كل المحطات</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>

        <div>
          <label style={labelStyle}>من تاريخ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>إلى تاريخ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setSearch("");
            setActionFilter("all");
            setStationFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
          style={{
            ...inputStyle,
            background: "#f1f5f9",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          إعادة ضبط الفلاتر
        </button>
      </section>

      {!logs ? (
        <p style={{ marginTop: "25px" }}>جارٍ تحميل سجل التدقيق...</p>
      ) : (
        <section
          style={{
            marginTop: "20px",
            overflowX: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            background: "#fff",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "right",
              minWidth: "1100px",
            }}
          >
            <thead style={{ background: "#f1f5f9" }}>
              <tr>
                {[
                  "التاريخ والوقت",
                  "منفذ العملية",
                  "المحطة",
                  "العملية",
                  "التفاصيل",
                  "رقم العملية",
                ].map((heading) => (
                  <th key={heading} style={headerStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={cellStyle}>{formatDate(log.createdAt)}</td>

                  <td style={cellStyle}>
                    <strong>{log.actorName}</strong>
                    {log.actorEmail && (
                      <div style={{ color: "#64748b", fontSize: "12px" }}>
                        {log.actorEmail}
                      </div>
                    )}
                  </td>

                  <td style={cellStyle}>
                    {log.stationCode
                      ? `${log.stationCode} - ${log.stationName}`
                      : log.stationName}
                  </td>

                  <td style={cellStyle}>
                    {actionLabels[log.action] ?? log.action}
                  </td>

                  <td style={{ ...cellStyle, minWidth: "280px" }}>
                    {formatDetails(log.details)}
                  </td>

                  <td
                    style={{
                      ...cellStyle,
                      fontSize: "11px",
                      direction: "ltr",
                      textAlign: "left",
                    }}
                  >
                    {log.operationId}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: "25px", textAlign: "center" }}
                  >
                    لا توجد سجلات مطابقة لمعايير البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <p style={{ marginTop: "15px", color: "#64748b", fontSize: "13px" }}>
        يتم عرض أحدث 100 سجل. هذه الشاشة مخصصة للقراءة فقط، ولا تتيح تعديل أو حذف سجلات التدقيق.
      </p>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: "11px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#fff",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "13px",
  color: "#64748b",
};

const headerStyle = {
  padding: "14px",
  borderBottom: "1px solid #ddd",
  whiteSpace: "nowrap" as const,
};

const cellStyle = {
  padding: "13px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top" as const,
};
