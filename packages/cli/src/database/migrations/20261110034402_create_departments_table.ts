import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("departments", (table) => {
      table.id();
      table.string("name");
      table.string("code", 32).unique();
      table.text("description").nullable();
      table.string("phone", 32).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("departments");
  },
});
