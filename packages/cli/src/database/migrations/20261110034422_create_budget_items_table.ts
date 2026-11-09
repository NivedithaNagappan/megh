import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("budget_items", (table) => {
      table.id();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.string("category", 64);
      table.text("description").nullable();
      table.decimal("budgeted_amount", 12, 2);
      table.decimal("actual_amount", 12, 2).default(0);
      table.text("notes").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("budget_items");
  },
});
