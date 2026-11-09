import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("brands", (table) => {
      table.id();
      table.string("name");
      table.string("slug").unique();
      table.string("logo", 2048).nullable();
      table.text("description").nullable();
      table.string("website", 2048).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("brands");
  },
});
