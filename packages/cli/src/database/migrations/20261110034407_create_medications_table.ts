import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("medications", (table) => {
      table.id();
      table.string("name");
      table.string("generic_name").nullable();
      table.string("form", 32).nullable();
      table.string("strength", 64).nullable();
      table.string("manufacturer").nullable();
      table.decimal("price", 12, 2).nullable();
      table.integer("stock").default(0);
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("medications");
  },
});
