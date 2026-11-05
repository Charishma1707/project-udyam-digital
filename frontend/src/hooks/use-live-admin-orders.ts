import { useEffect, useState } from "react";
import { getOrders } from "@/lib/api-services";

export function useLiveAdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    getOrders().then((res) => {
      if (res.ok && res.orders?.length) {
        setOrders(res.orders);
        renderOrdersList(res.orders);
      }
    });
  }, []);

  const renderOrdersList = (orderList: any[]) => {
    const container = document.querySelector("section.flex-1 .flex.flex-col.gap-3.py-4");
    if (!container) return;
    container.innerHTML = "";

    orderList.forEach((order: any) => {
      const card = document.createElement("div");
      card.className =
        "p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all flex flex-col gap-3 shadow-sm";

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="font-code-sm text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">#${order.order_id}</span>
              <span class="text-slate-400">•</span>
              <span class="text-xs text-slate-500 font-medium">${order.business_type || "MSME"}</span>
            </div>
            <h2 class="text-base font-bold text-slate-900 tracking-tight mt-1">${order.customer_name || "Enterprise Client"}</h2>
            <p class="text-xs text-slate-500">Contact: Primary Authorised Signatory</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            ${order.status || "In Provisioning"}
          </span>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 text-xs">
          <span class="material-symbols-outlined text-[16px] text-blue-600">router</span>
          <span class="truncate font-medium">${order.bundle_name || "Dedicated Leased Line & Security"}</span>
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-slate-100">
          <div class="text-xs text-slate-500">
            Monthly Retainer: <span class="font-code-md text-sm font-bold text-slate-900">₹${Number(order.monthly_cost || 0).toLocaleString("en-IN")} / mo</span>
          </div>
          <a href="/admin/status" class="text-xs text-[#ED1B24] hover:text-red-700 flex items-center gap-1 font-bold transition-colors">
            Update Status
            <span class="material-symbols-outlined text-[16px]">chevron_right</span>
          </a>
        </div>
      `;

      container.appendChild(card);
    });
  };

  return { orders };
}

