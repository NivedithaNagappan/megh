import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("purchase_items", (table) => {
      table.id();
      table.foreignId("purchase_id").constrained("purchases").cascadeOnDelete();
      table.foreignId("product_id").constrained("products").onDelete("restrict");
      table.integer("quantity");
      table.decimal("unit_cost", 12, 2);
      table.decimal("total", 12, 2).default(0);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("purchase_items");
  },
});
