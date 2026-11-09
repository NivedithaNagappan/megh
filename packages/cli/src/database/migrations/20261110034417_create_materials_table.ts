import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("materials", (table) => {
      table.id();
      table.string("name");
      table.string("sku", 64).unique();
      table.string("unit", 16);
      table.decimal("unit_cost", 12, 2);
      table.decimal("quantity_on_hand", 12, 3).default(0);
      table.decimal("reorder_level", 12, 3).nullable();
      table.string("supplier").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("materials");
  },
});
