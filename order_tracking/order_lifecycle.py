"""
=============================================================================
ORDER TRACKING: Order Lifecycle & Sales Operations (order_lifecycle.py)
=============================================================================
Manages the post-discovery commercial journey:
- Dynamic SLA Contract Generation (99.5% for retail vs 99.9% for multi-branch)
- 5-Milestone Order Tracker:
  1. Quote Accepted
  2. KYC Verified
  3. Site Survey Completed
  4. Hardware Installation & Wiring
  5. Service Activated
- Rejection / Lost Quote Logger & Counter-offer capture
- Sales Operations Command Center metrics and active escalation queue
=============================================================================
"""

import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional


class OrderLifecycleService:
    def __init__(self):
        self.orders: Dict[str, Dict[str, Any]] = {}
        self.rejections: List[Dict[str, Any]] = []

    def accept_quote(
        self,
        session_id: str,
        bundle_code: str,
        bundle_name: str,
        monthly_cost: float,
        contract_months: int = 12,
        customer_schema: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Creates an accepted commercial order with dynamic SLA terms and 5 milestones.
        """
        order_id = f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

        profile = customer_schema or {}
        segment = profile.get("segment") or "Micro Retail & Services"

        # Tailored SLA based on enterprise scale
        if "Multi-site" in segment or "Manufacturing" in segment:
            sla_uptime = "99.9% High-Availability Mission-Critical SLA"
            mttr_hours = 4
        else:
            sla_uptime = "99.5% Standard Commercial Uptime SLA"
            mttr_hours = 8

        milestones = [
            {"stage": "QUOTE_ACCEPTED", "title": "Quote Accepted & Signed", "description": "Customer approved commercial package and SLA terms.", "completed": True, "target_days": 0},
            {"stage": "KYC_VERIFIED", "title": "Digital KYC Verified", "description": "Government registry cross-validation complete.", "completed": True, "target_days": 1},
            {"stage": "SITE_SURVEY", "title": "Technical Site Survey", "description": "Airtel engineer dispatched for optical power test and fibre route inspection.", "completed": False, "target_days": 3},
            {"stage": "INSTALLATION", "title": "Hardware Installation & Wiring", "description": "Enterprise router, WiFi access points, and firewall setup.", "completed": False, "target_days": 7},
            {"stage": "SERVICE_ACTIVATED", "title": "Service Live & Commissioned", "description": "Circuits active and operational.", "completed": False, "target_days": 10}
        ]

        order = {
            "order_id": order_id,
            "session_id": session_id,
            "status": "SURVEY_SCHEDULED",
            "current_stage_index": 2,
            "bundle_code": bundle_code,
            "bundle_name": bundle_name,
            "monthly_cost": monthly_cost,
            "contract_months": contract_months,
            "contract_terms": {
                "sla_uptime": sla_uptime,
                "mttr_hours": mttr_hours,
                "billing_cycle": "Monthly Advance",
                "notice_period_days": 30
            },
            "milestones": milestones,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        self.orders[order_id] = order
        return {"success": True, "order": order}

    def reject_quote(
        self,
        session_id: str,
        bundle_code: str,
        rejection_reason: str,
        customer_feedback: str = "",
        budget_offered: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Records structured rejection feedback and counter-offers for sales managers.
        """
        record = {
            "rejection_id": f"REJ-{uuid.uuid4().hex[:6].upper()}",
            "session_id": session_id,
            "bundle_code": bundle_code,
            "rejection_reason": rejection_reason,
            "customer_feedback": customer_feedback,
            "budget_offered": budget_offered,
            "created_at": datetime.now().isoformat()
        }
        self.rejections.append(record)
        return {"success": True, "record": record}

    def get_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves order tracking details."""
        return self.orders.get(order_id)

    def get_sales_dashboard(self) -> Dict[str, Any]:
        """Returns aggregated sales metrics, active escalations, and lost quote analytics."""
        return {
            "total_leads": 5000,
            "activated_leads": 368 + len(self.orders),
            "conversion_rate_percent": 7.4,
            "avg_lead_to_activation_days": 17.6,
            "recent_orders": list(self.orders.values())[-10:],
            "rejections": self.rejections[-10:],
            "active_escalations": [
                {
                    "escalation_id": "ESC-101",
                    "customer_name": "Modern Retailers Pvt Ltd",
                    "issue": "Building management optical duct access delay.",
                    "priority": "HIGH",
                    "status": "OPEN"
                }
            ]
        }

    def update_order_stage(self, order_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Allows sales person to update milestones or resolve escalations."""
        order = self.orders.get(order_id)
        if not order:
            return None

        if "newStatus" in updates and updates["newStatus"]:
            order["status"] = updates["newStatus"]
        if "stageIndex" in updates and updates["stageIndex"] is not None:
            idx = int(updates["stageIndex"])
            order["current_stage_index"] = idx
            for i, m in enumerate(order["milestones"]):
                m["completed"] = i <= idx

        order["updated_at"] = datetime.now().isoformat()
        return order


order_lifecycle_service = OrderLifecycleService()
