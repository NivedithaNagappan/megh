import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("payrolls", (table) => {
      table.id();
      table.foreignId("employee_id").constrained("employees").onDelete("restrict");
      table.date("period_start");
      table.date("period_end");
      table.decimal("basic_salary", 12, 2);
      table.decimal("allowances", 12, 2).default(0);
      table.decimal("deductions", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("net_pay", 12, 2);
      table.string("status", 32).default("draft"); // draft | approved | paid
      table.timestamp("paid_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("payrolls");
  },
});
