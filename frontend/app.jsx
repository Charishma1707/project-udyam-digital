/**
 * ============================================================================
 * AIRTEL BUSINESS - ENTERPRISE COMMERCE & AI SALES PLATFORM
 * Signature Airtel Red Theme ("Build a Business Together")
 * ============================================================================
 * Dual-Role Architecture:
 * 1. Customer Portal (User Mode):
 *    - Storefront Products Catalogue in Airtel Red
 *    - AI Shopping / Sales Assistant (Image 2 & 4 in Airtel Red: In-chat product
 *      carousel, suggestion chips, voice recording, live KYC verification badge)
 *    - Live 4-Milestone Order Tracker (Image 1: S00060, green checkmarks,
 *      connector bars, timestamps)
 * 2. Admin Operations Command Center (Admin Mode - Image 3 in Airtel Burgundy):
 *    - Airtel Deep Crimson sidebar (Dashboard, Orders, Products, Escalations)
 *    - Orders Management Table with live status updating
 *    - AI Escalations & Direct Customer Messaging
 * ============================================================================
 */

const { useState, useEffect, useRef } = React;

function App() {
  // Global Role: 'user' | 'admin'
  const [currentRole, setCurrentRole] = useState("user");
  const [sessionId] = useState(() => "session_" + Math.random().toString(36).substring(2, 9));
  
  // Navigation Tabs
  const [customerTab, setCustomerTab] = useState("chat"); // 'products' | 'chat' | 'tracking'
  const [adminTab, setAdminTab] = useState("orders"); // 'orders' | 'escalations' | 'products' | 'dashboard'

  // Products State
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [planViewMode, setPlanViewMode] = useState("recharge"); // 'recharge' (Image 1 Airtel style) | 'grid'
  const [showSignInModal, setShowSignInModal] = useState(false); // Image 2 Sign-in modal
  const [customerName, setCustomerName] = useState("Dean Ambrose");

  // Orders State (Loaded from Database)
  const [orders, setOrders] = useState([]);
  const [activeTrackingOrderId, setActiveTrackingOrderId] = useState("S00060");
  const [activeTrackingOrder, setActiveTrackingOrder] = useState(null);

  // AI Shopping Assistant Chat State (Image 2 & 4)
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Namaste! Welcome to Airtel Business. Build a business together with guaranteed high-speed fibre, 5G AirFiber, and cloud security. How can I assist your enterprise today?",
      time: "Just now",
      recommendations: null
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // KYC State
  const [kycVerified, setKycVerified] = useState(null);
  const [kycUploading, setKycUploading] = useState(false);

  // Admin Messaging State
  const [adminTargetSession, setAdminTargetSession] = useState("");
  const [adminMsgText, setAdminMsgText] = useState("");
  const [adminSendStatus, setAdminSendStatus] = useState("");

  // Initial Load from Backend Database
  useEffect(() => {
    fetchProducts();
    fetchOrders();
    const interval = setInterval(() => {
      fetchOrders();
      checkUserMessages();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Update Active Tracking Order when ID or orders list changes
  useEffect(() => {
    if (orders.length > 0) {
      const found = orders.find(o => o.order_id === activeTrackingOrderId) || orders[0];
      setActiveTrackingOrder(found);
    }
  }, [orders, activeTrackingOrderId]);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (data.products) setProducts(data.products);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  };

  const checkUserMessages = async () => {
    try {
      const res = await fetch(`/api/user/messages/${sessionId}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const lastMsg = data.messages[data.messages.length - 1];
        setMessages(prev => {
          if (!prev.some(m => m.id === lastMsg.message_id)) {
            return [
              ...prev,
              {
                id: lastMsg.message_id,
                role: "assistant",
                isAdmin: true,
                content: `🔔 Operations Update from Airtel: "${lastMsg.message}"`,
                time: lastMsg.timestamp || "Just now"
              }
            ];
          }
          return prev;
        });
      }
    } catch (err) {}
  };

  // Chat message sending
  const handleSendMessage = async (textToSend = null) => {
    const text = textToSend || inputMessage;
    if (!text || !text.trim() || isAiLoading) return;

    const userMsg = {
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage("");
    setIsAiLoading(true);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });
      const data = await res.json();

      let recs = null;
      if (data.ready_for_recommendation || data.customer_schema?.business_type) {
        try {
          const recRes = await fetch(`/api/recommend/${sessionId}`);
          recs = await recRes.json();
        } catch (e) {}
      }

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "I have noted your requirements.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          recommendations: recs?.bundles || null
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "We provide high-speed Airtel Biz Fibre, 5G AirFiber, and Cloud CCTV. Could you tell me how many employees or locations you operate?",
          time: "Just now"
        }
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Voice recording via Sarvam Saaras:v3
  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const formData = new FormData();
          formData.append("file", audioBlob, "user_speech.wav");
          formData.append("session_id", sessionId);

          setIsAiLoading(true);
          try {
            const res = await fetch("/voice", { method: "POST", body: formData });
            const data = await res.json();
            if (data.reply) {
              setMessages(prev => [
                ...prev,
                { role: "user", content: "🎤 [Spoken Audio Message]", time: "Just now" },
                { role: "assistant", content: data.reply, time: "Just now" }
              ]);
            }
          } catch (e) {
            console.error("STT Error:", e);
          } finally {
            setIsAiLoading(false);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        alert("Microphone access permission required for voice chat.");
      }
    }
  };

  // Accept Quote and Place Order
  const handleAcceptQuote = async (bundle) => {
    try {
      const res = await fetch("/api/orders/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId,
          bundleCode: bundle.bundle_code || "BUNDLE-PRIMARY",
          bundleName: bundle.bundle_name || "Enterprise Growth Suite",
          monthlyCost: bundle.monthly_total_inr || 2499,
          contractMonths: bundle.contract_months || 12,
          customerSchema: {
            business_name: "My Enterprise Business",
            business_type: "Retail & Services",
            segment: "Micro Retail & Services"
          }
        })
      });
      const data = await res.json();
      if (data.order) {
        await fetchOrders();
        setActiveTrackingOrderId(data.order.order_id);
        setCustomerTab("tracking");
      }
    } catch (err) {
      alert("Failed to place order. Please try again.");
    }
  };

  // Handle KYC Document Upload
  const handleKycUpload = async (file) => {
    if (!file) return;
    setKycUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", "gstin");
    formData.append("session_id", sessionId);

    try {
      const res = await fetch("/api/kyc/upload", { method: "POST", body: formData });
      const data = await res.json();
      setKycVerified(data);
    } catch (err) {
      alert("KYC verification error. Please retry.");
    } finally {
      setKycUploading(false);
    }
  };

  // Admin Order Status Update (Persists directly to Database)
  const handleAdminStatusChange = async (orderId, newStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        await fetchOrders();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Admin Send Message to Customer
  const handleSendAdminMessage = async () => {
    if (!adminMsgText.trim()) return;
    const target = adminTargetSession || sessionId;
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: target,
          customer_name: "Customer",
          message: adminMsgText
        })
      });
      const data = await res.json();
      if (data.success) {
        setAdminSendStatus("Message dispatched successfully to customer!");
        setAdminMsgText("");
        setTimeout(() => setAdminSendStatus(""), 4000);
      }
    } catch (err) {
      setAdminSendStatus("Failed to send message.");
    }
  };

  // Filter products by category & search
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategory === "All" || p.category?.toLowerCase().includes(selectedCategory.toLowerCase());
    const matchesQuery = !searchQuery || p.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <div className="app-wrapper" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ====================================================================
          TOP APPLICATION HEADER (AIRTEL RED BRAND + ROLE SWITCHER)
          ==================================================================== */}
      <header className="top-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#FFFFFF', borderBottom: '2px solid #FEE2E2', boxShadow: '0 2px 10px rgba(237, 27, 36, 0.05)' }}>
        <div className="brand-section" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#ED1B24', color: '#FFFFFF', fontWeight: 900, padding: '5px 12px', borderRadius: '8px', fontSize: '0.95rem', letterSpacing: '0.04em', boxShadow: '0 2px 10px rgba(237, 27, 36, 0.3)' }}>
            airtel
          </div>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              airtel <span style={{ color: '#ED1B24' }}>business</span>
            </h1>
            <p style={{ fontSize: '0.72rem', color: '#ED1B24', fontWeight: 700, margin: 0 }}>
              Build a Business Together • Project Udyam Digital
            </p>
          </div>
        </div>

        {/* Center: Customer Navigation Tabs (When in User Role) */}
        {currentRole === "user" && (
          <div className="nav-tabs-bar" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`nav-tab-btn ${customerTab === 'products' ? 'active' : ''}`}
              onClick={() => setCustomerTab('products')}
            >
              🛍️ Solutions Catalogue
            </button>
            <button 
              className={`nav-tab-btn ${customerTab === 'chat' ? 'active' : ''}`}
              onClick={() => setCustomerTab('chat')}
            >
              ✨ AI Sales Assistant
            </button>
            <button 
              className={`nav-tab-btn ${customerTab === 'tracking' ? 'active' : ''}`}
              onClick={() => setCustomerTab('tracking')}
            >
              📦 Order Tracking ({orders.length})
            </button>
          </div>
        )}

        {/* Right: User Profile & Role Switcher Pill (Airtel Red) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentRole === "user" && (
            <button 
              onClick={() => setShowSignInModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '9999px',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#7F1D1D',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Click to view Airtel Account (Image 2)"
            >
              <span style={{ fontSize: '0.9rem' }}>👤</span>
              <span>{customerName}</span>
              <span style={{ fontSize: '0.65rem', background: '#ED1B24', color: '#FFFFFF', padding: '1px 6px', borderRadius: '9999px', fontWeight: 800 }}>
                Airtel VIP
              </span>
            </button>
          )}

          <div className="role-pill-group">
            <button 
              className={`role-pill-btn ${currentRole === 'user' ? 'active' : ''}`}
              onClick={() => setCurrentRole('user')}
            >
              👤 Customer View
            </button>
            <button 
              className={`role-pill-btn ${currentRole === 'admin' ? 'active' : ''}`}
              onClick={() => setCurrentRole('admin')}
            >
              🛡️ Admin Operations
            </button>
          </div>
        </div>
      </header>

      {/* ====================================================================
          ROLE 1: CUSTOMER VIEW (STOREFRONT / AI ASSISTANT / ORDER TRACKING)
          ==================================================================== */}
      {currentRole === "user" && (
        <main style={{ flex: 1, overflowY: 'auto', background: '#FAFAFA' }}>
          
          {/* TAB 1: PRODUCTS STOREFRONT (AIRTEL RED THEME - IMAGE 1 APP STYLE) */}
          {customerTab === "products" && (
            <div style={{ maxWidth: '1100px', margin: '24px auto', padding: '0 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A' }}>
                    Enterprise Telecom Solutions <span style={{ color: '#ED1B24' }}>for MSMEs</span>
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    Guaranteed 99.5% - 99.9% uptime connectivity, Cloud tools, and IoT security engineered by Airtel Business.
                  </p>
                </div>

                {/* View Mode Toggle (Image 1 Mobile Recharge Style vs Grid) */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#F8FAFC', padding: '4px', borderRadius: '10px', border: '1px solid #FECACA' }}>
                  <button
                    onClick={() => setPlanViewMode("recharge")}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: planViewMode === 'recharge' ? '#ED1B24' : 'transparent',
                      color: planViewMode === 'recharge' ? '#FFFFFF' : '#7F1D1D',
                      boxShadow: planViewMode === 'recharge' ? '0 2px 8px rgba(237, 27, 36, 0.3)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    📱 Airtel Recharge Plans (Image 1 Style)
                  </button>
                  <button
                    onClick={() => setPlanViewMode("grid")}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background: planViewMode === 'grid' ? '#ED1B24' : 'transparent',
                      color: planViewMode === 'grid' ? '#FFFFFF' : '#7F1D1D',
                      boxShadow: planViewMode === 'grid' ? '0 2px 8px rgba(237, 27, 36, 0.3)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    🖥️ Enterprise Grid Cards
                  </button>
                </div>
              </div>

              {/* Category Pills (Airtel Red) */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
                {["All", "Connectivity", "Cloud & Productivity", "Security", "IoT & Physical"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: '1px solid',
                      borderColor: selectedCategory === cat ? '#ED1B24' : '#FECACA',
                      background: selectedCategory === cat ? '#ED1B24' : '#FFFFFF',
                      color: selectedCategory === cat ? '#FFFFFF' : '#7F1D1D',
                      boxShadow: selectedCategory === cat ? '0 2px 8px rgba(237, 27, 36, 0.3)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* VIEW 1: IMAGE 1 RECHARGE LIST (RECHARGE SCREEN EXACT MATCH) */}
              {planViewMode === "recharge" && (
                <div className="recharge-screen-box">
                  {/* Top Bar matching Image 1: "रिचार्ज" and "बदलिए" */}
                  <div className="recharge-top-bar">
                    <div className="recharge-title">
                      <span style={{ cursor: 'pointer', color: '#ED1B24' }}>←</span>
                      <span>रिचार्ज</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>
                        (Airtel Enterprise Recharge & Leased Plans)
                      </span>
                    </div>
                    <button 
                      className="recharge-filter-action"
                      onClick={() => setSearchQuery("")}
                    >
                      बदलिए (Reset Filter)
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="recharge-search-row">
                    <span>🔍</span>
                    <input 
                      type="text" 
                      className="recharge-search-input"
                      placeholder="Search ₹249, ₹399, ₹598, or Enterprise Leased Line..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* List of Plan Cards directly matching Image 1 */}
                  <div>
                    {filteredProducts.map(p => (
                      <div key={p.product_id} className="recharge-item-card">
                        <div className="recharge-main-row">
                          {/* Left: Price Column */}
                          <div className="recharge-price-col">
                            <div className="recharge-price-val">₹{p.monthly_price_inr.toLocaleString()}</div>
                            <div className="recharge-price-sub">असीमित कॉल्स • GSTIN {p.requires_gstin === 'Y' ? 'अनिवार्य' : 'मुक्त'}</div>
                          </div>

                          {/* Middle: Data Allowance & Speed */}
                          <div className="recharge-data-col">
                            <div className="recharge-data-val">
                              {p.category === 'Connectivity' ? '1.5GB/day or Leased Line' : p.product_name}
                            </div>
                            <div className="recharge-data-sub">
                              <span>⏱️ {p.typical_install_days} Days Install</span>
                              <span>•</span>
                              <span>👥 Min {p.min_employees} Staff</span>
                            </div>
                          </div>

                          {/* Validity Column */}
                          <div className="recharge-validity-col">
                            <div className="recharge-validity-val">
                              {p.monthly_price_inr < 1000 ? '28 दिन / 28 Days' : '12-Month SLA'}
                            </div>
                            <div className="recharge-validity-sub">99.5% Guaranteed</div>
                          </div>

                          {/* Right: Circular Red Forward Button (Image 1 & 2) */}
                          <button
                            className="btn-recharge-arrow"
                            title={`Select ${p.product_name} and ask AI`}
                            onClick={() => {
                              setCustomerTab("chat");
                              handleSendMessage(`I want to learn more and get a customized quote for ${p.product_name} (₹${p.monthly_price_inr.toLocaleString()}/mo)`);
                            }}
                          >
                            ➔
                          </button>
                        </div>

                        {/* Perks Row (Image 1 footer icons) */}
                        <div className="recharge-perks-row">
                          <span className="recharge-perk-item">🚀 <strong>Fibre Ultra-Fast</strong></span>
                          <span className="recharge-perk-item">🛡️ <strong>Airtel Secure Shield</strong></span>
                          <span className="recharge-perk-item">📞 <strong>24x7 NOC Support</strong></span>
                          {p.one_time_setup_inr === 0 ? (
                            <span className="recharge-perk-item" style={{ color: '#16A34A' }}>🎉 <strong>Zero Setup Fee</strong></span>
                          ) : (
                            <span className="recharge-perk-item">⚙️ Setup: ₹{p.one_time_setup_inr}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VIEW 2: ENTERPRISE GRID CARDS */}
              {planViewMode === "grid" && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {filteredProducts.map(p => (
                    <div key={p.product_id} style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #FECACA', padding: '20px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 14px rgba(237, 27, 36, 0.04)', transition: 'transform 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', background: '#FEF2F2', color: '#ED1B24', padding: '3px 8px', borderRadius: '4px', border: '1px solid #FECACA' }}>
                          {p.category}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: p.requires_gstin === 'Y' ? '#ED1B24' : '#16A34A' }}>
                          {p.requires_gstin === 'Y' ? '🔒 Requires GSTIN' : '✅ No GST Needed'}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>{p.product_name}</h3>
                      <p style={{ fontSize: '0.78rem', color: '#64748B', flex: 1, marginBottom: '14px', lineHeight: '1.4' }}>
                        Typical install: <strong>{p.typical_install_days} days</strong> • Min Staff: {p.min_employees} • Min Sites: {p.min_sites}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #FEE2E2' }}>
                        <div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ED1B24' }}>₹{p.monthly_price_inr.toLocaleString()}</div>
                          <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>per month • setup ₹{p.one_time_setup_inr}</div>
                        </div>
                        <button
                          onClick={() => {
                            setCustomerTab("chat");
                            handleSendMessage(`I want to learn more and get a quote for ${p.product_name}`);
                          }}
                          style={{ background: '#ED1B24', color: '#FFFFFF', border: 'none', padding: '9px 18px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(237, 27, 36, 0.3)', transition: 'background 0.2s' }}
                        >
                          Ask AI Assistant ➔
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI SHOPPING & SALES ASSISTANT (AIRTEL RED THEME - IMAGE 2 & 4) */}
          {customerTab === "chat" && (
            <div className="assistant-wrapper">
              <div className="assistant-header">
                <div className="assistant-title">
                  <span style={{ fontSize: '1.2rem' }}>✨</span> airtel <span style={{ fontWeight: 400 }}>Shopping Assistant</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: '#FFFFFF', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '9999px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ADE80' }}></span> Online
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div className="chat-stream-container">
                {messages.map((m, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                    {m.role === "user" ? (
                      <div className="chat-bubble-user">
                        {m.content}
                      </div>
                    ) : (
                      <div className="chat-bubble-ai">
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                          <span className="chat-avatar-ai">✨</span>
                          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#ED1B24' }}>Airtel AI Business Advisor</span>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{m.content}</div>

                        {/* In-Chat Product Carousel (Image 2 & 4 in Airtel Red) */}
                        {m.recommendations && m.recommendations.length > 0 && (
                          <div style={{ marginTop: '14px' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ED1B24', marginBottom: '6px' }}>
                              Recommended Business Packages:
                            </div>
                            <div className="product-carousel-row">
                              {m.recommendations.map((b, bIdx) => (
                                <div key={bIdx} className="carousel-card">
                                  <div className="carousel-img-placeholder">
                                    {b.type === "PRIMARY_BEST_MATCH" ? "🚀" : "💡"}
                                  </div>
                                  <div className="carousel-body">
                                    <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#ED1B24', textTransform: 'uppercase' }}>
                                      {b.type.replace('_', ' ')}
                                    </div>
                                    <div className="carousel-title">{b.bundle_name}</div>
                                    <div className="carousel-price">₹{b.monthly_total_inr.toLocaleString()}/mo</div>
                                    <ul style={{ fontSize: '0.68rem', color: '#64748B', margin: '0 0 10px 14px', padding: 0 }}>
                                      {b.fit_reasons?.map((r, rIdx) => <li key={rIdx}>{r}</li>)}
                                    </ul>
                                    <button 
                                      className="btn-carousel-action"
                                      onClick={() => handleAcceptQuote(b)}
                                    >
                                      Accept Quote & Order ➔
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {isAiLoading && (
                  <div className="chat-bubble-ai" style={{ fontStyle: 'italic', color: '#ED1B24' }}>
                    ✨ Airtel AI Advisor is analyzing requirements and qualifying business plans...
                  </div>
                )}
              </div>

              {/* Digital KYC Verification Inline Card */}
              <div style={{ padding: '10px 16px', background: '#FEF2F2', borderTop: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7F1D1D' }}>Digital KYC Verification (DPDP Act 2023)</div>
                    <div style={{ fontSize: '0.68rem', color: '#991B1B' }}>
                      {kycVerified ? `Verified: ${kycVerified.extracted_identifier}` : 'Upload GST or Udyam certificate for instant verification'}
                    </div>
                  </div>
                </div>
                <div>
                  {kycVerified ? (
                    <span style={{ background: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #86EFAC' }}>
                      ✅ VERIFIED ACTIVE
                    </span>
                  ) : (
                    <label style={{ background: '#ED1B24', color: '#FFFFFF', padding: '6px 14px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 6px rgba(237, 27, 36, 0.3)' }}>
                      {kycUploading ? 'Verifying...' : 'Upload KYC Certificate'}
                      <input type="file" style={{ display: 'none' }} onChange={(e) => handleKycUpload(e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>

              {/* Suggestion Chips Bar (Airtel Red) */}
              <div className="suggestion-chips-bar">
                {[
                  "Need Office WiFi for 15 Staff",
                  "Need CCTV for 3 Retail Shops",
                  "Explore 5G AirFiber",
                  "Dedicated Internet Leased Line",
                  "Check My Order S00060"
                ].map((chip, idx) => (
                  <button 
                    key={idx} 
                    className="chip-btn"
                    onClick={() => {
                      if (chip.includes("S00060")) {
                        setActiveTrackingOrderId("S00060");
                        setCustomerTab("tracking");
                      } else {
                        handleSendMessage(chip);
                      }
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <div className="chat-input-bar">
                <input 
                  type="text" 
                  className="chat-input-field"
                  placeholder="Ask anything about Airtel Business..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  className={`btn-chat-mic ${isRecording ? 'recording' : ''}`}
                  onClick={toggleRecording}
                  title={isRecording ? "Stop recording" : "Speak to AI"}
                >
                  🎤
                </button>
                <button 
                  className="btn-chat-send"
                  onClick={() => handleSendMessage()}
                  title="Send"
                >
                  ➔
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ORDER TRACKING SCREEN (MATCHES IMAGE 1 DIRECTLY!) */}
          {customerTab === "tracking" && (
            <div className="order-tracking-page">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>My Orders & Installation Tracking</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Select Order:</span>
                  <select 
                    value={activeTrackingOrderId} 
                    onChange={(e) => setActiveTrackingOrderId(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #FECACA', fontSize: '0.82rem', fontWeight: 700 }}
                  >
                    {orders.map(o => (
                      <option key={o.order_id} value={o.order_id}>
                        {o.order_id} - {o.customer_name} ({o.status})
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={fetchOrders}
                    style={{ padding: '6px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#ED1B24', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {/* Order Tracker Card (Image 1 replica in Airtel Red Border) */}
              <div className="order-tracker-card">
                {/* Order ID Banner */}
                <div className="order-header-banner">
                  {activeTrackingOrder?.order_id || "S00060"}
                </div>

                {/* Stepper with Circles & Connector Bar */}
                <div className="stepper-container" style={{ margin: '30px 20px 20px 20px' }}>
                  {/* Background Track Line */}
                  <div 
                    className="stepper-line" 
                    style={{ left: '12%', right: '12%' }}
                  />
                  {/* Completed Green Line */}
                  <div 
                    className="stepper-line completed" 
                    style={{ 
                      left: '12%', 
                      width: `${((activeTrackingOrder?.current_stage_index || 0) / 3) * 76}%` 
                    }}
                  />

                  {/* 4 Nodes Matching Image 1 */}
                  {(activeTrackingOrder?.milestones || [
                    { stage: "PENDING", title: "Pending", date_str: "Tue, May 21, 2024, 6:44:14 PM", completed: true, icon: "pending" },
                    { stage: "CONFIRMED", title: "Order Confirm", date_str: "Thu, May 30, 2024, 9:42:58 AM", completed: true, icon: "confirm" },
                    { stage: "PACKED", title: "Packed and Processed", date_str: "Fri, May 31, 2024, 9:43:00 AM", completed: false, icon: "packed" },
                    { stage: "DELIVERED", title: "Delivered", date_str: "Expected Delivery Date: Jun 04, 2024", completed: false, icon: "delivered" }
                  ]).map((m, idx) => {
                    const isDone = m.completed || (activeTrackingOrder?.current_stage_index >= idx);
                    return (
                      <div key={idx} className="stepper-node">
                        {/* Circle */}
                        <div className={`stepper-circle ${isDone ? 'completed' : ''}`}>
                          {isDone ? '✓' : ''}
                        </div>

                        {/* Icon Box */}
                        <div className="milestone-icon-box">
                          {idx === 0 && "📄"}
                          {idx === 1 && "🛒"}
                          {idx === 2 && "📦"}
                          {idx === 3 && "🚚"}
                        </div>

                        {/* Title */}
                        <div className={`milestone-title ${isDone ? 'completed' : ''}`}>
                          {m.title}
                        </div>

                        {/* Date & Time */}
                        <div className="milestone-date">
                          {m.date_str || "Scheduled"}
                        </div>

                        {/* Description */}
                        <div className="milestone-desc">
                          {m.description}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Package & SLA Contract Details */}
                <div className="order-details-box">
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7F1D1D' }}>
                      {activeTrackingOrder?.bundle_name || "Enterprise High-Speed Suite"}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#991B1B' }}>
                      Contract: {activeTrackingOrder?.contract_months || 12} Months • SLA: {activeTrackingOrder?.contract_terms?.sla_uptime || '99.5% Commercial Uptime'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ED1B24' }}>
                      ₹{(activeTrackingOrder?.monthly_cost || 2499).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#7F1D1D' }}>monthly advance billing</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ====================================================================
          ROLE 2: ADMIN OPERATIONS COMMAND CENTER (AIRTEL CRIMSON - IMAGE 3)
          ==================================================================== */}
      {currentRole === "admin" && (
        <div className="admin-shell">
          {/* Airtel Deep Crimson Sidebar */}
          <aside className="admin-sidebar-blue">
            <div className="admin-brand">
              <span style={{ background: '#ED1B24', color: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 900 }}>
                airtel
              </span>
              Operations
            </div>

            <div className="admin-nav-list">
              <button 
                className={`admin-nav-item ${adminTab === 'orders' ? 'active' : ''}`}
                onClick={() => setAdminTab('orders')}
              >
                📦 Orders Management ({orders.length})
              </button>
              <button 
                className={`admin-nav-item ${adminTab === 'escalations' ? 'active' : ''}`}
                onClick={() => setAdminTab('escalations')}
              >
                🚨 AI Escalations & Chat
              </button>
              <button 
                className={`admin-nav-item ${adminTab === 'products' ? 'active' : ''}`}
                onClick={() => setAdminTab('products')}
              >
                🏷️ Products Catalogue ({products.length})
              </button>
              <button 
                className={`admin-nav-item ${adminTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setAdminTab('dashboard')}
              >
                📊 Sales Dashboard & KPIs
              </button>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.72rem', color: '#FECACA' }}>
              👤 Logged in as: Airtel Ops Admin<br />
              Region: India Core (FastAPI)
            </div>
          </aside>

          {/* Admin Main Content Panel */}
          <main className="admin-main-panel">
            {/* ADMIN TAB 1: ORDERS MANAGEMENT (LIVE TABLE WITH STATUS TOGGLE) */}
            {adminTab === "orders" && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>Customer Orders Management</h2>
                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Live orders synced from PostgreSQL database. Toggle order status to update customer tracking.</p>
                  </div>
                  <button 
                    onClick={fetchOrders}
                    style={{ background: '#ED1B24', color: '#FFFFFF', padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(237, 27, 36, 0.3)' }}
                  >
                    🔄 Refresh Orders
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer / Business</th>
                        <th>Package Plan</th>
                        <th>Monthly Bill</th>
                        <th>Current Status</th>
                        <th>Update Status (DB Sync)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.order_id}>
                          <td style={{ fontWeight: 800, color: '#ED1B24' }}>{o.order_id}</td>
                          <td>
                            <div style={{ fontWeight: 700 }}>{o.customer_name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{o.business_type}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{o.bundle_name}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{o.bundle_code}</div>
                          </td>
                          <td style={{ fontWeight: 800, color: '#ED1B24' }}>
                            ₹{o.monthly_cost?.toLocaleString()}
                          </td>
                          <td>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              background: o.status === 'Delivered' ? '#DCFCE7' : o.status === 'Order Confirm' ? '#FEF2F2' : '#FEF3C7',
                              color: o.status === 'Delivered' ? '#166534' : o.status === 'Order Confirm' ? '#ED1B24' : '#92400E',
                              border: o.status === 'Order Confirm' ? '1px solid #FECACA' : 'none'
                            }}>
                              {o.status}
                            </span>
                          </td>
                          <td>
                            {/* Live Dropdown to Update Status in DB */}
                            <select
                              value={o.status}
                              onChange={(e) => handleAdminStatusChange(o.order_id, e.target.value)}
                              className="admin-status-dropdown"
                            >
                              <option value="Pending">Pending (Stage 0)</option>
                              <option value="Order Confirm">Order Confirm (Stage 1)</option>
                              <option value="Packed and Processed">Packed and Processed (Stage 2)</option>
                              <option value="Delivered">Delivered & Active (Stage 3)</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMIN TAB 2: AI ESCALATIONS & DIRECT CUSTOMER MESSAGING */}
            {adminTab === "escalations" && (
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>AI Escalations & Customer Direct Messaging</h2>
                <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '24px' }}>
                  Cases where customer requested custom pricing, high-capacity leased lines, or where AI flagged human review. Send direct recommendations or messages.
                </p>

                {/* Send Message Card */}
                <div className="admin-top-card" style={{ maxWidth: '650px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#7F1D1D', marginBottom: '14px' }}>💬 Send Message / Custom Bundle to Customer</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Target Customer Session:</label>
                      <input 
                        type="text" 
                        placeholder="session_... (Leave empty for active user)"
                        value={adminTargetSession}
                        onChange={(e) => setAdminTargetSession(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FECACA', marginTop: '4px', fontSize: '0.82rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Operations Message / Recommendation:</label>
                      <textarea 
                        rows="3"
                        placeholder="e.g. Hello, we reviewed your multi-site requirement. We can provide 1G Optical Leased Line with 20% discount on 24-month contract."
                        value={adminMsgText}
                        onChange={(e) => setAdminMsgText(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FECACA', marginTop: '4px', fontSize: '0.82rem', fontFamily: 'inherit' }}
                      />
                    </div>
                    <button 
                      onClick={handleSendAdminMessage}
                      style={{ background: '#ED1B24', color: '#FFFFFF', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', alignSelf: 'flex-start', boxShadow: '0 2px 8px rgba(237, 27, 36, 0.3)' }}
                    >
                      🚀 Send Message to Customer Chat
                    </button>
                    {adminSendStatus && (
                      <div style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 700 }}>
                        {adminSendStatus}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ADMIN TAB 3: PRODUCTS CATALOGUE (IMAGE 3 TABLE) */}
            {adminTab === "products" && (
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Catalogue Products ({products.length})</h2>
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Product ID</th>
                        <th>Product Name</th>
                        <th>Category</th>
                        <th>Monthly Price</th>
                        <th>Setup Fee</th>
                        <th>GST Required</th>
                        <th>Install Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.product_id}>
                          <td style={{ fontWeight: 800, color: '#ED1B24' }}>{p.product_id}</td>
                          <td style={{ fontWeight: 700 }}>{p.product_name}</td>
                          <td>{p.category}</td>
                          <td style={{ fontWeight: 800, color: '#ED1B24' }}>₹{p.monthly_price_inr.toLocaleString()}</td>
                          <td>₹{p.one_time_setup_inr}</td>
                          <td>{p.requires_gstin === 'Y' ? 'Yes' : 'No'}</td>
                          <td>{p.typical_install_days} Days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMIN TAB 4: DASHBOARD & KPIS */}
            {adminTab === "dashboard" && (
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>Sales Operations Command Center</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div className="admin-top-card">
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>TOTAL SMB LEADS</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0F172A' }}>5,000</div>
                    <div style={{ fontSize: '0.7rem', color: '#16A34A' }}>↑ Synthetic Pipeline</div>
                  </div>
                  <div className="admin-top-card">
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>ACTIVE ORDERS</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ED1B24' }}>{orders.length}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>In active fulfillment</div>
                  </div>
                  <div className="admin-top-card">
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>SLA UPTIME TARGET</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#16A34A' }}>99.9%</div>
                    <div style={{ fontSize: '0.7rem', color: '#16A34A' }}>Guaranteed Enterprise</div>
                  </div>
                  <div className="admin-top-card">
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>AVG ACTIVATION CYCLE</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ED1B24' }}>3.2 Days</div>
                    <div style={{ fontSize: '0.7rem', color: '#16A34A' }}>Down from 17.6 days</div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ====================================================================
          IMAGE 2: AIRTEL SIGN-IN & PROFILE MODAL ("BUILD A BUSINESS TOGETHER")
          ==================================================================== */}
      {showSignInModal && (
        <div className="airtel-modal-overlay" onClick={() => setShowSignInModal(false)}>
          <div className="airtel-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="airtel-wave-bg"></div>
            
            {/* Status Bar simulation like Image 2 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px 0 20px', fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
              <span>••••• EE</span>
              <span>12:53 pm</span>
              <span>🔋 31%</span>
            </div>

            <div className="airtel-modal-header">
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                SIGN IN
              </div>
              <div className="airtel-modal-logo">airtel</div>
              <div className="airtel-modal-tagline">Build a Business Together</div>
            </div>

            <div className="airtel-modal-body">
              <div className="airtel-input-group">
                <label className="airtel-input-label">Enter Your Name</label>
                <div className="airtel-input-wrapper">
                  <span>👤</span>
                  <input 
                    type="text" 
                    className="airtel-input-field" 
                    value={customerName} 
                    onChange={(e) => setCustomerName(e.target.value)} 
                  />
                </div>
              </div>

              <div className="airtel-input-group">
                <label className="airtel-input-label">Password</label>
                <div className="airtel-input-wrapper">
                  <span>🔒</span>
                  <input 
                    type="password" 
                    className="airtel-input-field" 
                    defaultValue="password123" 
                  />
                </div>
              </div>

              <div className="airtel-forgot-link">Forgot Your Password?</div>

              <button 
                className="btn-airtel-signin"
                onClick={() => setShowSignInModal(false)}
              >
                Sign in Now
              </button>

              <div className="airtel-social-section">
                <div className="airtel-social-label">or Via Social Media</div>
                <div className="airtel-social-icons">
                  <button className="social-circle-btn" style={{ color: '#1877F2' }}>f</button>
                  <button className="social-circle-btn" style={{ color: '#EA4335' }}>G+</button>
                  <button className="social-circle-btn" style={{ color: '#1DA1F2' }}>🐦</button>
                </div>
              </div>

              <button 
                className="floating-arrow-btn"
                onClick={() => setShowSignInModal(false)}
                title="Continue"
              >
                ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
