import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("leave_types", (table) => {
      table.id();
      table.string("name");
      table.string("code", 32).unique();
      table.integer("days_per_year").default(0);
      table.boolean("is_paid").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("leave_types");
  },
});
