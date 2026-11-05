import { useEffect, useState } from "react";
import { getOrders, getOrderTracking } from "@/lib/api-services";

export function useLiveTrack() {
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    getOrders().then((res) => {
      if (res.ok && res.orders?.length) {
        setOrders(res.orders);
        renderOrderSelector(res.orders);
        loadOrderDetails(res.orders[0].order_id);
      }
    });
  }, []);

  const loadOrderDetails = async (orderId: string) => {
    try {
      const res = await getOrderTracking({ data: { orderId } });
      if (res.ok && res.order) {
        setActiveOrder(res.order);
        renderLiveTimeline(res.order);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderOrderSelector = (orderList: any[]) => {
    const group = document.getElementById("order-selector-group");
    if (!group) return;

    group.innerHTML = "";

    orderList.slice(0, 5).forEach((order: any, idx: number) => {
      const btn = document.createElement("button");
      btn.className = `order-card w-full text-left p-space-md rounded-xl bg-surface-container-lowest shadow-sm transition-all relative overflow-hidden ${
        idx === 0 ? "" : "opacity-85 hover:opacity-100"
      }`;
      btn.id = `card-${order.order_id}`;
      if (idx === 0) {
        btn.style.boxShadow = "0 0 0 2px #E40000, 0 4px 12px rgba(228, 0, 0, 0.08)";
      }

      const statusBadge =
        order.current_stage_index === 3
          ? "bg-[#ECFDF5] text-[#065F46]"
          : "bg-[#FEF3C7] text-[#92400E]";

      btn.innerHTML = `
        <div class="flex items-start justify-between gap-space-sm">
          <div class="flex items-center gap-space-xs">
            <span class="w-2.5 h-2.5 rounded-full ${idx === 0 ? "bg-[#E40000]" : "bg-slate-300"}"></span>
            <span class="font-code-md text-code-md font-semibold text-on-surface">#${order.order_id}</span>
          </div>
          <span class="inline-flex items-center px-space-xs py-space-xxs rounded-full ${statusBadge} font-label-sm text-label-sm">
            ${order.status || "In Progress"}
          </span>
        </div>
        <div class="mt-space-xs flex items-baseline justify-between">
          <h3 class="font-headline-sm text-headline-sm text-on-surface">${order.bundle_name || order.customer_name}</h3>
          <span class="font-code-md text-code-md font-semibold text-on-surface">₹${Number(order.monthly_cost || 0).toLocaleString("en-IN")}<span class="font-body-sm text-body-sm text-on-surface-variant">/mo</span></span>
        </div>
        <div class="mt-space-xs flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
          <span>${order.customer_name || "Enterprise Customer"}</span>
          <span class="font-code-sm text-code-sm">${order.contract_months || 12} Mos SLA</span>
        </div>
      `;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".order-card").forEach((c: any) => {
          c.style.boxShadow = "none";
          c.classList.add("opacity-85");
        });
        btn.style.boxShadow = "0 0 0 2px #E40000, 0 4px 12px rgba(228, 0, 0, 0.08)";
        btn.classList.remove("opacity-85");
        loadOrderDetails(order.order_id);
      });

      group.appendChild(btn);
    });
  };

  const renderLiveTimeline = (order: any) => {
    const headline = document.getElementById("tracking-headline");
    const subtitle = document.getElementById("tracking-subtitle");
    const container = document.getElementById("timeline-container");

    if (headline) headline.textContent = `Order #${order.order_id} Tracking Lifecycle`;
    if (subtitle) subtitle.textContent = `${order.customer_name} • ${order.bundle_name}`;
    if (!container) return;

    container.innerHTML = "";

    const stages = [
      {
        title: "Order Confirmed & Commercial MSA",
        meta: order.created_at || "Verified",
        desc: "KYC, GSTIN Mod-36 checksum, and DPDP Act corporate verification completed.",
      },
      {
        title: "CPE Hardware Allocation",
        meta: "Dispatched",
        desc: "Cisco Dual-WAN Router / Wi-Fi 6 Gateway allocated from Regional Logistics Hub.",
      },
      {
        title: "Field Splicing & Optical Termination",
        meta: "In Progress",
        desc: "Field Engineer Rajesh Sharma assigned for OTDR -18 dBm splicing & premise drop.",
      },
      {
        title: "Circuit Delivered & Live 99.9% SLA",
        meta: "Handover",
        desc: "Terminal optical power test passed, static IP bound, active commercial SLA clock initialized.",
      },
    ];

    const currentIdx = order.current_stage_index ?? 1;

    stages.forEach((step, idx) => {
      const isCompleted = idx < currentIdx;
      const isActive = idx === currentIdx;
      const isLast = idx === stages.length - 1;

      const stepRow = document.createElement("div");
      stepRow.className = "relative flex items-start gap-space-md";

      let iconHtml = "";
      let badgeClasses = "";
      let badgeText = "";

      if (isCompleted) {
        iconHtml = `
          <div class="w-8 h-8 rounded-full bg-[#ECFDF5] text-[#065F46] flex items-center justify-center flex-shrink-0 z-10 shadow-sm">
            <span class="material-symbols-outlined text-[18px]">check</span>
          </div>
        `;
        badgeClasses = "bg-[#ECFDF5] text-[#065F46]";
        badgeText = "Verified";
      } else if (isActive) {
        iconHtml = `
          <div class="w-8 h-8 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center flex-shrink-0 z-10 shadow-sm relative">
            <span class="absolute w-full h-full rounded-full bg-[#F59E0B] opacity-30 animate-ping"></span>
            <span class="material-symbols-outlined text-[18px]">autorenew</span>
          </div>
        `;
        badgeClasses = "bg-[#FEF3C7] text-[#92400E]";
        badgeText = "In Progress";
      } else {
        iconHtml = `
          <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 z-10">
            <span class="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
          </div>
        `;
        badgeClasses = "bg-slate-100 text-slate-500";
        badgeText = "Next Step";
      }

      const connectorHtml = isLast
        ? ""
        : `<div class="absolute left-4 top-8 bottom-0 w-0.5 -ml-[1px] ${
            isCompleted ? "bg-[#10B981]" : "bg-slate-200"
          } -z-0"></div>`;

      stepRow.innerHTML = `
        ${connectorHtml}
        ${iconHtml}
        <div class="flex flex-col flex-1 pb-space-md">
          <div class="flex items-center justify-between gap-space-xs">
            <h4 class="font-headline-sm text-headline-sm ${
              !isCompleted && !isActive ? "text-slate-400" : "text-slate-900"
            }">${step.title}</h4>
            <span class="font-label-sm text-label-sm px-space-xs py-space-xxs rounded-full ${badgeClasses}">${badgeText}</span>
          </div>
          <p class="font-code-sm text-code-sm text-slate-500 mt-space-xxs">${step.meta}</p>
          <p class="font-body-sm text-body-sm text-slate-600 mt-space-xs leading-relaxed">${step.desc}</p>
        </div>
      `;

      container.appendChild(stepRow);
    });
  };

  return { orders, activeOrder };
}

