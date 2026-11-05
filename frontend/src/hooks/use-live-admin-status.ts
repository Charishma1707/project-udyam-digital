import { useEffect, useState } from "react";
import { getOrders, updateOrderStatus } from "@/lib/api-services";

export function useLiveAdminStatus() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [targetStage, setTargetStage] = useState<number>(2);

  useEffect(() => {
    getOrders().then((res) => {
      if (res.ok && res.orders?.length) {
        setOrders(res.orders);
        setSelectedOrder(res.orders[0]);
        renderOrderQueue(res.orders);
        populateSelectedOrder(res.orders[0]);
      }
    });

    setupSyncButton();
  }, []);

  const renderOrderQueue = (list: any[]) => {
    const container = document.getElementById("orderQueueContainer");
    if (!container) return;
    container.innerHTML = "";

    list.slice(0, 6).forEach((order: any, idx: number) => {
      const card = document.createElement("div");
      card.className = `order-card cursor-pointer p-3.5 rounded-xl bg-white border-2 ${
        idx === 0 ? "border-[#ED1B24]" : "border-slate-200 hover:border-slate-300"
      } shadow-sm transition-all flex items-center justify-between`;

      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">#${order.order_id}</span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-semibold border border-blue-200">
              ${order.status || "In Queue"}
            </span>
          </div>
          <h4 class="text-sm text-slate-900 font-semibold truncate mt-1.5">${order.customer_name || "Enterprise Customer"}</h4>
          <p class="text-xs text-slate-500 truncate mt-0.5">${order.bundle_name || "Suite"} • <span class="font-mono font-semibold text-slate-700">₹${Number(order.monthly_cost || 0).toLocaleString("en-IN")}/mo</span></p>
        </div>
        <div class="shrink-0 flex items-center ${idx === 0 ? "text-[#ED1B24]" : "text-slate-400"} ml-2 icon-indicator">
          <span class="material-symbols-outlined text-[22px]">${idx === 0 ? "check_circle" : "radio_button_unchecked"}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll("#orderQueueContainer .order-card").forEach((c: any) => {
          c.classList.remove("border-[#ED1B24]");
          c.classList.add("border-slate-200");
          const ic = c.querySelector(".icon-indicator span");
          if (ic) {
            ic.textContent = "radio_button_unchecked";
            c.querySelector(".icon-indicator")?.classList.remove("text-[#ED1B24]");
            c.querySelector(".icon-indicator")?.classList.add("text-slate-400");
          }
        });

        card.classList.add("border-[#ED1B24]");
        card.classList.remove("border-slate-200");
        const ic = card.querySelector(".icon-indicator span");
        if (ic) {
          ic.textContent = "check_circle";
          card.querySelector(".icon-indicator")?.classList.add("text-[#ED1B24]");
          card.querySelector(".icon-indicator")?.classList.remove("text-slate-400");
        }

        setSelectedOrder(order);
        populateSelectedOrder(order);
      });

      container.appendChild(card);
    });
  };

  const populateSelectedOrder = (order: any) => {
    const idEl = document.getElementById("activeOrderIdDisplay");
    const nameEl = document.getElementById("activeCustomerNameDisplay");
    const pocEl = document.getElementById("activePocDisplay");
    const priceEl = document.getElementById("activePlanPrice");
    const stageText = document.getElementById("currentStageBadgeText");

    if (idEl) idEl.textContent = `#${order.order_id}`;
    if (nameEl) nameEl.textContent = order.customer_name || "Enterprise Client";
    if (pocEl) pocEl.textContent = `${order.business_type || "Commercial Enterprise"} • Contact Verified`;
    if (priceEl) priceEl.textContent = `₹${Number(order.monthly_cost || 0).toLocaleString("en-IN")}/mo`;
    if (stageText) stageText.textContent = `Current: Stage ${(order.current_stage_index ?? 0) + 1} of 4`;
  };

  const setupSyncButton = () => {
    const btn = document.getElementById("syncDatabaseBtn");
    const feedback = document.getElementById("syncFeedback");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const idEl = document.getElementById("activeOrderIdDisplay");
      const orderId = idEl?.textContent?.replace("#", "") || "S00060";
      const overrideSelect = document.getElementById("statusOverrideSelect") as HTMLSelectElement | null;
      const statusText = overrideSelect?.options[overrideSelect.selectedIndex]?.text || "Dispatched & Splicing";

      btn.classList.add("opacity-70");
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span class="text-sm">Syncing with Neon DB...</span>`;

      try {
        const res = await updateOrderStatus({
          data: {
            orderId,
            status: statusText,
            stageIndex: targetStage,
            remark: "Updated via Udyam Operations Console",
          },
        });

        if (feedback) {
          feedback.classList.remove("hidden");
          feedback.innerHTML = `<span class="material-symbols-outlined text-[16px]">check_circle</span><span>Database updated: Order #${orderId} synced to PostgreSQL!</span>`;
          setTimeout(() => feedback.classList.add("hidden"), 4000);
        }
      } catch (err) {
        console.error(err);
      } finally {
        btn.classList.remove("opacity-70");
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">sync</span><span class="text-sm">Update & Sync Database</span>`;
      }
    });
  };

  return { orders, selectedOrder };
}

