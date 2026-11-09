import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("change_orders", (table) => {
      table.id();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.foreignId("requested_by_id").constrained("users").nullOnDelete();
      table.string("number", 32).unique();
      table.string("title");
      table.text("description").nullable();
      table.decimal("amount", 12, 2);
      table.integer("days_impact").default(0);
      table.string("status", 32).default("draft"); // draft | submitted | approved | rejected
      table.timestamp("approved_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("change_orders");
  },
});
