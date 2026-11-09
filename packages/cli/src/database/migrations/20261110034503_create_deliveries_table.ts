import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("deliveries", (table) => {
      table.id();
      table.foreignId("warehouse_id").constrained("warehouses").nullOnDelete();
      table.foreignId("vehicle_id").constrained("vehicles").nullOnDelete();
      table.foreignId("driver_id").constrained("drivers").nullOnDelete();
      table.string("tracking_number", 64).unique();
      table.string("recipient_name");
      table.string("recipient_phone", 32);
      table.string("address_line1");
      table.string("address_line2").nullable();
      table.string("city", 100);
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100);
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.decimal("weight", 10, 3).nullable();
      table.string("status", 32).default("pending"); // pending | assigned | picked_up | in_transit | delivered | failed | returned
      table.timestamp("scheduled_at").nullable();
      table.timestamp("delivered_at").nullable();
      table.string("proof_url", 2048).nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("deliveries");
  },
});
