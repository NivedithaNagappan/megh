import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("rent_payments", (table) => {
      table.id();
      table.foreignId("lease_id").constrained("leases").cascadeOnDelete();
      table.decimal("amount", 12, 2);
      table.date("due_date");
      table.timestamp("paid_at").nullable();
      table.string("method", 32).nullable();
      table.string("reference", 64).nullable();
      table.string("status", 32).default("pending"); // pending | paid | late | partial | failed
      table.decimal("late_fee", 12, 2).default(0);
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("rent_payments");
  },
});
