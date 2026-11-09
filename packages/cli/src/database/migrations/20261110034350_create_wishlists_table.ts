import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("wishlists", (table) => {
      table.id();
      table.foreignId("customer_id").constrained("customers").cascadeOnDelete();
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.timestamps();
      table.unique(["customer_id", "product_id"]);
    });
  },

  async down(schema) {
    await schema.drop("wishlists");
  },
});
