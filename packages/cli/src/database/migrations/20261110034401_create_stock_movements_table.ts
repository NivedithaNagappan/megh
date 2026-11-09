import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("stock_movements", (table) => {
      table.id();
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.foreignId("outlet_id").constrained("outlets").nullOnDelete();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("type", 32); // in | out | adjustment | transfer | sale | purchase
      table.integer("quantity");
      table.string("reference", 64).nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("type");
    });
  },

  async down(schema) {
    await schema.drop("stock_movements");
  },
});
