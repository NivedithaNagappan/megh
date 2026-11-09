import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("vehicles", (table) => {
      table.id();
      table.foreignId("warehouse_id").constrained("warehouses").nullOnDelete();
      table.string("plate_number", 32).unique();
      table.string("type", 32); // van | truck | bike | car | trailer
      table.string("make", 64).nullable();
      table.string("model", 64).nullable();
      table.integer("year").nullable();
      table.decimal("capacity_kg", 10, 2).nullable();
      table.string("status", 32).default("available"); // available | in_use | maintenance | retired
      table.timestamps();
      table.index("type");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("vehicles");
  },
});
