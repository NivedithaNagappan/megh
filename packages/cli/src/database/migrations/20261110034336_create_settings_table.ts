import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("settings", (table) => {
      table.id();
      table.string("name", 128).unique();
      table.text("value").nullable();
      table.string("group", 64).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("settings");
  },
});
