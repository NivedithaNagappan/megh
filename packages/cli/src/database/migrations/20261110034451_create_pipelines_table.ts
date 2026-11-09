import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("pipelines", (table) => {
      table.id();
      table.string("name");
      table.boolean("is_default").default(false);
      table.integer("sort_order").default(0);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("pipelines");
  },
});
