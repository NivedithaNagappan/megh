import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("maintenance_requests", (table) => {
      table.id();
      table.foreignId("unit_id").constrained("units").cascadeOnDelete();
      table.foreignId("tenant_id").constrained("tenants").nullOnDelete();
      table.string("title");
      table.text("description").nullable();
      table.string("priority", 16).default("low"); // low | normal | high | urgent
      table.string("status", 32).default("open"); // open | in_progress | resolved | closed
      table.timestamp("reported_at").nullable();
      table.timestamp("resolved_at").nullable();
      table.decimal("cost", 12, 2).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("maintenance_requests");
  },
});
