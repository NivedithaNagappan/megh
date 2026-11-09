import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("equipment", (table) => {
      table.id();
      table.foreignId("site_id").constrained("sites").nullOnDelete();
      table.string("name");
      table.string("code", 32).unique();
      table.string("category", 64).nullable();
      table.string("serial_number", 128).nullable();
      table.string("status", 32).default("available"); // available | in_use | maintenance | retired
      table.date("purchase_date").nullable();
      table.decimal("purchase_cost", 12, 2).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("equipment");
  },
});
