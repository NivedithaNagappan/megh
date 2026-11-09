import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("products", (table) => {
      table.id();
      table.foreignId("category_id").constrained("categories").nullOnDelete();
      table.foreignId("brand_id").constrained("brands").nullOnDelete();
      table.string("name");
      table.string("slug").unique();
      table.string("sku", 64).unique();
      table.text("description").nullable();
      table.decimal("price", 12, 2);
      table.decimal("compare_at_price", 12, 2).nullable();
      table.decimal("cost", 12, 2).nullable();
      table.integer("stock").default(0);
      table.decimal("weight", 10, 3).nullable();
      table.string("status", 32).default("draft"); // draft | active | archived
      table.boolean("is_featured").default(false);
      table.timestamps();
      table.softDeletes();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("products");
  },
});
