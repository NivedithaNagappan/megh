import { domain } from "../template";

export const logistics = domain("logistics", "Logistics", "Warehouses, vehicles, drivers and deliveries", [
  ["warehouse", "A warehouse or depot", ["name", "code", "address", "geo", "phone", "capacity?:integer", "is_active"]],
  [
    "vehicle",
    "A delivery vehicle",
    [
      "warehouse_id:nullOnDelete",
      "plate_number:string(32):unique",
      "type:in(van|truck|bike|car|trailer)",
      "make?:string(64)",
      "model?:string(64)",
      "year?:integer",
      "capacity_kg?:decimal(10,2)",
      "status:in(available|in_use|maintenance|retired)",
    ],
  ],
  [
    "driver",
    "A driver",
    [
      "user_id:nullOnDelete",
      "vehicle_id:nullOnDelete",
      "person",
      "phone:phone",
      "email?",
      "license_number:string(64):unique",
      "license_expires_at?:date",
      "status:in(available|on_trip|off_duty|inactive)",
    ],
  ],
  [
    "delivery",
    "A parcel or load to deliver",
    [
      "warehouse_id:nullOnDelete",
      "vehicle_id:nullOnDelete",
      "driver_id:nullOnDelete",
      "tracking_number:string(64):unique",
      "recipient_name:string",
      "recipient_phone:phone",
      "address",
      "geo",
      "weight",
      "status:in(pending|assigned|picked_up|in_transit|delivered|failed|returned)",
      "scheduled_at?:timestamp",
      "delivered_at?:timestamp",
      "proof_url?:url",
      "notes",
    ],
  ],
  [
    "tracking_event",
    "A status update of a delivery",
    ["delivery_id:cascade", "status:string(32)", "location?:string", "geo", "occurred_at:timestamp", "notes"],
  ],
]);
