import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("product_variants", (table) => {
      table.id();
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.string("sku", 64).unique();
      table.string("name");
      table.decimal("price", 12, 2);
      table.integer("stock").default(0);
      table.json("options").nullable();
      table.string("image", 2048).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("product_variants");
  },
});
