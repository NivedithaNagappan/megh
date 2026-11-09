import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("shipments", (table) => {
      table.id();
      table.foreignId("order_id").constrained("orders").cascadeOnDelete();
      table.string("carrier", 64).nullable();
      table.string("tracking_number", 128).nullable();
      table.string("status", 32).default("pending"); // pending | shipped | in_transit | delivered | returned
      table.timestamp("shipped_at").nullable();
      table.timestamp("delivered_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("shipments");
  },
});
