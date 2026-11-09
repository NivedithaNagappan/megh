import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("permissions", (table) => {
      table.id();
      table.string("name", 128).unique();
      table.string("group", 64).nullable();
      table.text("description").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("permissions");
  },
});
