import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("product_tags", (table) => {
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.foreignId("tag_id").constrained("tags").cascadeOnDelete();
      table.primary(["product_id", "tag_id"]);
    });
  },

  async down(schema) {
    await schema.drop("product_tags");
  },
});
