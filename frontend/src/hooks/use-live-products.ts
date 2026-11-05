import { useEffect, useState } from "react";
import { getProducts } from "@/lib/api-services";

export function useLiveProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getProducts().then((res) => {
      if (!active) return;
      if (res.ok && res.products?.length) {
        setProducts(res.products);
        renderProductsDOM(res.products);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { products, loading };
}

function renderProductsDOM(products: any[]) {
  // Find the container holding product cards
  const container = document.querySelector("main .px-4.flex.flex-col.gap-3");
  if (!container) return;

  // Clear static placeholder cards
  container.innerHTML = "";

  products.forEach((p: any) => {
    const card = document.createElement("div");
    card.className =
      "bg-white rounded-lg p-3.5 shadow-sm border border-slate-200 flex flex-col gap-2.5 transition-all hover:border-[#e40000]/60";

    const badgeColor =
      p.category === "Connectivity"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : p.category === "Security"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-blue-50 text-blue-800 border-blue-200";

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${badgeColor} border">
              ${p.category || "Enterprise"}
            </span>
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-semibold">
              ${p.requires_gstin ? "🛡️ Requires GSTIN" : "✓ No GST Needed"}
            </span>
          </div>
          <span class="text-[11px] font-mono text-slate-400">${p.product_id}</span>
          <h2 class="font-headline-sm text-base text-slate-900 leading-snug font-bold">
            ${p.product_name}
          </h2>
        </div>
        <div class="w-8 h-8 rounded bg-red-50 text-[#e40000] flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[18px]">cell_tower</span>
        </div>
      </div>

      <div class="flex flex-col gap-1 text-[13px] text-slate-600">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-[#e40000] shrink-0">speed</span>
          <span>${p.specs || p.speed || "High-speed enterprise dedicated connection"}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px] text-emerald-600 shrink-0">verified_user</span>
          <span>${p.sla || "99.5% Uptime SLA with 24/7 business helpdesk"}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-1 bg-slate-50 p-2 rounded text-center border border-slate-100">
        <div class="flex flex-col">
          <span class="text-[11px] text-slate-400 font-medium">Install SLA</span>
          <span class="text-[12px] font-semibold text-slate-800">${p.provisioning_days || 3} Days</span>
        </div>
        <div class="flex flex-col border-x border-slate-200">
          <span class="text-[11px] text-slate-400 font-medium">Min Staff</span>
          <span class="text-[12px] font-semibold text-slate-800">${p.min_employees || 1}+ Staff</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[11px] text-slate-400 font-medium">Commitment</span>
          <span class="text-[12px] font-semibold text-slate-800">${p.min_contract_months || 12} Months</span>
        </div>
      </div>

      <div class="flex items-center justify-between bg-slate-50 rounded p-2.5 border border-slate-200">
        <div class="flex flex-col">
          <div class="flex items-baseline gap-1">
            <span class="text-[18px] font-bold text-slate-900">₹${Number(p.mrc_inr || p.price || 0).toLocaleString("en-IN")}</span>
            <span class="text-[12px] text-slate-500">/mo</span>
          </div>
          <span class="text-[11px] text-emerald-700 font-semibold">Setup: ₹${Number(p.otc_inr || 0).toLocaleString("en-IN")}</span>
        </div>
        <a href="/customer/assistant" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#e40000] text-white text-xs font-bold shadow-sm hover:bg-red-700 transition">
          <span>Configure</span>
          <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
        </a>
      </div>
    `;

    container.appendChild(card);
  });
}

