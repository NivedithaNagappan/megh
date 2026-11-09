import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("cart_items", (table) => {
      table.id();
      table.foreignId("cart_id").constrained("carts").cascadeOnDelete();
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.foreignId("product_variant_id").constrained("product_variants").nullOnDelete();
      table.integer("quantity").default(1);
      table.decimal("price", 12, 2);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("cart_items");
  },
});
