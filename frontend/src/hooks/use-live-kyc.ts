import { useEffect, useState } from "react";
import { getKycApplicants, verifyApplicant } from "@/lib/api-services";

export function useLiveKyc() {
  const [applicants, setApplicants] = useState<any[]>([]);
  const [selectedApplicant, setSelectedApplicant] = useState("K01");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    getKycApplicants().then((res) => {
      if (res.ok && res.applicants?.length) {
        setApplicants(res.applicants);
        renderApplicantSelector(res.applicants);
      }
    });

    // Auto verify K01 on mount to populate verified state
    runVerification("K01");
  }, []);

  const runVerification = async (appId: string) => {
    setVerifying(true);
    const feedback = document.getElementById("kyc-status-feedback");
    if (feedback) {
      feedback.textContent = `Verifying Applicant ${appId} against GSTN & Udyam Registry...`;
      feedback.className = "text-xs font-semibold text-blue-600 animate-pulse";
    }

    try {
      const res = await verifyApplicant({ data: { applicantId: appId } });
      if (res.ok && res.result) {
        updateKycUI(res.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerifying(false);
    }
  };

  const renderApplicantSelector = (list: any[]) => {
    const banner = document.querySelector('section[data-purpose="verification-header-banner"]');
    if (!banner || document.getElementById("applicant-select-wrapper")) return;

    const selectorDiv = document.createElement("div");
    selectorDiv.id = "applicant-select-wrapper";
    selectorDiv.className = "flex items-center justify-between pt-2 border-t border-slate-100 mt-2";
    selectorDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-700">Test Applicant:</span>
        <select id="applicant-select" class="text-xs bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 font-semibold text-slate-800 focus:outline-none">
          ${list.map((a: any) => `<option value="${a.applicant_id}">Applicant ${a.applicant_id} (${a.document_count} docs)</option>`).join("")}
        </select>
      </div>
      <div id="kyc-status-feedback" class="text-xs font-bold text-emerald-600">✓ DPDP Act Verified</div>
    `;

    banner.appendChild(selectorDiv);

    const sel = document.getElementById("applicant-select") as HTMLSelectElement | null;
    if (sel) {
      sel.addEventListener("change", (e) => {
        const target = e.target as HTMLSelectElement;
        setSelectedApplicant(target.value);
        runVerification(target.value);
      });
    }
  };

  const updateKycUI = (data: any) => {
    const feedback = document.getElementById("kyc-status-feedback");
    if (feedback) {
      feedback.textContent = `✓ ${data.status || "APPROVED"} (Errors: ${data.error_count || 0})`;
      feedback.className = "text-xs font-bold text-emerald-600";
    }

    // Update GST card
    const gstData = data.extracted_data?.gst;
    if (gstData) {
      const gstP = document.querySelector("article p.font-mono");
      if (gstP && gstData.gstin) {
        gstP.textContent = `${gstData.gstin} • ${gstData.legal_name || "Verified Legal Entity"}`;
      }
    }

    // Update Udyam card
    const udyamData = data.extracted_data?.udyam;
    if (udyamData) {
      const udyamSub = document.querySelector("article:nth-of-type(2) h3 + p");
      const udyamBadge = document.querySelector("article:nth-of-type(2) span.text-amber-700");
      if (udyamSub && udyamData.udyam_number) {
        udyamSub.textContent = `${udyamData.udyam_number} • Enterprise Verified`;
        udyamSub.className = "text-[11px] text-emerald-700 font-medium";
      }
      if (udyamBadge) {
        udyamBadge.textContent = "Verified";
        udyamBadge.className = "text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded";
      }
    }
  };

  return { applicants, selectedApplicant, verifying };
}

