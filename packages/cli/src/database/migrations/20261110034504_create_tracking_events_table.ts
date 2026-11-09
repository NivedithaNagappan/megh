import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("tracking_events", (table) => {
      table.id();
      table.foreignId("delivery_id").constrained("deliveries").cascadeOnDelete();
      table.string("status", 32);
      table.string("location").nullable();
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.timestamp("occurred_at");
      table.text("notes").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("tracking_events");
  },
});
