import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("tags", (table) => {
      table.id();
      table.string("name", 64);
      table.string("slug", 64).unique();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("tags");
  },
});
