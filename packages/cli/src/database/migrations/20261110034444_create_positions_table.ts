import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("positions", (table) => {
      table.id();
      table.foreignId("department_id").constrained("departments").nullOnDelete();
      table.string("title");
      table.text("description").nullable();
      table.decimal("min_salary", 12, 2).nullable();
      table.decimal("max_salary", 12, 2).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("positions");
  },
});
