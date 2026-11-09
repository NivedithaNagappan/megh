import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("invoices", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").onDelete("restrict");
      table.foreignId("appointment_id").constrained("appointments").nullOnDelete();
      table.foreignId("insurance_id").constrained("insurances").nullOnDelete();
      table.string("number", 32).unique();
      table.decimal("subtotal", 12, 2).default(0);
      table.decimal("discount", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.decimal("paid_amount", 12, 2).default(0);
      table.string("status", 32).default("draft"); // draft | issued | paid | partially_paid | void
      table.timestamp("issued_at").nullable();
      table.date("due_date").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("invoices");
  },
});
