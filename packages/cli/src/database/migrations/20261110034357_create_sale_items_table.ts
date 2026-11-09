import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("sale_items", (table) => {
      table.id();
      table.foreignId("sale_id").constrained("sales").cascadeOnDelete();
      table.foreignId("product_id").constrained("products").nullOnDelete();
      table.string("name");
      table.integer("quantity").default(1);
      table.decimal("price", 12, 2);
      table.decimal("discount", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("sale_items");
  },
});
