import { createServerFn } from "@tanstack/react-start";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function backendUrl() {
  return (process.env["UDYAM_BACKEND_URL"] || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

// 1. PRODUCTS API
export const getProducts = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch(`${backendUrl()}/api/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, products: data.products || [] };
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return { ok: false, error: String(err), products: [] };
  }
});

// 2. KYC APPLICANTS & VERIFICATION API
export const getKycApplicants = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch(`${backendUrl()}/api/kyc/applicants`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, applicants: data.applicants || [] };
  } catch (err) {
    return { ok: false, error: String(err), applicants: [] };
  }
});

export const verifyApplicant = createServerFn({ method: "POST" })
  .inputValidator((d: { applicantId: string }) => d)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${backendUrl()}/api/kyc/verify-applicant/${data.applicantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { ok: true, result: json };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

// 3. ORDERS API
export const getOrders = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch(`${backendUrl()}/api/orders`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, orders: data.orders || [] };
  } catch (err) {
    return { ok: false, error: String(err), orders: [] };
  }
});

export const getOrderTracking = createServerFn({ method: "GET" })
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${backendUrl()}/api/orders/${data.orderId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { ok: true, order: json };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string; status: string; stageIndex?: number; remark?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${backendUrl()}/api/orders/${data.orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: data.status,
          stageIndex: data.stageIndex,
          remark: data.remark,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return { ok: true, order: json.order };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

// 4. SALES DASHBOARD & ESCALATIONS API
export const getSalesDashboard = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch(`${backendUrl()}/api/sales/dashboard`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, dashboard: data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

