import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("categories", (table) => {
      table.id();
      table.foreignId("parent_id").constrained("categories").nullOnDelete();
      table.string("name");
      table.string("slug").unique();
      table.text("description").nullable();
      table.string("image", 2048).nullable();
      table.integer("sort_order").default(0);
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("categories");
  },
});
