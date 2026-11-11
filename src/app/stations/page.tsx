
"use client";

import BackToDashboard from "@/components/BackToDashboard";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export default function StationsPage() {
  const { user: clerkUser } = useUser();
  const stations = useQuery(api.stations.listStations);

  const createStation = useMutation(api.stations.createStation);
  const seedInitialStations = useMutation(api.stations.seedInitialStations);
  const updateStation = useMutation(api.stations.updateStation);
  const setStationStatus = useMutation(api.stations.setStationStatus);

  const [name, setName] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"stations"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredStations = useMemo(() => {
    if (!stations) return [];

    const term = search.trim().toLocaleLowerCase();

    return stations.filter(
      (station) =>
        station.name.toLocaleLowerCase().includes(term) ||
        station.code.toLocaleLowerCase().includes(term)
    );
  }, [stations, search]);

  async function handleSeedInitialStations() {
    if (loading || seeding) return;
    if (!clerkUser?.id) {
      setErrorMessage("تعذر تحديد حساب المسؤول الحالي. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      return;
    }
    const confirmed = window.confirm(
      "سيتم إضافة المحطات الست المعتمدة غير الموجودة فقط. لن يتم حذف أو استبدال أي سجل قائم. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    setSeeding(true);
    setMessage("");
    setErrorMessage("");
    try {
      const result = await seedInitialStations({
        operationId: `approved-initial-stations-v1-${clerkUser.id}`,
      });
      setMessage(result.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "تعذر تسجيل المحطات المعتمدة.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setErrorMessage("يرجى إدخال اسم المحطة.");
      setMessage("");
      return;
    }

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const result = await createStation({
        name: name.trim(),
        operationId: `station-create-${crypto.randomUUID()}`,
      });

      setMessage(
        result.created
          ? `تم إنشاء المحطة ${result.station.name} بالكود ${result.station.code}.`
          : result.message
      );

      if (result.created) setName("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر إنشاء المحطة."
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditing(
    stationId: Id<"stations">,
    stationName: string
  ) {
    setEditingId(stationId);
    setEditingName(stationName);
    setMessage("");
    setErrorMessage("");
  }

  async function handleUpdate() {
    if (!editingId || !editingName.trim()) {
      setErrorMessage("يرجى إدخال اسم المحطة.");
      return;
    }

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const result = await updateStation({
        stationId: editingId,
        name: editingName.trim(),
        operationId: `station-update-${crypto.randomUUID()}`,
      });

      setMessage(result.message || "تم تحديث بيانات المحطة بنجاح.");
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر تعديل المحطة."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(
    stationId: Id<"stations">,
    currentStatus: "active" | "inactive"
  ) {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      nextStatus === "active"
        ? "هل تريد تفعيل هذه المحطة؟"
        : "هل تريد إيقاف هذه المحطة؟"
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const result = await setStationStatus({
        stationId,
        status: nextStatus,
        operationId: `station-status-${crypto.randomUUID()}`,
      });

      setMessage(result.message || "تم تحديث حالة المحطة بنجاح.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "تعذر تغيير حالة المحطة."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        maxWidth: "1150px",
        margin: "35px auto",
        padding: "20px",
        fontFamily: "Tahoma, Arial, sans-serif",
        color: "#1e293b",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
        <h1 style={{ fontSize: "28px", fontWeight: "bold" }}>
          إدارة المحطات
        </h1>

        <p style={{ color: "#64748b", marginTop: "8px" }}>
          إضافة واستعراض وتعديل بيانات محطات الشركة وإدارة حالتها.
        </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><Link href="/stations/tools" style={{ padding: "9px 13px", border: "1px solid #99f6e4", borderRadius: "8px", color: "#0f766e", background: "#f0fdfa", textDecoration: "none", fontSize: "13px", fontWeight: 700 }}>أدوات المحطات والمزامنة</Link><BackToDashboard /></div>
      </header>

      <section
        style={{
          marginTop: "25px",
          padding: "20px",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "19px", fontWeight: "bold" }}>
            إضافة محطة جديدة
          </h2>
          <button
            type="button"
            onClick={() => void handleSeedInitialStations()}
            disabled={loading || seeding}
            style={{
              padding: "10px 16px",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              background: "#eff6ff",
              color: "#1d4ed8",
              cursor: loading || seeding ? "wait" : "pointer",
            }}
          >
            {seeding ? "جارٍ التحقق والإضافة..." : "إضافة المحطات الست المعتمدة"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "15px",
            flexWrap: "wrap",
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCreate();
            }}
            placeholder="اسم المحطة الجديدة"
            maxLength={100}
            disabled={loading}
            style={{
              flex: "1",
              minWidth: "220px",
              padding: "12px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
            }}
          />

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={loading}
            style={{
              padding: "12px 22px",
              border: "none",
              borderRadius: "8px",
              background: "#2563eb",
              color: "#fff",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "جارٍ الحفظ..." : "إضافة المحطة"}
          </button>
        </div>
      </section>

      {message && (
        <p
          role="status"
          style={{
            marginTop: "15px",
            padding: "12px",
            borderRadius: "8px",
            background: "#ecfdf5",
            color: "#047857",
          }}
        >
          {message}
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          style={{
            marginTop: "15px",
            padding: "12px",
            borderRadius: "8px",
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          {errorMessage}
        </p>
      )}

      {editingId && (
        <section
          style={{
            marginTop: "20px",
            padding: "20px",
            border: "1px solid #93c5fd",
            borderRadius: "12px",
            background: "#eff6ff",
          }}
        >
          <h2 style={{ fontWeight: "bold", marginBottom: "12px" }}>
            تعديل اسم المحطة
          </h2>

          <input
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
            maxLength={100}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              marginBottom: "12px",
            }}
          />

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => void handleUpdate()}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: "8px",
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              حفظ التعديل
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditingName("");
              }}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              إلغاء
            </button>
          </div>
        </section>
      )}

      <section style={{ marginTop: "30px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: "bold" }}>
            قائمة المحطات
          </h2>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالاسم أو الكود..."
            style={{
              padding: "10px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              minWidth: "230px",
            }}
          />
        </div>

        {!stations ? (
          <p style={{ marginTop: "20px" }}>جارٍ تحميل المحطات...</p>
        ) : (
          <div
            style={{
              marginTop: "15px",
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
              }}
            >
              <thead style={{ background: "#f1f5f9" }}>
                <tr>
                  {["الكود", "اسم المحطة", "الحالة", "الإجراءات"].map(
                    (heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: "14px",
                          borderBottom: "1px solid #ddd",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredStations.map((station) => (
                  <tr key={station._id}>
                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid #eee",
                        fontWeight: "bold",
                      }}
                    >
                      {station.code}
                    </td>

                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      {station.name}
                    </td>

                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 12px",
                          borderRadius: "20px",
                          background:
                            station.status === "active" ? "#dcfce7" : "#fee2e2",
                          color:
                            station.status === "active" ? "#166534" : "#991b1b",
                          fontSize: "13px",
                        }}
                      >
                        {station.status === "active" ? "نشطة" : "غير نشطة"}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            startEditing(station._id, station.name)
                          }
                          disabled={loading}
                          style={{
                            padding: "7px 12px",
                            border: "1px solid #bfdbfe",
                            borderRadius: "7px",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            cursor: "pointer",
                          }}
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleStatusChange(
                              station._id,
                              station.status
                            )
                          }
                          disabled={loading}
                          style={{
                            padding: "7px 12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: "7px",
                            background:
                              station.status === "active" ? "#fff7ed" : "#f0fdf4",
                            color:
                              station.status === "active" ? "#c2410c" : "#15803d",
                            cursor: "pointer",
                          }}
                        >
                          {station.status === "active"
                            ? "إيقاف المحطة"
                            : "تفعيل المحطة"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredStations.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: "20px", textAlign: "center" }}
                    >
                      لا توجد محطات مطابقة للبحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {stations && (
          <p style={{ color: "#64748b", marginTop: "12px" }}>
            إجمالي المحطات: {stations.length} | نتائج البحث:{" "}
            {filteredStations.length}
          </p>
        )}
      </section>
    </main>
  );
}
