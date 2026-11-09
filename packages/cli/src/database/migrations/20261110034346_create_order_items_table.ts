import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("order_items", (table) => {
      table.id();
      table.foreignId("order_id").constrained("orders").cascadeOnDelete();
      table.foreignId("product_id").constrained("products").nullOnDelete();
      table.foreignId("product_variant_id").constrained("product_variants").nullOnDelete();
      table.string("name");
      table.string("sku", 64).nullable();
      table.integer("quantity").default(1);
      table.decimal("price", 12, 2);
      table.decimal("discount", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("order_items");
  },
});
