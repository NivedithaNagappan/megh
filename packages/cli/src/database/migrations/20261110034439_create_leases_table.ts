import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("leases", (table) => {
      table.id();
      table.foreignId("unit_id").constrained("units").onDelete("restrict");
      table.foreignId("tenant_id").constrained("tenants").onDelete("restrict");
      table.date("start_date");
      table.date("end_date");
      table.decimal("rent_amount", 12, 2);
      table.decimal("deposit_amount", 12, 2).default(0);
      table.integer("billing_day").default(1);
      table.string("status", 32).default("draft"); // draft | active | ended | terminated
      table.text("terms").nullable();
      table.timestamp("signed_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("leases");
  },
});
