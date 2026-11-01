/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - FRONTEND APPLICATION (REACT)
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This is the single-page React frontend application for Airtel Business.
 * It provides a split-screen experience designed for customers, developers,
 * and hackathon judges:
 * 
 * 👈 LEFT PANEL - CONVERSATION INTERFACE:
 * - Natural multilingual chat (English, Hindi, Hinglish, Indic).
 * - Real-time Voice Recording via browser MediaRecorder API (sends WebM audio
 *   directly to Sarvam AI STT saaras:v3).
 * - Interactive recommendation bundle cards (Primary, Value, Fast-Track) when
 *   discovery profile reaches completion.
 * - Interactive "What-If" controls:
 *   1. Max Installation Days Slider (adjusts filtering from 3 to 30 days).
 *   2. GSTIN Toggle (shows instant difference in unlockable business bundles).
 * 
 * 👉 RIGHT PANEL - LIVE 11-STAGE AI PIPELINE VISUALIZER:
 * - Stage 1: Customer Speech (Audio recording status, format).
 * - Stage 2: Speech-to-Text (Raw audio transcript vs cleaned identifier text).
 * - Stage 3: Language Detection (English, Hindi, Hinglish, etc.).
 * - Stage 4: Schema Extraction (JSON facts parsed by Sarvam LLM).
 * - Stage 5: Schema Diff (Highlights newly extracted fields in green).
 * - Stage 6: Missing Fields (Fields still needed for discovery).
 * - Stage 7: Profile Completion (0% to 100% progress gauge).
 * - Stage 8: Question Planner (Next deterministic question and reasoning).
 * - Stage 9: Session Memory (Rolling conversational turn history).
 * - Stage 10: Full Customer Schema (Live state of business facts).
 * - Stage 11: Phase 1 Ready Status & Trigger for Phase 2 Recommendations.
 * ============================================================================
 */

const { useState, useEffect, useRef } = React;

