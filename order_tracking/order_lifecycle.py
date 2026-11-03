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
        self.admin_messages: List[Dict[str, Any]] = []

        # Seed initial realistic orders (including S00060 from UI design)
        self._seed_initial_orders()

    def _seed_initial_orders(self):
        """Seeds realistic historical orders for Admin and User tracking."""
        s60_order = {
            "order_id": "S00060",
            "session_id": "session_s60",
            "customer_name": "Balaji Dental Care LLP",
            "business_type": "Dental Clinic",
            "status": "Order Confirm",
            "current_stage_index": 1,
            "bundle_code": "BUNDLE-PRIMARY",
            "bundle_name": "Micro Retail & Services Growth Suite",
            "monthly_cost": 2499.0,
            "contract_months": 12,
            "contract_terms": {
                "sla_uptime": "99.5% Standard Commercial Uptime SLA",
                "mttr_hours": 8,
                "billing_cycle": "Monthly Advance",
                "notice_period_days": 30
            },
            "milestones": [
                {
                    "stage": "PENDING",
                    "title": "Pending",
                    "description": "Your order is in review & verification",
                    "date_str": "Tue, May 21, 2024, 6:44:14 PM",
                    "completed": True,
                    "icon": "pending"
                },
                {
                    "stage": "CONFIRMED",
                    "title": "Order Confirm",
                    "description": "Your order has been verified & confirmed",
                    "date_str": "Thu, May 30, 2024, 9:42:58 AM",
                    "completed": True,
                    "icon": "confirm"
                },
                {
                    "stage": "PACKED",
                    "title": "Packed and Processed",
                    "description": "Hardware router & SIM kit dispatched",
                    "date_str": "Fri, May 31, 2024, 9:43:00 AM",
                    "completed": False,
                    "icon": "packed"
                },
                {
                    "stage": "DELIVERED",
                    "title": "Delivered",
                    "description": "Expected Delivery Date: Tue, Jun 04, 2024",
                    "date_str": "Expected: Jun 04, 2024",
                    "completed": False,
                    "icon": "delivered"
                }
            ],
            "created_at": "2024-05-21T18:44:14",
            "updated_at": "2024-05-30T09:42:58"
        }
        self.orders["S00060"] = s60_order

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
        Creates an accepted commercial order with 4 e-commerce stages matching Image 1.
        """
        order_num = f"S{str(len(self.orders) + 60).zfill(5)}"
        now = datetime.now()
        now_str = now.strftime("%a, %b %d, %Y, %I:%M:%S %p")

        profile = customer_schema or {}
        b_name = profile.get("business_name") or profile.get("contact_name") or "Enterprise Client"
        b_type = profile.get("business_type") or "Retail & Services"
        segment = profile.get("segment") or "Micro Retail & Services"

        if "Multi-site" in segment or "Manufacturing" in segment:
            sla_uptime = "99.9% High-Availability Mission-Critical SLA"
            mttr_hours = 4
        else:
            sla_uptime = "99.5% Standard Commercial Uptime SLA"
            mttr_hours = 8

        milestones = [
            {
                "stage": "PENDING",
                "title": "Pending",
                "description": "Your order is in review & verification",
                "date_str": now_str,
                "completed": True,
                "icon": "pending"
            },
            {
                "stage": "CONFIRMED",
                "title": "Order Confirm",
                "description": "Your order has been verified & confirmed",
                "date_str": "In verification",
                "completed": False,
                "icon": "confirm"
            },
            {
                "stage": "PACKED",
                "title": "Packed and Processed",
                "description": "Hardware router & SIM kit dispatched",
                "date_str": "Pending dispatch",
                "completed": False,
                "icon": "packed"
            },
            {
                "stage": "DELIVERED",
                "title": "Delivered",
                "description": f"Expected: {now.strftime('%b %d, %Y')} + 5 days",
                "date_str": "Scheduled",
                "completed": False,
                "icon": "delivered"
            }
        ]

        order = {
            "order_id": order_num,
            "session_id": session_id,
            "customer_name": b_name,
            "business_type": b_type,
            "status": "Pending",
            "current_stage_index": 0,
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
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

        self.orders[order_num] = order
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

    def get_all_orders(self) -> List[Dict[str, Any]]:
        """Returns all orders for the Admin dashboard."""
        return list(self.orders.values())

    def send_admin_message(
        self,
        session_id: str,
        customer_name: str,
        message: str,
        bundle_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """Allows Admin / Operations agent to message customer or send recommendations."""
        msg_record = {
            "message_id": f"MSG-{uuid.uuid4().hex[:6].upper()}",
            "session_id": session_id,
            "customer_name": customer_name,
            "message": message,
            "bundle_code": bundle_code,
            "sender": "Airtel Operations Admin",
            "timestamp": datetime.now().strftime("%I:%M %p")
        }
        self.admin_messages.append(msg_record)
        return {"success": True, "message": msg_record}

    def get_customer_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves messages sent by Admin to this customer session."""
        return [m for m in self.admin_messages if m.get("session_id") == session_id]

    def update_order_stage(self, order_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Allows admin/operations to update milestones, changing status in DB."""
        order = self.orders.get(order_id)
        if not order:
            return None

        # Map common status names to stage index
        status_to_idx = {
            "pending": 0,
            "order confirm": 1,
            "confirmed": 1,
            "packed and processed": 2,
            "packed": 2,
            "in progress": 2,
            "delivered": 3,
            "activated": 3
        }

        new_status = updates.get("newStatus") or updates.get("status")
        stage_idx = updates.get("stageIndex")

        if new_status:
            order["status"] = new_status
            if stage_idx is None:
                stage_idx = status_to_idx.get(new_status.lower(), 1)

        if stage_idx is not None:
            idx = int(stage_idx)
            order["current_stage_index"] = idx
            for i, m in enumerate(order["milestones"]):
                m["completed"] = i <= idx
                if i == idx and not m.get("date_str") or m.get("date_str") in ["In verification", "Pending dispatch"]:
                    m["date_str"] = datetime.now().strftime("%a, %b %d, %Y, %I:%M:%S %p")

        order["updated_at"] = datetime.now().isoformat()
        return order


order_lifecycle_service = OrderLifecycleService()
