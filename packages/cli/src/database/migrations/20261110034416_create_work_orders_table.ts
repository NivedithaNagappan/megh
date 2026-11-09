import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("work_orders", (table) => {
      table.id();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.foreignId("site_id").constrained("sites").nullOnDelete();
      table.foreignId("contractor_id").constrained("contractors").nullOnDelete();
      table.foreignId("assigned_to_id").constrained("users").nullOnDelete();
      table.string("title");
      table.text("description").nullable();
      table.string("priority", 16).default("low"); // low | normal | high | urgent
      table.string("status", 32).default("open"); // open | in_progress | on_hold | completed | cancelled
      table.date("due_date").nullable();
      table.timestamp("completed_at").nullable();
      table.decimal("estimated_cost", 12, 2).nullable();
      table.decimal("actual_cost", 12, 2).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("work_orders");
  },
});
