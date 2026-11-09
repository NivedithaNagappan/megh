import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("roles", (table) => {
      table.id();
      table.string("name", 64).unique();
      table.string("slug", 64).unique();
      table.text("description").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("roles");
  },
});
