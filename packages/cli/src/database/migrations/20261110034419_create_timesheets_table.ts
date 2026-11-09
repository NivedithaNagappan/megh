import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("timesheets", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").cascadeOnDelete();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.foreignId("work_order_id").constrained("work_orders").nullOnDelete();
      table.date("date");
      table.decimal("hours", 5, 2);
      table.decimal("overtime_hours", 5, 2).default(0);
      table.string("status", 32).default("draft"); // draft | submitted | approved | rejected
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("timesheets");
  },
});
