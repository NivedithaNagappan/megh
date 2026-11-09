import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("amenities", (table) => {
      table.id();
      table.string("name");
      table.string("slug").unique();
      table.string("icon", 64).nullable();
      table.string("category", 64).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("amenities");
  },
});