function App() {
  const [sessionId] = useState(() => "session_" + Math.random().toString(36).substring(2, 9));
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Namaste! Welcome to Airtel Business Customer Discovery. How can I assist your business today?",
      time: "Just now"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [sliderDays, setSliderDays] = useState(7);
  const [whatIfGstin, setWhatIfGstin] = useState(null);
  const [showFilterMatrix, setShowFilterMatrix] = useState(false);

  // Dual-View View Switcher ('customer' | 'sales')
  const [activeView, setActiveView] = useState("customer");

  // Phase 3: Smart KYC Verification & Military Encryption State
  const [showKycModal, setShowKycModal] = useState(false);
  const [kycDocType, setKycDocType] = useState("gstin");
  const [kycLoading, setKycLoading] = useState(false);
  const [kycResult, setKycResult] = useState(null);
  const [specimens, setSpecimens] = useState([]);
  const [verifiedKycList, setVerifiedKycList] = useState([]);

  // Phase 4: Order Lifecycle, Dynamic Category Contracts & Quote Rejection
  const [activeOrder, setActiveOrder] = useState(null);
  const [acceptedBundle, setAcceptedBundle] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectBundle, setRejectBundle] = useState(null);
  const [rejectReason, setRejectReason] = useState("Budget constraints / Pricing too high");
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [rejectTargetBudget, setRejectTargetBudget] = useState("");
  const [showContractModal, setShowContractModal] = useState(false);

  // Phase 5: Sales Person Escalation & Status Dashboard State
  const [salesData, setSalesData] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFilter, setSalesFilter] = useState("all");
  const [salesModalOrder, setSalesModalOrder] = useState(null);
  const [salesNewStatus, setSalesNewStatus] = useState("INSTALLATION_IN_PROGRESS");
  const [salesStageIndex, setSalesStageIndex] = useState(2);
  const [salesEscalationNote, setSalesEscalationNote] = useState("");
  const [salesAgentName, setSalesAgentName] = useState("Rohan Sharma (Airtel Enterprise Sales)");

  // Phase 2 Interactive Hard-Filtering Sandbox State
  const [showSandbox, setShowSandbox] = useState(false);
  const [sandboxParams, setSandboxParams] = useState({
    business_type: "Software Office",
    city: "Mumbai",
    city_tier: 1,
    has_gstin: "Y",
    employee_count: 25,
    num_sites: 1,
    max_installation_days: 14,
    monthly_spend: 5000
  });
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [activePreset, setActivePreset] = useState(0);

  const sandboxPresets = [
    {
      title: "🏢 Metro Tech Startup (Tier 1)",
      desc: "Mumbai · 45 Staff · GSTIN · 14 Days",
      params: { business_type: "Software Office", city: "Mumbai", city_tier: 1, has_gstin: "Y", employee_count: 45, num_sites: 1, max_installation_days: 14, monthly_spend: 8000 }
    },
    {
      title: "🏪 Tier 2 Retailer (No GSTIN)",
      desc: "Jaipur · 4 Staff · No GSTIN · 7 Days",
      params: { business_type: "Retail Store", city: "Jaipur", city_tier: 2, has_gstin: "N", employee_count: 4, num_sites: 1, max_installation_days: 7, monthly_spend: 2000 }
    },
    {
      title: "⚡ Urgent Fast-Track (3-Day Limit)",
      desc: "Delhi · 12 Staff · GSTIN · Urgent 3 Days",
      params: { business_type: "Consultant", city: "Delhi", city_tier: 1, has_gstin: "Y", employee_count: 12, num_sites: 1, max_installation_days: 3, monthly_spend: 3500 }
    },
    {
      title: "🏬 Multi-Branch Chain (4 Sites)",
      desc: "Kochi · 60 Staff · 4 Sites · GSTIN · 21 Days",
      params: { business_type: "Restaurant Chain", city: "Kochi", city_tier: 2, has_gstin: "Y", employee_count: 60, num_sites: 4, max_installation_days: 21, monthly_spend: 15000 }
    }
  ];

  const runSandboxSimulation = async (params) => {
    setSandboxLoading(true);
    try {
      const res = await fetch("/api/recommend/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: {
            business_type: params.business_type,
            city: params.city,
            city_tier: params.city_tier,
            has_gstin: params.has_gstin,
            employee_count: params.employee_count,
            num_sites: params.num_sites,
            max_installation_days: params.max_installation_days,
            monthly_telecom_spend_inr: params.monthly_spend,
            needs: ["High speed internet", "Wi-Fi"]
          },
          max_installation_days: params.max_installation_days,
          has_gstin: params.has_gstin
        })
      });
      const data = await res.json();
      if (data.recommendations) {
        setSandboxResult(data.recommendations);
      }
    } catch (err) {
      console.error("Sandbox simulation error:", err);
    } finally {
      setSandboxLoading(false);
    }
  };

  // Pipeline Trace State across all 11 stages
  const [trace, setTrace] = useState({
    stage1_speech: { status: "Idle", format: "text/plain", is_audio: false },
    stage2_stt: { raw_transcript: "—", cleaned_transcript: "—", confidence: "Exact" },
    stage3_language: { detected_language: "English", source: "Default Initializer" },


    stage4_extracted_json: {},
    stage5_schema_diff: [],
    stage6_missing_fields: ["business_type", "employee_count", "num_sites", "city", "needs", "monthly_telecom_spend_inr", "has_gstin", "has_udyam", "max_installation_days"],
    stage7_completion_pct: 0,
    stage8_planner: {
      target_field: "business_type",
      reason: "Business type is essential to identify commercial segment and baseline connectivity profile.",
      canonical_question: "What type of business do you run?"
    },
    stage9_memory: [],
    stage10_schema: {},
    stage11_ready: false,
    developer_view: null
  });

  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, processingStep]);

  // Stepper animation during loading
  const runStepperAnimation = (isAudio) => {
    const steps = isAudio
      ? [
          "Listening to customer speech...",
          "Converting speech to natural text (Sarvam saaras:v3)...",
          "Understanding your business intent...",
          "Updating customer profile & schema...",
          "Planning next deterministic question..."
        ]
      : [
          "Analyzing customer message...",
          "Understanding your business intent (Sarvam sarvam-105b)...",
          "Updating customer profile & schema...",
          "Planning next deterministic question..."
        ];

    let stepIndex = 0;
    setProcessingStep(steps[0]);
    const interval = setInterval(() => {
      stepIndex++;
      if (stepIndex < steps.length) {
        setProcessingStep(steps[stepIndex]);
      } else {
        clearInterval(interval);
      }
    }, 450);

    return () => clearInterval(interval);
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;

    const userMsg = {
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    const stopStepper = runStepperAnimation(false);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });

      if (!res.ok) throw new Error("Server error: " + res.status);
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.assistant,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);

      if (data.pipeline_trace) {
        setTrace(data.pipeline_trace);
      }
      if (data.recommendations) {
        setRecommendations(data.recommendations);
        if (data.recommendations.customer_summary?.max_installation_days) {
          setSliderDays(data.recommendations.customer_summary.max_installation_days);
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error communicating with the Airtel Business discovery service. Please try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      stopStepper();
      setProcessingStep("");
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await handleSendVoice(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone error:", err);
      alert("Microphone permission denied or not supported in this browser.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendVoice = async (audioBlob) => {
    setIsLoading(true);
    const stopStepper = runStepperAnimation(true);

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("session_id", sessionId);

    try {
      const res = await fetch("/voice", {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error("Voice API error");
      const data = await res.json();

      const userText = data.pipeline_trace?.stage2_stt?.cleaned_transcript || "🎙️ Voice Recording";
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: "🎙️ " + userText,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        },
        {
          role: "assistant",
          content: data.assistant,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);

      if (data.pipeline_trace) {
        setTrace(data.pipeline_trace);
      }
      if (data.recommendations) {
        setRecommendations(data.recommendations);
        if (data.recommendations.customer_summary?.max_installation_days) {
          setSliderDays(data.recommendations.customer_summary.max_installation_days);
        }
      }
    } catch (err) {
      console.error("Voice processing error:", err);
    } finally {
      stopStepper();
      setProcessingStep("");
      setIsLoading(false);
    }
  };

  const handleTimelineChange = async (days) => {
    const num = parseInt(days, 10);
    setSliderDays(num);
    try {
      const res = await fetch("/api/recommend/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          max_installation_days: num,
          has_gstin: whatIfGstin !== null ? whatIfGstin : trace.stage10_schema?.has_gstin,
          schema: trace.stage10_schema
        })
      });
      const data = await res.json();
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      }
    } catch (e) {
      console.warn("What-if update error:", e);
    }
  };

  const handleToggleGstin = async (hasGstinVal) => {
    setWhatIfGstin(hasGstinVal);
    try {
      const res = await fetch("/api/recommend/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          max_installation_days: sliderDays,
          has_gstin: hasGstinVal,
          schema: trace.stage10_schema
        })
      });
      const data = await res.json();
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      }
    } catch (e) {
      console.warn("What-if GSTIN update error:", e);
    }
  };

  const handleReset = async () => {
    if (confirm("Reset current customer discovery session?")) {
      await fetch(`/reset/${sessionId}`, { method: "POST" });
      location.reload();
    }
  };

  // Phase 3 & 4 Handlers: KYC, Quote Acceptance, Contract & Rejection
  const loadSpecimens = async () => {
    try {
      const res = await fetch("/api/kyc/specimens");
      const data = await res.json();
      if (data.allFiles) setSpecimens(data.allFiles);
    } catch (_) {}
  };

  const loadVerifiedKyc = async () => {
    try {
      const res = await fetch(`/api/kyc/session/${sessionId}`);
      const data = await res.json();
      if (data.records) setVerifiedKycList(data.records);
    } catch (_) {}
  };

  const loadSalesDashboard = async () => {
    setSalesLoading(true);
    try {
      const res = await fetch("/api/sales/dashboard");
      const data = await res.json();
      setSalesData(data);
    } catch (e) {
      console.warn("Error fetching sales dashboard:", e);
    } finally {
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    loadSpecimens();
    loadVerifiedKyc();
  }, [sessionId]);

  useEffect(() => {
    if (activeView === "sales") {
      loadSalesDashboard();
    }
  }, [activeView]);

  const handleAcceptQuote = async (bundle) => {
    setAcceptedBundle(bundle);
    try {
      const res = await fetch("/api/orders/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          bundleCode: bundle.bundle_code,
          bundleName: bundle.bundle_name,
          monthlyCost: bundle.monthly_cost_inr,
          contractMonths: 24,
          customerSchema: trace.stage10_schema || {}
        })
      });
      const data = await res.json();
      if (data.order) {
        setActiveOrder(data.order);
        if (data.nextAction === "UPLOAD_KYC_DOCUMENTS") {
          setShowKycModal(true);
        }
      }
    } catch (err) {
      alert("Error accepting quote: " + err.message);
    }
  };

  const handleRejectQuote = async () => {
    if (!rejectBundle) return;
    try {
      await fetch("/api/orders/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          bundleCode: rejectBundle.bundle_code,
          rejectionReason: rejectReason,
          customerFeedback: rejectFeedback,
          budgetOffered: rejectTargetBudget ? parseInt(rejectTargetBudget, 10) : null
        })
      });
      setShowRejectModal(false);
      setRejectFeedback("");
      setRejectTargetBudget("");
      alert("Thank you. Your feedback has been saved and our sales team will follow up with tailored pricing.");
      if (activeView === "sales") loadSalesDashboard();
    } catch (err) {
      alert("Error logging rejection: " + err.message);
    }
  };

  const handleVerifySpecimen = async (filename, docType) => {
    setKycLoading(true);
    setKycResult(null);
    try {
      const res = await fetch("/api/kyc/verify-specimen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          docType,
          sessionId,
          expectedName: trace.stage10_schema?.business_name
        })
      });
      const data = await res.json();
      setKycResult(data);
      await loadVerifiedKyc();

      // If active order was pending KYC and document is verified, refresh order
      if (activeOrder && data.verificationStatus === "VERIFIED") {
        const acceptRes = await fetch("/api/orders/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            bundleCode: activeOrder.bundleCode,
            bundleName: activeOrder.bundleName,
            monthlyCost: activeOrder.monthlyCostInr,
            customerSchema: trace.stage10_schema || {}
          })
        });
        const acceptData = await acceptRes.json();
        if (acceptData.order) setActiveOrder(acceptData.order);
      }
    } catch (err) {
      alert("Verification error: " + err.message);
    } finally {
      setKycLoading(false);
    }
  };

  const handleUploadKyc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setKycLoading(true);
    setKycResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", kycDocType);
    formData.append("session_id", sessionId);
    formData.append("expected_name", trace.stage10_schema?.business_name || "");

    try {
      const res = await fetch("/api/kyc/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      setKycResult(data);
      await loadVerifiedKyc();

      if (activeOrder && data.verificationStatus === "VERIFIED") {
        const acceptRes = await fetch("/api/orders/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            bundleCode: activeOrder.bundleCode,
            bundleName: activeOrder.bundleName,
            monthlyCost: activeOrder.monthlyCostInr,
            customerSchema: trace.stage10_schema || {}
          })
        });
        const acceptData = await acceptRes.json();
        if (acceptData.order) setActiveOrder(acceptData.order);
      }
    } catch (err) {
      alert("Upload error: " + err.message);
    } finally {
      setKycLoading(false);
    }
  };

  const handleSalesStatusUpdate = async () => {
    if (!salesModalOrder) return;
    try {
      const res = await fetch(`/api/sales/orders/${salesModalOrder.orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: salesNewStatus,
          stageIndex: parseInt(salesStageIndex, 10),
          escalationNote: salesEscalationNote,
          salesAgent: salesAgentName
        })
      });
      const data = await res.json();
      if (data.order) {
        setSalesModalOrder(null);
        setSalesEscalationNote("");
        await loadSalesDashboard();
        if (activeOrder?.orderId === data.order.orderId) {
          setActiveOrder(data.order);
        }
      }
    } catch (err) {
      alert("Error updating order: " + err.message);
    }
  };

  const starterScenarios = [
    { label: "🍽️ Restaurant (Hyderabad)", text: "I own a restaurant in Hyderabad with three branches and around twenty employees." },
    { label: "🛍️ Kirana (Telugu)", text: "నా పేరు రమేష్, విజయవాడలో ఒక కిరాణా దుకాణం ఉంది. 4 మంది పనిచేస్తున్నారు." },
    { label: "🏥 Clinic (Hindi)", text: "नमस्ते! मेरी पुणे में 2 क्लिनिक हैं और 12 कर्मचारी हैं। इंटरनेट और बैकअप चाहिए।" },
    { label: "🏭 Manufacturer (Tamil)", text: "வணக்கம்! கோயம்புத்தூரில் ஒரு டெக்ஸ்டைல் யூனிட் நடத்துகிறேன். 35 ஊழியர்கள் உள்ளனர்." },
    { label: "🏪 Mixed Hinglish", text: "Main Delhi mein retail clothing shop run karta hoon. 5 staff hain, budget ₹2000 per month." }
  ];

  return (
    <div className="app-wrapper">
      {/* Top Header */}
      <header className="top-header">
        <div className="brand-section">
          <span className="airtel-badge">AIRTEL BUSINESS</span>
          <div className="title-group">
            <h1>Customer Discovery &amp; Sales Orchestration</h1>
            <p>Live AI Pipeline · Smart KYC · Installation Tracking · Sales Escalations</p>
          </div>
        </div>

        {/* Dual-View Mode Switcher */}
        <div className="view-mode-tabs">
          <button
            className={`view-tab-btn ${activeView === 'customer' ? 'active' : ''}`}
            onClick={() => setActiveView('customer')}
          >
            👤 Customer View &amp; Tracking
          </button>
          <button
            className={`view-tab-btn ${activeView === 'sales' ? 'sales-active' : ''}`}
            onClick={() => {
              setActiveView('sales');
              loadSalesDashboard();
            }}
          >
            💼 Sales Person Dashboard
          </button>
        </div>
        <div className="header-controls">
          <div className="lang-indicator">
            <span className="pulse-dot"></span>
            <span>{trace.stage3_language?.detected_language || "English"} Active</span>
          </div>
          <button
            className="btn-dev-toggle"
            style={{ background: "rgba(168, 85, 247, 0.2)", borderColor: "var(--accent-purple)", color: "#D8B4FE", fontWeight: 700 }}
            onClick={() => {
              setShowSandbox(true);
              if (!sandboxResult) runSandboxSimulation(sandboxParams);
            }}
            title="Open Phase 2 Hard-Filtering Interactive Testing Sandbox"
          >
            🧪 Test Phase 2 Hard-Filtering
          </button>
          <button
            className={`btn-dev-toggle ${devMode ? "active" : ""}`}
            onClick={() => setDevMode(!devMode)}
            title="Toggle Developer Debug Mode"
          >
            {devMode ? "⚡ Developer View [ON]" : "🛠️ Developer View"}
          </button>
          <a
            href="/database"
            className="btn-dev-toggle"
            style={{ textDecoration: "none", background: "rgba(56, 189, 248, 0.15)", borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", fontWeight: 700 }}
            title="Open PostgreSQL Database Explorer in Browser"
          >
            🗄️ Database Explorer
          </a>
          <button className="btn-reset" onClick={handleReset} title="Start fresh session">
            🔄 New Customer
          </button>
        </div>


      </header>

      {/* Main Dual-Panel Workspace or Sales Person Dashboard */}
      {activeView === "sales" ? (
        <div className="sales-dashboard-wrapper">
          {/* Sales Ops Top Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>💼 Sales Operations &amp; Escalation Command Center</h2>
              <p style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                Monitor pipeline leads, resolve KYC bottlenecks, and orchestrate technician field dispatches.
              </p>
            </div>
            <button
              className="btn-specimen"
              style={{ padding: "6px 14px", fontWeight: 700 }}
              onClick={loadSalesDashboard}
            >
              🔄 Refresh Dashboard Data
            </button>
          </div>

          {/* Metrics Grid */}
          <div className="sales-stats-grid">
            <div className="sales-stat-card">
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Enterprise Orders</span>
              <div className="stat-num" style={{ color: "white" }}>{salesData?.stats?.totalOrders || 0}</div>
            </div>
            <div className="sales-stat-card" style={{ borderColor: "rgba(225, 29, 72, 0.4)" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--airtel-red)", textTransform: "uppercase" }}>Active Escalations</span>
              <div className="stat-num" style={{ color: "var(--airtel-red)" }}>{salesData?.stats?.escalatedCount || 0}</div>
            </div>
            <div className="sales-stat-card" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--accent-emerald)", textTransform: "uppercase" }}>KYC Verified</span>
              <div className="stat-num" style={{ color: "var(--accent-emerald)" }}>{salesData?.stats?.totalKycVerifiedCount || 0}</div>
            </div>
            <div className="sales-stat-card" style={{ borderColor: "rgba(6, 182, 212, 0.4)" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", textTransform: "uppercase" }}>In-Progress Field Installs</span>
              <div className="stat-num" style={{ color: "var(--accent-cyan)" }}>{salesData?.stats?.activeInstallationsCount || 0}</div>
            </div>
            <div className="sales-stat-card">
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Lost Quote Drop Reasons</span>
              <div className="stat-num" style={{ color: "var(--accent-amber)" }}>{salesData?.stats?.totalRejectionsCount || 0}</div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["all", "escalated", "pending", "active"].map(f => (
              <button
                key={f}
                className={`btn-specimen ${salesFilter === f ? "active" : ""}`}
                style={{ textTransform: "capitalize" }}
                onClick={() => setSalesFilter(f)}
              >
                {f === "all" ? "All Orders" : f === "escalated" ? "🚨 Escalations Queue" : f === "pending" ? "⏳ KYC Pending" : "✓ Active"}
              </button>
            ))}
          </div>

          {/* Escalations & Orders Management Queue Table */}
          <div className="sales-table-card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8 }}>
              📋 Customer Orders &amp; Installation Pipeline
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Segment</th>
                    <th>Bundle</th>
                    <th>Monthly Fee</th>
                    <th>Status</th>
                    <th>Installation Stage</th>
                    <th>Target SLA</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesData?.allOrders || [])
                    .filter(o => {
                      if (salesFilter === "escalated") return o.escalated || o.status === "ESCALATED";
                      if (salesFilter === "pending") return o.status === "KYC_PENDING";
                      if (salesFilter === "active") return o.status !== "ACTIVATED";
                      return true;
                    })
                    .map((ord, idx) => (
                      <tr key={idx}>
                        <td><strong>{ord.orderId}</strong></td>
                        <td>
                          <div>{ord.customerName}</div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{ord.city} ({ord.cityTier})</div>
                        </td>
                        <td>{ord.businessType}</td>
                        <td>{ord.bundleName}</td>
                        <td>₹{ord.monthlyCostInr}/mo</td>
                        <td>
                          <span className={`badge-status ${ord.status === 'ACTIVATED' ? 'status-active' : ord.escalated ? 'status-escalated' : 'status-pending'}`}>
                            {ord.status}
                          </span>
                        </td>
                        <td>{ord.installationStage} (Stage {ord.stageIndex}/4)</td>
                        <td>{ord.maxInstallDays} Days</td>
                        <td>
                          <button
                            className="btn-specimen"
                            style={{ background: "rgba(6, 182, 212, 0.2)", borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}
                            onClick={() => {
                              setSalesModalOrder(ord);
                              setSalesNewStatus(ord.status);
                              setSalesStageIndex(ord.stageIndex || 1);
                            }}
                          >
                            ⚙️ Manage Status
                          </button>
                        </td>
                      </tr>
                    ))}
                  {(!salesData?.allOrders || salesData.allOrders.length === 0) && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                        No orders in this queue. Accept a bundle quote from Customer View to generate live orders.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Smart KYC Review Center */}
          <div className="sales-table-card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8 }}>
              🪪 Smart KYC Audit &amp; Verification Center
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Verification ID</th>
                    <th>Doc Type</th>
                    <th>Masked Number</th>
                    <th>Confidence</th>
                    <th>Verification Status</th>
                    <th>Registry Match</th>
                    <th>Security &amp; Encryption</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesData?.recentKyc || []).map((k, idx) => (
                    <tr key={idx}>
                      <td><strong>{k.id}</strong></td>
                      <td style={{ textTransform: "uppercase" }}>{k.docType}</td>
                      <td><code>{k.docNumberMasked}</code></td>
                      <td>{k.confidenceScore}%</td>
                      <td>
                        <span className={`badge-status ${k.verificationStatus === 'VERIFIED' ? 'status-active' : k.verificationStatus === 'REJECTED' ? 'status-escalated' : 'status-pending'}`}>
                          {k.verificationStatus}
                        </span>
                      </td>
                      <td>
                        {k.registryMatch ? (
                          <span style={{ color: "var(--accent-emerald)" }}>✓ Registry Confirmed ({k.registryMatch.tradeName || k.registryMatch.enterpriseName || k.registryMatch.legalName || 'Active'})</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>{k.failureReason || 'Pending review'}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: "#C7D2FE", fontSize: "0.7rem" }}>🔐 AES-256-GCM Verified</span>
                      </td>
                    </tr>
                  ))}
                  {(!salesData?.recentKyc || salesData.recentKyc.length === 0) && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                        No KYC documents submitted yet. Use the Smart KYC upload modal in Customer View.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quote Rejections & Loss Analysis */}
          <div className="sales-table-card">
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8 }}>
              📉 Quote Drop-Reason &amp; Customer Feedback Log
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Rejection ID</th>
                    <th>Bundle Code</th>
                    <th>Reason Category</th>
                    <th>Customer Feedback Notes</th>
                    <th>Budget Offered</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesData?.recentRejections || []).map((rej, idx) => (
                    <tr key={idx}>
                      <td><strong>{rej.id}</strong></td>
                      <td><code>{rej.bundleCode}</code></td>
                      <td style={{ color: "var(--airtel-red)", fontWeight: 700 }}>{rej.rejectionReason}</td>
                      <td>{rej.customerFeedback || "No additional comments"}</td>
                      <td>{rej.budgetOffered ? `₹${rej.budgetOffered}/mo` : "Not specified"}</td>
                      <td style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(rej.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {(!salesData?.recentRejections || salesData.recentRejections.length === 0) && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                        No rejected quotes logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Customer View: Dual-Panel Workspace */
        <main className="main-content">
        {/* Left Side: Conversation */}
        <section className="chat-panel">
          <div className="chat-panel-header">
            <span className="panel-title">💬 Live Customer Conversation</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Session: {sessionId}</span>
          </div>

          <div className="chat-stream">
            {messages.map((msg, idx) => (
              <div key={idx} className={`msg-row ${msg.role}`}>
                <div className="msg-avatar">{msg.role === "assistant" ? "🔴" : "👤"}</div>
                <div className="msg-content">
                  <div className="msg-bubble">{msg.content}</div>
                  <div className="msg-time">{msg.time}</div>
                </div>
              </div>
            ))}

            {/* Real-time processing animation */}
            {isLoading && (
              <div className="processing-stepper">
                <div className="spinner"></div>
                <span className="processing-text">{processingStep || "AI is processing your response..."}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Scenario Starters */}
          <div className="starters-bar">
            <span className="starters-label">Test Scenarios:</span>
            {starterScenarios.map((sc, i) => (
              <button key={i} className="starter-chip" onClick={() => handleSendMessage(sc.text)}>
                {sc.label}
              </button>
            ))}
          </div>

          {/* Input Dock */}
          <div className="input-dock">
            <button
              className={`btn-mic ${isRecording ? "recording" : ""}`}
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              title={isRecording ? "Click to stop recording" : "Record voice via Sarvam STT"}
            >
              🎙️
            </button>
            <div className="text-input-wrap">
              <input
                type="text"
                className="chat-input"
                placeholder="Type or speak in any Indian language (Telugu, Hindi, Tamil, English)..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
            </div>
            <button className="btn-send" onClick={() => handleSendMessage()} disabled={isLoading || !inputText.trim()}>
              Send ➤
            </button>
          </div>
        </section>

        {/* Right Side: Live AI Processing Pipeline Dashboard */}
        <aside className="pipeline-panel">
          <div className="pipeline-header">
            <div className="pipeline-title">
              <span>⚡ Live AI Processing Pipeline</span>
              <span className="live-badge">REAL-TIME TRACE</span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 700 }}>
              Stages 1 → 11
            </span>
          </div>

          {/* Active Order Installation & Milestone Tracker */}
          {activeOrder && (
            <div className="order-tracker-card">
              <div className="tracker-header">
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--accent-cyan)", textTransform: "uppercase" }}>
                    🚚 Order Tracking · Live Installation
                  </div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "white" }}>
                    {activeOrder.orderId}
                  </div>
                </div>
                <span className={`badge-status ${activeOrder.status === 'ACTIVATED' ? 'status-active' : activeOrder.status === 'ESCALATED' ? 'status-escalated' : 'status-pending'}`}>
                  {activeOrder.status}
                </span>
              </div>

              <div style={{ fontSize: "0.74rem", color: "#CBD5E1", marginBottom: 8 }}>
                <strong>Bundle:</strong> {activeOrder.bundleName} (₹{activeOrder.monthlyCostInr}/mo)
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 6, fontSize: "0.72rem" }}>
                <span>🎯 Target Installation SLA:</span>
                <span style={{ fontWeight: 700, color: "var(--accent-amber)" }}>
                  Within {activeOrder.maxInstallDays} Days ({activeOrder.targetCompletionDate})
                </span>
              </div>

              {/* 5 Milestone Stages */}
              <div className="timeline-stages">
                {[
                  { title: "1. KYC & Statutory Verification", desc: activeOrder.isKycComplete ? "✓ All documents verified & encrypted" : "Action Required: Upload KYC documents", done: activeOrder.isKycComplete, current: !activeOrder.isKycComplete },
                  { title: "2. Site Survey & Fibre Feasibility", desc: "Airtel network engineer feasibility inspection", done: activeOrder.stageIndex >= 1, current: activeOrder.stageIndex === 1 },
                  { title: "3. CPE Hardware Dispatch", desc: activeOrder.contract?.cpeType || "Router dispatched to customer location", done: activeOrder.stageIndex >= 2, current: activeOrder.stageIndex === 2 },
                  { title: "4. Physical Cabling & Testing", desc: "Fibre pulling, optical power test, Wi-Fi optimization", done: activeOrder.stageIndex >= 3, current: activeOrder.stageIndex === 3 },
                  { title: "5. Airtel Live Activation", desc: "MAC address provisioned & SLA monitoring active", done: activeOrder.status === 'ACTIVATED' || activeOrder.stageIndex >= 4, current: activeOrder.stageIndex === 4 }
                ].map((st, sIdx) => (
                  <div key={sIdx} className="stage-step-item">
                    <div className={`step-circle ${st.done ? "completed" : st.current ? "current" : "pending"}`}>
                      {st.done ? "✓" : sIdx + 1}
                    </div>
                    <div className="step-details">
                      <div className="step-title" style={{ color: st.done ? "var(--accent-emerald)" : st.current ? "white" : "var(--text-muted)" }}>
                        {st.title}
                      </div>
                      <div className="step-subtext">{st.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {!activeOrder.isKycComplete && (
                  <button
                    className="btn-accept-quote"
                    style={{ background: "linear-gradient(135deg, #E11D48, #BE123C)" }}
                    onClick={() => setShowKycModal(true)}
                  >
                    🪪 Upload KYC Documents Now
                  </button>
                )}
                {activeOrder.contract && (
                  <button
                    className="btn-specimen"
                    style={{ padding: "6px 12px" }}
                    onClick={() => setShowContractModal(true)}
                  >
                    📜 View SLA Contract ({activeOrder.contract.slaUptime})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stage 11: Ready Status Banner */}
          <div className={`ready-status-banner ${trace.stage11_ready ? "is-ready" : "not-ready"}`}>
            <div>
              <h3>{trace.stage11_ready ? "✓ Ready for Recommendation: YES" : "Ready for Recommendation: NO"}</h3>
              <p>{trace.stage11_ready ? "Phase 1 complete! Customer profile satisfies all discovery criteria." : "Discovery in progress. Gathering required business profile fields."}</p>
            </div>
            <span className="ready-pill">{trace.stage11_ready ? "READY (100%)" : `${trace.stage7_completion_pct}%`}</span>
          </div>

          {/* Stage 7: Schema Completion Progress */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 7 · Completion</span>
              <span className="stage-tag tag-emerald">{trace.stage7_completion_pct}% Complete</span>
            </div>
            <div className="completion-container">
              <div className="comp-header">
                <span>Discovery Completion Progress</span>
                <span>{trace.stage7_completion_pct}%</span>
              </div>
              <div className="comp-track">
                <div className="comp-fill" style={{ width: `${trace.stage7_completion_pct}%` }}></div>
              </div>
            </div>
          </div>

          {/* Stage 1 & 2: Speech & Speech-to-Text */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 1 &amp; 2 · Customer Input &amp; STT</span>
              <span className={`stage-tag ${trace.stage1_speech?.is_audio ? "tag-cyan" : "tag-purple"}`}>
                {trace.stage1_speech?.is_audio ? "Audio (Sarvam saaras:v3)" : "Text Input"}
              </span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 6, fontSize: "0.74rem", color: "var(--text-muted)" }}>
                Exact Transcript returned by Sarvam:
              </div>
              <div className="transcript-box">{trace.stage2_stt?.cleaned_transcript || "Awaiting customer message..."}</div>
              {trace.stage1_speech?.is_audio && (
                <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--accent-cyan)" }}>
                  ✓ Natural Cleaning Applied (slashes/hyphens converted to words, identifiers preserved)
                </div>
              )}
            </div>
          </div>

          {/* Stage 3: Language Detection */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 3 · Language Detection</span>
              <span className="stage-tag tag-cyan">Sarvam Indic Engine</span>
            </div>
            <div className="stage-content">
              <div className="lang-badge-display">
                <span>🌐 Detected Language:</span>
                <span style={{ color: "white" }}>{trace.stage3_language?.detected_language || "English"}</span>
              </div>
            </div>
          </div>

          {/* Stage 4: Schema Extraction */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 4 · Schema Extraction Agent</span>
              <span className="stage-tag tag-cyan">Structured JSON</span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Extracted from latest turn (Sarvam sarvam-105b):
              </div>
              <pre className="code-block">
                {Object.keys(trace.stage4_extracted_json || {}).length === 0
                  ? "(No new structured fields extracted in this turn)"
                  : JSON.stringify(trace.stage4_extracted_json, null, 2)}
              </pre>
            </div>
          </div>

          {/* Stage 5: Schema Comparison (Diff) */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 5 · Schema Comparison (Diff)</span>
              <span className="stage-tag tag-emerald">
                {trace.stage5_schema_diff?.length || 0} Fields Updated
              </span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 6, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Previous Schema ➔ Current Schema (Highlighting updated fields):
              </div>
              {trace.stage5_schema_diff && trace.stage5_schema_diff.length > 0 ? (
                <div className="diff-list">
                  {trace.stage5_schema_diff.map((item, idx) => (
                    <div key={idx} className="diff-row">
                      <span className="diff-field-name">{item.field.replace(/_/g, " ")}:</span>
                      <div className="diff-change">
                        <span className="diff-old">{String(item.old_value)}</span>
                        <span className="diff-arrow">➔</span>
                        <span className="diff-new">{String(item.new_value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  (No schema mutations in this turn)
                </div>
              )}
            </div>
          </div>

          {/* AI Tool Invocations (City-to-Tier & Segment Resolution) */}
          {trace.tool_calls && trace.tool_calls.length > 0 && (
            <div className="stage-card" style={{ borderColor: 'var(--accent-purple)' }}>
              <div className="stage-card-header">
                <span className="stage-number">⚙️ Autonomous AI Tool Invocations</span>
                <span className="stage-tag tag-purple">Tool Execution</span>
              </div>
              <div className="stage-content">
                <div style={{ marginBottom: 6, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Tools invoked to enrich customer schema:
                </div>
                {trace.tool_calls.map((tc, idx) => (
                  <div key={idx} style={{ marginBottom: 8, padding: '8px 10px', background: 'rgba(168, 85, 247, 0.08)', borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--accent-purple)' }}>
                        🔧 {tc.tool}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                        ✓ {tc.status || 'Executed'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: '#E2E8F0' }}>Input:</strong> {JSON.stringify(tc.input)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      <strong style={{ color: '#E2E8F0' }}>Result:</strong> {JSON.stringify(tc.output)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage 6: Missing Information Detector */}
          <div className="stage-card">

            <div className="stage-card-header">
              <span className="stage-number">Stage 6 · Missing Information Detector</span>
              <span className="stage-tag tag-amber">Deterministic (No AI)</span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 6, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Remaining Required Fields:
              </div>
              <div className="missing-tags-grid">
                {trace.stage6_missing_fields && trace.stage6_missing_fields.length > 0 ? (
                  trace.stage6_missing_fields.map((field, idx) => (
                    <span key={idx} className="missing-pill">
                      {field}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--accent-emerald)", fontWeight: 700, fontSize: "0.78rem" }}>
                    ✓ All required discovery fields are completed!
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stage 8: Question Planner */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 8 · Question Planner</span>
              <span className="stage-tag tag-cyan">Deterministic Map</span>
            </div>
            <div className="stage-content">
              <div className="planner-box">
                <div>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent-cyan)", textTransform: "uppercase" }}>
                    Next Question Reason:
                  </span>
                  <div className="planner-reason">{trace.stage8_planner?.reason || "Profile complete."}</div>
                </div>
                {trace.stage8_planner?.canonical_question && (
                  <div>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Assistant asks:
                    </span>
                    <div className="planner-question">{trace.stage8_planner.canonical_question}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stage 9: Conversation Memory */}
          <div className="stage-card">
            <div className="stage-card-header">
              <span className="stage-number">Stage 9 · Conversation Memory</span>
              <span className="stage-tag tag-purple">{trace.stage9_memory?.length || 0} Turns Preserved</span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Context history passed to Sarvam:
              </div>
              <div className="memory-box">
                {trace.stage9_memory && trace.stage9_memory.length > 0 ? (
                  trace.stage9_memory.map((m, idx) => (
                    <div key={idx} className="memory-item">
                      <span className={`memory-role ${m.role}`}>{m.role.toUpperCase()}: </span>
                      <span>{m.content}</span>
                    </div>
                  ))
                ) : (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(Initial Turn)</span>
                )}
              </div>
            </div>
          </div>

          {/* Stage 10: Current Customer Schema */}
          <div className="stage-card highlight">
            <div className="stage-card-header">
              <span className="stage-number">Stage 10 · Current Customer Schema</span>
              <span className="stage-tag tag-emerald">CustomerSchema (Node.js)</span>
            </div>
            <div className="stage-content">
              <div style={{ marginBottom: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Latest complete schema state:
              </div>
              <pre className="code-block">
                {JSON.stringify(trace.stage10_schema || {}, null, 2)}
              </pre>
            </div>
          </div>

          {/* Phase 2: Live AI Recommendation Engine (Airtel Business) */}
          {recommendations && (
            <div className="phase2-container">
              <div className="phase2-header">
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    🚀 Phase 2 · Airtel Business Solutions
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, marginTop: 2 }}>
                    Tailored Recommendations &amp; What-If Analytics
                  </div>
                </div>
                <div className="segment-badge-container">
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Target Segment:</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
                    {recommendations.customer_summary?.target_segment || "Micro Retail & Services"}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8" }}>
                    ({recommendations.customer_summary?.segment_resolution_method || "Exact"} match)
                  </span>
                </div>
              </div>

              {/* What-If Installation Timeline Slider */}
              <div className="whatif-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-amber)" }}>
                    ⏱️ What-If Simulation: Installation Timeline Needed
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "white" }}>
                    {sliderDays} Days
                  </span>
                </div>
                <div className="whatif-slider-container">
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>1 Day</span>
                  <input
                    type="range"
                    min="1"
                    max="28"
                    value={sliderDays}
                    onChange={(e) => handleTimelineChange(e.target.value)}
                    className="whatif-slider"
                  />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>28 Days</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Slide to test what additional high-capacity products (e.g. Dedicated Internet Leased Lines) unlock as you adjust your timeline.
                </div>
              </div>

              {/* GSTIN Unlock & 18% Tax Credit Banner */}
              <div className="gstin-unlock-banner">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#E9D5FF" }}>
                    🏢 GSTIN Enterprise &amp; Tax Credit Status:
                  </span>
                  <button
                    onClick={() => handleToggleGstin(recommendations.customer_summary?.has_gstin ? "N" : "Y")}
                    style={{
                      background: recommendations.customer_summary?.has_gstin ? "rgba(16, 185, 129, 0.2)" : "rgba(225, 29, 72, 0.2)",
                      border: `1px solid ${recommendations.customer_summary?.has_gstin ? "rgba(16, 185, 129, 0.4)" : "rgba(225, 29, 72, 0.4)"}`,
                      color: recommendations.customer_summary?.has_gstin ? "var(--accent-emerald)" : "var(--airtel-red)",
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    {recommendations.customer_summary?.has_gstin ? "✓ GST Registered (18% ITC Eligible)" : "+ Test Having GSTIN"}
                  </button>
                </div>
                {recommendations.what_if_insights?.gstin_unlocked_products?.length > 0 && (
                  <div style={{ fontSize: "0.72rem", color: "#CBD5E1", marginTop: 4 }}>
                    💡 <strong>Unlocks with GSTIN:</strong>{" "}
                    {recommendations.what_if_insights.gstin_unlocked_products.map((p) => p.product_name).join(", ")}{" "}
                    along with 18% GST input tax credit!
                  </div>
                )}
              </div>

              {/* Udyam MSME Unlock Banner */}
              <div className="gstin-unlock-banner" style={{ marginTop: 8, borderColor: "rgba(16, 185, 129, 0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#A7F3D0" }}>
                    📜 MSME Udyam Registration Benefits:
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--accent-emerald)", fontWeight: 700 }}>
                    {recommendations.customer_summary?.has_udyam ? "✓ MSME Verified" : "MSME Scheme Eligible"}
                  </span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#CBD5E1", marginTop: 4 }}>
                  💡 <strong>Udyam Unlock:</strong> Eligible for subsidized priority installation, zero collateral security deposit, and special MSME digital business packages.
                </div>
              </div>

              {/* Top 2 Recommended Solution Bundles */}
              <div style={{ marginTop: 12, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  ⭐ Top Recommended Solution Bundles
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  Primary + Alternative Value Match
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recommendations.recommended_bundles?.slice(0, 2).map((bundle, bIdx) => {
                  const cardType = bIdx === 0 ? "primary" : "value";
                  const rankBadge = bIdx === 0 ? "bundle-rank-1" : "bundle-rank-2";
                  const rankTitle = bIdx === 0 ? "🥇 Rank #1 · Primary Recommended Bundle (Best Match)" : "🥈 Rank #2 · Value Saver / Fast-Track Bundle";
                  return (
                    <div key={bIdx} className={`bundle-card ${cardType}`} style={{ position: "relative" }}>
                      <div className="bundle-top">
                        <div>
                          <div style={{ marginBottom: 4 }}>
                            <span className={`bundle-rank-badge ${rankBadge}`}>
                              {rankTitle}
                            </span>
                          </div>
                          <div className="bundle-title" style={{ fontSize: "0.98rem", marginTop: 4 }}>{bundle.bundle_name}</div>
                          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: 2 }}>
                            {bundle.description}
                          </div>
                        </div>
                      </div>

                      <div className="bundle-pricing-row">
                        <span className="price-main">₹{bundle.monthly_cost_inr}/mo</span>
                        {bundle.monthly_savings_inr > 0 && (
                          <span className="price-savings">Save ₹{bundle.monthly_savings_inr}/mo</span>
                        )}
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Setup Fee: ₹{bundle.one_time_setup_inr}
                        </span>
                      </div>

                      <div className="bundle-meta-pills">
                        <span>⚡ Install: ~{bundle.estimated_install_days} days</span>
                        <span>⭐ NPS Score: {bundle.estimated_nps_score}/10</span>
                        <span>📦 Code: {bundle.bundle_code}</span>
                      </div>

                      {/* Add-on and product components breakdown */}
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                          Included Products &amp; Add-on Scoring:
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {bundle.products?.map((prod, pIdx) => (
                            <span key={pIdx} className="bundle-product-pill">
                              <strong>{prod.product_name}</strong> · ₹{prod.price_inr_per_month}/mo ({prod.install_days}d install)
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Interactive Quote Acceptance & Rejection Actions */}
                      <div className="bundle-actions-row">
                        <button
                          className="btn-accept-quote"
                          onClick={() => handleAcceptQuote(bundle)}
                        >
                          ✓ Accept Quote &amp; Order
                        </button>
                        <button
                          className="btn-reject-quote"
                          onClick={() => {
                            setRejectBundle(bundle);
                            setShowRejectModal(true);
                          }}
                        >
                          ✕ Decline Quote
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hard-Filtering Eligibility Matrix Inspector */}
              {recommendations.eligibility_matrix && (
                <div className="filter-matrix-container">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                      🔍 Phase 2 Hard-Filtering Matrix ({recommendations.eligibility_matrix.filter(p => p.eligible).length} / {recommendations.eligibility_matrix.length} Passed)
                    </span>
                    <button
                      onClick={() => setShowFilterMatrix(!showFilterMatrix)}
                      style={{ background: "transparent", border: "1px solid var(--border-color)", color: "#94A3B8", fontSize: "0.68rem", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}
                    >
                      {showFilterMatrix ? "▲ Hide Matrix" : "▼ Show All 25 Products"}
                    </button>
                  </div>
                  {showFilterMatrix && (
                    <div style={{ maxHeight: 280, overflowY: "auto", marginTop: 8 }}>
                      <table className="filter-matrix-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Status</th>
                            <th>Hard-Filter Breakdown / Rejection Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recommendations.eligibility_matrix.map((p, idx) => (
                            <tr key={idx}>
                              <td>
                                <strong style={{ color: "white" }}>{p.product_name}</strong>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>{p.category} · ₹{p.price_min_inr_per_month}/mo</div>
                              </td>
                              <td>
                                {p.eligible ? (
                                  <span className="badge-eligible">✓ Eligible</span>
                                ) : (
                                  <span className="badge-filtered">✕ Filtered</span>
                                )}
                              </td>
                              <td>
                                {p.eligible ? (
                                  <span style={{ color: "var(--accent-emerald)", fontSize: "0.68rem" }}>Passed all size, GSTIN, tier &amp; timeline checks</span>
                                ) : (
                                  p.filter_reasons.map((r, rIdx) => (
                                    <span key={rIdx} className="filter-reason-pill">{r}</span>
                                  ))
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Collapsible Developer View */}
          {devMode && (
            <div className="dev-view-container">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#D8B4FE", textTransform: "uppercase" }}>
                  🛠️ Developer Diagnostics &amp; Raw Traces
                </span>
                <span className="dev-meta-badge">
                  Latency: {trace.developer_view?.total_latency_ms || 0}ms
                </span>
              </div>
              <div className="dev-meta-row">
                <span className="dev-meta-badge">Model: {trace.developer_view?.model || "sarvam-105b-conversations"}</span>
                <span className="dev-meta-badge">STT: {trace.developer_view?.stt_model || "saaras:v3"}</span>
                <span className="dev-meta-badge">{trace.developer_view?.validation_status || "Valid"}</span>
              </div>

              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Extraction Prompt sent to Sarvam:
                </span>
                <pre className="dev-prompt-box">{trace.developer_view?.extraction_prompt || "—"}</pre>
              </div>

              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Raw Sarvam Response:
                </span>
                <pre className="dev-prompt-box">{trace.developer_view?.extraction_raw || "—"}</pre>
              </div>

              <div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                  Follow-up Formulation Prompt:
                </span>
                <pre className="dev-prompt-box">{trace.developer_view?.formulation_prompt || "—"}</pre>
              </div>
            </div>
          )}
        </aside>
      </main>
      )}

      {/* Phase 3: Smart KYC Verification & Military Grade Encryption Modal */}
      {showKycModal && (
        <div className="sandbox-overlay" onClick={() => setShowKycModal(false)}>
          <div className="sandbox-modal" style={{ maxWidth: 650 }} onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-header">
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent-cyan)", textTransform: "uppercase" }}>
                  🔐 Smart Statutory KYC Verification
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "white", marginTop: 2 }}>
                  Verify Business Identity (Aadhaar · Voter ID · GSTIN · Udyam)
                </div>
              </div>
              <button
                onClick={() => setShowKycModal(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-body">
              <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", marginBottom: 12 }}>
                Upload any of the 4 statutory identity documents. Your raw image will be encrypted via <strong>AES-256-GCM</strong> and verified against official registries before storage.
              </div>

              {/* Document Type Selection */}
              <div className="kyc-doc-grid">
                {[
                  { type: "gstin", label: "🏢 GSTIN Certificate", desc: "15-digit statutory GST registration" },
                  { type: "udyam", label: "📜 Udyam MSME Certificate", desc: "National MSME registration number" },
                  { type: "aadhaar", label: "🪪 Aadhaar Card", desc: "12-digit UIDAI identity (masked)" },
                  { type: "signatory_id", label: "🗳️ Authorised Signatory / Voter ID", desc: "EPIC voter ID or corporate badge" }
                ].map(d => (
                  <div
                    key={d.type}
                    className={`kyc-type-card ${kycDocType === d.type ? "active" : ""}`}
                    onClick={() => setKycDocType(d.type)}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "white" }}>{d.label}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>{d.desc}</div>
                  </div>
                ))}
              </div>

              {/* Upload Dropzone */}
              <label className="kyc-dropzone" style={{ display: "block", marginBottom: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleUploadKyc}
                  disabled={kycLoading}
                />
                <div style={{ fontSize: "1.8rem", marginBottom: 6 }}>📤</div>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "white" }}>
                  {kycLoading ? "Executing Preprocessing & OCR..." : "Click or Drop Document Image Here"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                  Supports smartphone photos (auto-contrast, deskew, multi-angle recovery)
                </div>
              </label>

              {/* 1-Click Test Specimen Buttons */}
              <div style={{ background: "rgba(30, 41, 59, 0.4)", padding: 10, borderRadius: 8, border: "1px solid var(--border-color)", marginBottom: 12 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent-purple)", marginBottom: 6 }}>
                  🧪 1-Click Test KYC Specimens (Hackathon K01-K12 Dataset):
                </div>
                <div className="specimen-pill-row">
                  <button className="btn-specimen" onClick={() => handleVerifySpecimen("K03_gst_certificate.png", "gstin")} disabled={kycLoading}>
                    ✓ K03 Active GSTIN (Ganesh Woodcraft)
                  </button>
                  <button className="btn-specimen" onClick={() => handleVerifySpecimen("K01_gst_certificate.png", "gstin")} disabled={kycLoading}>
                    ✕ K01 Cancelled GSTIN (Rejection Test)
                  </button>
                  <button className="btn-specimen" onClick={() => handleVerifySpecimen("K02_udyam_certificate.png", "udyam")} disabled={kycLoading}>
                    ✓ K02 Active Udyam (Harmony Dental)
                  </button>
                  <button className="btn-specimen" onClick={() => handleVerifySpecimen("K01_signatory_id.png", "signatory_id")} disabled={kycLoading}>
                    ✓ K01 Signatory ID (Neha Kaur)
                  </button>
                  <button className="btn-specimen" onClick={() => handleVerifySpecimen("K04_gst_certificate.png", "gstin")} disabled={kycLoading}>
                    ⚠️ K04 Distorted/Skewed Test
                  </button>
                </div>
              </div>

              {/* Loading Indicator */}
              {kycLoading && (
                <div style={{ textAlign: "center", padding: 16 }}>
                  <div className="spinner" style={{ margin: "0 auto 8px" }}></div>
                  <div style={{ fontSize: "0.76rem", color: "var(--accent-cyan)", fontWeight: 700 }}>
                    Enhancing Contrast → AES-256 Encryption → OCR Extraction → Registry Validation...
                  </div>
                </div>
              )}

              {/* Verification Result Card */}
              {kycResult && !kycLoading && (
                <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "white" }}>
                      Verification Result:
                    </span>
                    <span className={`badge-status ${kycResult.verificationStatus === 'VERIFIED' ? 'status-active' : kycResult.verificationStatus === 'REJECTED' ? 'status-escalated' : 'status-pending'}`}>
                      {kycResult.verificationStatus}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.74rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Masked Identifier:</span>
                      <div style={{ fontWeight: 700, color: "white" }}><code>{kycResult.docNumberMasked}</code></div>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>OCR Confidence:</span>
                      <div style={{ fontWeight: 700, color: "var(--accent-cyan)" }}>{kycResult.confidenceScore}%</div>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Entity Name:</span>
                      <div style={{ fontWeight: 700, color: "white" }}>{kycResult.extractedEntities?.entityName || kycResult.registryMatch?.legalName || "N/A"}</div>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Data Privacy &amp; Storage:</span>
                      <div style={{ color: "var(--accent-emerald)", fontWeight: 700 }}>🔐 AES-256-GCM Encrypted</div>
                    </div>
                  </div>

                  {kycResult.failureReason && (
                    <div style={{ marginTop: 8, padding: 6, background: "rgba(225, 29, 72, 0.15)", borderRadius: 4, color: "#FDA4AF", fontSize: "0.72rem" }}>
                      ⚠️ {kycResult.failureReason}
                    </div>
                  )}

                  {kycResult.verificationStatus === "VERIFIED" && (
                    <div style={{ marginTop: 10, textAlign: "right" }}>
                      <button
                        className="btn-accept-quote"
                        style={{ display: "inline-flex", width: "auto", padding: "6px 14px" }}
                        onClick={() => setShowKycModal(false)}
                      >
                        ✓ Continue to Installation Tracker
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quote Rejection Modal */}
      {showRejectModal && (
        <div className="sandbox-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="sandbox-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-header">
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--airtel-red)", textTransform: "uppercase" }}>
                  Feedback &amp; Quote Decline
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "white", marginTop: 2 }}>
                  Help Airtel Tailor a Better Solution for Your Business
                </div>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-body">
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  Primary Reason for Declining Quote:
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ width: "100%", background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem" }}
                >
                  <option value="Budget constraints / Pricing too high">Budget constraints / Pricing too high</option>
                  <option value="Installation timeline too slow (need < 3 days)">Installation timeline too slow (need &lt; 3 days)</option>
                  <option value="Competitor offered lower pricing">Competitor offered lower pricing</option>
                  <option value="Requires customized bandwidth / static IP">Requires customized bandwidth / static IP</option>
                  <option value="Decision postponed / Management approval pending">Decision postponed / Management approval pending</option>
                  <option value="Other requirements">Other requirements</option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  Target Monthly Telecom Budget (Optional):
                </label>
                <input
                  type="number"
                  placeholder="e.g. ₹1500"
                  value={rejectTargetBudget}
                  onChange={(e) => setRejectTargetBudget(e.target.value)}
                  style={{ width: "100%", background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem" }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  Additional Feedback for Sales Team:
                </label>
                <textarea
                  rows="3"
                  placeholder="Share any specific features, router models, or custom terms your business needs..."
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  style={{ width: "100%", background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem" }}
                ></textarea>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  className="btn-specimen"
                  onClick={() => setShowRejectModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-accept-quote"
                  style={{ width: "auto", background: "linear-gradient(135deg, #E11D48, #BE123C)" }}
                  onClick={handleRejectQuote}
                >
                  Submit Reason &amp; Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLA Contract Terms Viewer Modal */}
      {showContractModal && activeOrder?.contract && (
        <div className="sandbox-overlay" onClick={() => setShowContractModal(false)}>
          <div className="sandbox-modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-header">
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent-emerald)", textTransform: "uppercase" }}>
                  📜 Legal Airtel Service Level Agreement (SLA)
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "white", marginTop: 2 }}>
                  {activeOrder.contract.category} Contract ({activeOrder.contract.contractId})
                </div>
              </div>
              <button
                onClick={() => setShowContractModal(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-body" style={{ fontSize: "0.78rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ background: "rgba(30, 41, 59, 0.4)", padding: 8, borderRadius: 6 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Guaranteed SLA Uptime:</span>
                  <div style={{ fontWeight: 800, color: "var(--accent-emerald)", fontSize: "1rem" }}>{activeOrder.contract.slaUptime}</div>
                </div>
                <div style={{ background: "rgba(30, 41, 59, 0.4)", padding: 8, borderRadius: 6 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Contract Term:</span>
                  <div style={{ fontWeight: 800, color: "white", fontSize: "1rem" }}>{activeOrder.contractMonths} Months</div>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <strong style={{ color: "var(--accent-cyan)" }}>CPE Hardware Provisioned:</strong>
                <div style={{ color: "#E2E8F0", marginTop: 2 }}>{activeOrder.contract.cpeType}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <strong style={{ color: "var(--accent-cyan)" }}>Support &amp; Escalation Tier:</strong>
                <div style={{ color: "#E2E8F0", marginTop: 2 }}>{activeOrder.contract.supportLevel}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <strong style={{ color: "var(--accent-cyan)" }}>Commercial &amp; Termination Terms:</strong>
                <div style={{ color: "#E2E8F0", marginTop: 2 }}>{activeOrder.contract.specialTerms}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <button
                  className="btn-accept-quote"
                  style={{ display: "inline-flex", width: "auto", padding: "6px 16px" }}
                  onClick={() => setShowContractModal(false)}
                >
                  Close Contract Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Agent Status Modifier Modal */}
      {salesModalOrder && (
        <div className="sandbox-overlay" onClick={() => setSalesModalOrder(null)}>
          <div className="sandbox-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-header">
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent-indigo)", textTransform: "uppercase" }}>
                  ⚙️ Sales Operations Control
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "white", marginTop: 2 }}>
                  Modify Status: {salesModalOrder.orderId}
                </div>
              </div>
              <button
                onClick={() => setSalesModalOrder(null)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-body">
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  Order Status:
                </label>
                <select
                  value={salesNewStatus}
                  onChange={(e) => setSalesNewStatus(e.target.value)}
                  style={{ width: "100%", background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem" }}
                >
                  <option value="ORDER_CONFIRMED">ORDER_CONFIRMED (Confirmed by Customer)</option>
                  <option value="KYC_PENDING">KYC_PENDING (Awaiting Document Upload)</option>
                  <option value="KYC_COMPLETE">KYC_COMPLETE (Statutory KYC Verified)</option>
                  <option value="INSTALLATION_IN_PROGRESS">INSTALLATION_IN_PROGRESS (Engineer Dispatched)</option>
                  <option value="TESTING_AND_PROVISIONING">TESTING_AND_PROVISIONING (Fibre Spliced &amp; Testing)</option>
                  <option value="ACTIVATED">ACTIVATED (Service Live Handover)</option>
                  <option value="ESCALATED">ESCALATED (Flagged for Sales Escalation)</option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  <span>Installation Milestone Stage:</span>
                  <span style={{ color: "white" }}>Stage {salesStageIndex} / 4</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  value={salesStageIndex}
                  onChange={(e) => setSalesStageIndex(e.target.value)}
                  className="whatif-slider"
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 700 }}>
                  Agent Escalation / Internal Action Notes:
                </label>
                <textarea
                  rows="3"
                  placeholder="Record customer updates, field technician dispatch notes, or escalation rationale..."
                  value={salesEscalationNote}
                  onChange={(e) => setSalesEscalationNote(e.target.value)}
                  style={{ width: "100%", background: "rgba(15, 23, 42, 0.8)", border: "1px solid var(--border-color)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: "0.78rem" }}
                ></textarea>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  className="btn-specimen"
                  onClick={() => setSalesModalOrder(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-accept-quote"
                  style={{ width: "auto" }}
                  onClick={handleSalesStatusUpdate}
                >
                  Save &amp; Update Order Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Phase 2 Hard-Filtering Testing Sandbox Modal */}
      {showSandbox && (
        <div className="sandbox-overlay" onClick={() => setShowSandbox(false)}>
          <div className="sandbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sandbox-header">
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--accent-cyan)", textTransform: "uppercase" }}>
                  🧪 Interactive Verification Lab
                </div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "white", marginTop: 2 }}>
                  Phase 2 Hard-Filtering &amp; Bundle Formulator Sandbox
                </div>
              </div>
              <button
                onClick={() => setShowSandbox(false)}
                style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "1.3rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-body">
              {/* Preset Scenarios */}
              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  1. One-Click Hard-Filtering Scenarios:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 8 }}>
                  {sandboxPresets.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      className={`scenario-btn ${activePreset === pIdx ? "active" : ""}`}
                      onClick={() => {
                        setActivePreset(pIdx);
                        setSandboxParams(preset.params);
                        runSandboxSimulation(preset.params);
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "white" }}>{preset.title}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Parameter Controls */}
              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  2. Customize Hard-Filtering Parameters:
                </span>
                <div className="sandbox-control-grid" style={{ marginTop: 8 }}>
                  {/* City & Tier */}
                  <div className="sandbox-control-item">
                    <label>City &amp; Infrastructure Tier:</label>
                    <select
                      value={`${sandboxParams.city}|${sandboxParams.city_tier}`}
                      onChange={(e) => {
                        const [c, t] = e.target.value.split("|");
                        const updated = { ...sandboxParams, city: c, city_tier: parseInt(t, 10) };
                        setSandboxParams(updated);
                        runSandboxSimulation(updated);
                      }}
                    >
                      <option value="Mumbai|1">Mumbai (Tier 1 Metro)</option>
                      <option value="Delhi|1">Delhi NCR (Tier 1 Metro)</option>
                      <option value="Bengaluru|1">Bengaluru (Tier 1 Metro)</option>
                      <option value="Hyderabad|1">Hyderabad (Tier 1 Metro)</option>
                      <option value="Chennai|1">Chennai (Tier 1 Metro)</option>
                      <option value="Jaipur|2">Jaipur (Tier 2 Commercial)</option>
                      <option value="Kochi|2">Kochi (Tier 2 Commercial)</option>
                      <option value="Lucknow|2">Lucknow (Tier 2 Commercial)</option>
                      <option value="Ludhiana|2">Ludhiana (Tier 2 Industrial)</option>
                      <option value="Patna|2">Patna (Tier 2 Commercial)</option>
                    </select>
                  </div>

                  {/* GSTIN Toggle */}
                  <div className="sandbox-control-item">
                    <label>Has Registered GSTIN (Tax Invoice):</label>
                    <button
                      onClick={() => {
                        const next = sandboxParams.has_gstin === "Y" ? "N" : "Y";
                        const updated = { ...sandboxParams, has_gstin: next };
                        setSandboxParams(updated);
                        runSandboxSimulation(updated);
                      }}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        background: sandboxParams.has_gstin === "Y" ? "rgba(16, 185, 129, 0.2)" : "rgba(225, 29, 72, 0.2)",
                        border: `1px solid ${sandboxParams.has_gstin === "Y" ? "rgba(16, 185, 129, 0.5)" : "rgba(225, 29, 72, 0.5)"}`,
                        color: sandboxParams.has_gstin === "Y" ? "var(--accent-emerald)" : "var(--airtel-red)",
                        borderRadius: 4,
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        cursor: "pointer"
                      }}
                    >
                      {sandboxParams.has_gstin === "Y" ? "✓ Yes (GSTIN Verified · 18% ITC)" : "✕ No GSTIN (Unregistered)"}
                    </button>
                  </div>

                  {/* Staff Employees Slider */}
                  <div className="sandbox-control-item">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <label>Employee Staff Count:</label>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "white" }}>{sandboxParams.employee_count} staff</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={sandboxParams.employee_count}
                      onChange={(e) => {
                        const updated = { ...sandboxParams, employee_count: parseInt(e.target.value, 10) };
                        setSandboxParams(updated);
                        runSandboxSimulation(updated);
                      }}
                      style={{ width: "100%", accentColor: "var(--accent-cyan)" }}
                    />
                  </div>

                  {/* Number of Sites Slider */}
                  <div className="sandbox-control-item">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <label>Number of Branch Sites:</label>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "white" }}>{sandboxParams.num_sites} site(s)</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={sandboxParams.num_sites}
                      onChange={(e) => {
                        const updated = { ...sandboxParams, num_sites: parseInt(e.target.value, 10) };
                        setSandboxParams(updated);
                        runSandboxSimulation(updated);
                      }}
                      style={{ width: "100%", accentColor: "var(--accent-purple)" }}
                    />
                  </div>

                  {/* Max Installation Days Slider */}
                  <div className="sandbox-control-item">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <label>Max Installation Days Limit:</label>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-amber)" }}>{sandboxParams.max_installation_days} Days</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="28"
                      value={sandboxParams.max_installation_days}
                      onChange={(e) => {
                        const updated = { ...sandboxParams, max_installation_days: parseInt(e.target.value, 10) };
                        setSandboxParams(updated);
                        runSandboxSimulation(updated);
                      }}
                      style={{ width: "100%", accentColor: "var(--accent-amber)" }}
                    />
                  </div>
                </div>
              </div>

              {/* Simulation Results & Hard-Filter Matrix */}
              {sandboxResult && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                      3. Live Hard-Filter Evaluation Results ({sandboxResult.eligibility_matrix?.filter(p => p.eligible).length} / {sandboxResult.eligibility_matrix?.length} Eligible):
                    </span>
                    {sandboxLoading && <span style={{ fontSize: "0.72rem", color: "var(--accent-cyan)" }}>Recalculating...</span>}
                  </div>

                  {/* Matrix Table */}
                  <div style={{ maxHeight: 250, overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: 6, background: "rgba(15, 23, 42, 0.7)" }}>
                    <table className="filter-matrix-table">
                      <thead>
                        <tr>
                          <th>Product ID &amp; Name</th>
                          <th>Category</th>
                          <th>Min Rules (Staff/Sites/GST)</th>
                          <th>Status</th>
                          <th>Rejection / Eligibility Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sandboxResult.eligibility_matrix?.map((p, idx) => (
                          <tr key={idx}>
                            <td>
                              <strong style={{ color: "white" }}>{p.product_name}</strong>
                              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{p.product_id} · ₹{p.price_min_inr_per_month}/mo · ~{p.typical_install_days}d install</div>
                            </td>
                            <td>{p.category}</td>
                            <td style={{ fontSize: "0.67rem", color: "#CBD5E1" }}>
                              ≥{p.min_employees} staff · ≥{p.min_sites} site{p.requires_gstin ? " · GST Req" : ""} · Tiers: {p.available_city_tiers?.join(",") || "All"}
                            </td>
                            <td>
                              {p.eligible ? (
                                <span className="badge-eligible">✓ Eligible</span>
                              ) : (
                                <span className="badge-filtered">✕ Hard-Filtered</span>
                              )}
                            </td>
                            <td>
                              {p.eligible ? (
                                <span style={{ color: "var(--accent-emerald)", fontSize: "0.68rem" }}>Passed all constraints</span>
                              ) : (
                                p.filter_reasons.map((r, rIdx) => (
                                  <span key={rIdx} className="filter-reason-pill">{r}</span>
                                ))
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Resulting 3 Formulated Bundles */}
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                      4. Formulated Bundles from Surviving Eligible Products:
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
                      {sandboxResult.recommended_bundles?.map((b, bIdx) => (
                        <div key={bIdx} style={{ background: "rgba(30, 41, 59, 0.6)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "white" }}>{b.bundle_name}</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--accent-cyan)", fontWeight: 700 }}>₹{b.monthly_cost_inr}/mo</span>
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                            {b.description}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                            {b.products?.map((prod, pIdx) => (
                              <span key={pIdx} style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 4, padding: "2px 6px", fontSize: "0.68rem", color: "#E2E8F0" }}>
                                {prod.product_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

