import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("reviews", (table) => {
      table.id();
      table.foreignId("product_id").constrained("products").cascadeOnDelete();
      table.foreignId("customer_id").constrained("customers").nullOnDelete();
      table.integer("rating").default(0);
      table.string("title").nullable();
      table.text("comment").nullable();
      table.boolean("is_approved").default(false);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("reviews");
  },
});
