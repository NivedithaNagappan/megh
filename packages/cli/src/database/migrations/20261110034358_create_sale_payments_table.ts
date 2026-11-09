import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("sale_payments", (table) => {
      table.id();
      table.foreignId("sale_id").constrained("sales").cascadeOnDelete();
      table.string("method", 32).default("cash");
      table.decimal("amount", 12, 2);
      table.string("reference", 64).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("sale_payments");
  },
});
